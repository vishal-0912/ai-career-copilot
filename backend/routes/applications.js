const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

const VALID_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
// Only these represent the candidate actually having applied — 'rejected' can be reached
// directly from an untracked/saved job (e.g. "not interested"), which shouldn't backdate
// an "Applied" date that never happened.
const APPLIED_STATUSES = ['applied', 'interviewing', 'offer'];

// Finds the most recently generated document of a given type for this user+job, if any —
// so tracking an application auto-links whichever tailored resume/cover letter was last
// downloaded for it, without the user having to attach it manually.
async function findLatestDocumentId(userId, jobId, type) {
  const { data, error } = await supabase
    .from('generated_documents')
    .select('id')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`Could not look up latest ${type} document:`, error.message);
    return null;
  }
  return data?.id ?? null;
}

// POST /api/applications  { userId, jobId, status, notes? }
// Upserts the tracking status for a job. applied_at is set the first time status moves
// past 'saved' and never overwritten after that, so it always reflects when the user
// actually applied, not the last time they touched the row.
router.post('/', async (req, res) => {
  const { userId, jobId, status, notes } = req.body;

  if (!userId || !jobId) {
    return res.status(400).json({ error: 'userId and jobId are required' });
  }
  const nextStatus = status || 'saved';
  if (!VALID_STATUSES.includes(nextStatus)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('applications')
      .select('id, applied_at')
      .eq('user_id', userId)
      .eq('job_id', jobId)
      .maybeSingle();
    if (existingError) throw new Error(`Could not check existing application: ${existingError.message}`);

    const appliedAt =
      existing?.applied_at ?? (APPLIED_STATUSES.includes(nextStatus) ? new Date().toISOString() : null);

    const [resumeDocumentId, coverLetterDocumentId] = await Promise.all([
      findLatestDocumentId(userId, jobId, 'resume'),
      findLatestDocumentId(userId, jobId, 'cover_letter'),
    ]);

    const { data, error } = await supabase
      .from('applications')
      .upsert(
        {
          user_id: userId,
          job_id: jobId,
          status: nextStatus,
          notes: notes ?? null,
          applied_at: appliedAt,
          resume_document_id: resumeDocumentId,
          cover_letter_document_id: coverLetterDocumentId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,job_id' }
      )
      .select()
      .single();
    if (error) throw error;

    res.json({ application: data });
  } catch (err) {
    console.error('applications/create failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to update application status' });
  }
});

// GET /api/applications?userId=...
// Returns every job this user is tracking, most recently updated first, joined with the
// job's own title/company/location/link so the frontend doesn't need a second round trip.
router.get('/', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const { data, error } = await supabase
      .from('applications')
      .select(
        'id, job_id, status, notes, applied_at, updated_at, resume_document_id, cover_letter_document_id, job:jobs(id, title, company, location, jd_url, source)'
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;

    res.json({ applications: data ?? [] });
  } catch (err) {
    console.error('applications/list failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to load applications' });
  }
});

// PATCH /api/applications/:id  { userId, status?, notes? }
// userId is required here too (not just for creation) — the backend runs on the service
// role key, which bypasses RLS, so this check is what actually stops one user from editing
// another user's tracked application.
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { userId, status, notes } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const { data: existing, error: existingError } = await supabase
      .from('applications')
      .select('id, job_id, applied_at')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) throw new Error(`Could not load application: ${existingError.message}`);
    if (!existing) return res.status(404).json({ error: 'Application not found' });

    const update = { updated_at: new Date().toISOString() };
    if (status) {
      update.status = status;
      if (!existing.applied_at && APPLIED_STATUSES.includes(status)) {
        update.applied_at = new Date().toISOString();
      }

      // Re-derive document links on every status change, same as the POST handler —
      // otherwise a resume/cover letter generated after this application already existed
      // never gets picked up when the status is only ever changed from this tab.
      const [resumeDocumentId, coverLetterDocumentId] = await Promise.all([
        findLatestDocumentId(userId, existing.job_id, 'resume'),
        findLatestDocumentId(userId, existing.job_id, 'cover_letter'),
      ]);
      update.resume_document_id = resumeDocumentId;
      update.cover_letter_document_id = coverLetterDocumentId;
    }
    if (notes !== undefined) update.notes = notes;

    const { data, error } = await supabase
      .from('applications')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;

    res.json({ application: data });
  } catch (err) {
    console.error('applications/update failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to update application' });
  }
});

module.exports = router;
