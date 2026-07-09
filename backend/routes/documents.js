const express = require('express');
const { supabase } = require('../lib/supabase');
const { tailorResumeWithScoring } = require('../lib/tailorResume');
const { renderResumeDocx } = require('../lib/renderResumeDocx');
const { generateCoverLetterBody } = require('../lib/claude');
const { renderCoverLetterDocx } = require('../lib/renderCoverLetterDocx');

const router = express.Router();

// Shared lookups both endpoints need: the job being applied to, and the user's
// latest profile + original resume text.
async function loadJobAndProfile(userId, jobId) {
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, title, company, jd_text')
    .eq('id', jobId)
    .single();
  if (jobError) throw new Error(`Job not found: ${jobError.message}`);

  const { data: profile, error: profileError } = await supabase
    .from('candidate_profiles')
    .select('resume_id, full_name, email, phone, summary, skills')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load profile: ${profileError.message}`);
  if (!profile) throw new Error('No AI career profile found for this user — upload a resume first');

  const { data: resume, error: resumeError } = await supabase
    .from('resumes')
    .select('raw_text')
    .eq('id', profile.resume_id)
    .single();
  if (resumeError) throw new Error(`Could not load original resume text: ${resumeError.message}`);

  return { job, profile, resumeText: resume.raw_text };
}

async function uploadAndSign(userId, filename, buffer) {
  const path = `${userId}/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from('generated-docs')
    .upload(path, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: signed, error: signError } = await supabase.storage
    .from('generated-docs')
    .createSignedUrl(path, 3600);
  if (signError) throw new Error(`Could not create download link: ${signError.message}`);

  return { path, signedUrl: signed.signedUrl };
}

// Looks for a document already generated for this exact user+job+type. Storage paths
// don't expire but signed URLs do (1hr), so a cache hit still needs a fresh signed URL —
// that's cheap (no Claude/embedding calls), unlike the generation path it's replacing.
async function findExisting(userId, jobId, type) {
  const { data, error } = await supabase
    .from('generated_documents')
    .select('file_url, ats_score, iteration_count')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not check for existing document: ${error.message}`);
  if (!data) return null;

  const { data: signed, error: signError } = await supabase.storage
    .from('generated-docs')
    .createSignedUrl(data.file_url, 3600);
  if (signError) throw new Error(`Could not re-sign existing document: ${signError.message}`);

  return { ...data, signedUrl: signed.signedUrl };
}

// POST /api/documents/resume  { userId, jobId, regenerate? }
// Tailors the candidate's real resume against this specific job, rescoring up to 3 times
// (see lib/tailorResume.js), renders the winning attempt to DOCX, and returns a download link.
// Reuses a previously generated resume for the same user+job unless regenerate:true is sent —
// each generation costs several Claude calls, so repeat clicks shouldn't repeat that cost.
router.post('/resume', async (req, res) => {
  const { userId, jobId, regenerate } = req.body;
  if (!userId || !jobId) {
    return res.status(400).json({ error: 'userId and jobId are required' });
  }

  try {
    if (!regenerate) {
      const existing = await findExisting(userId, jobId, 'resume');
      if (existing) {
        return res.json({
          fileUrl: existing.signedUrl,
          atsScore: existing.ats_score,
          iterations: existing.iteration_count,
          cached: true,
        });
      }
    }

    const { job, profile, resumeText } = await loadJobAndProfile(userId, jobId);

    const { resume, atsScore, iterations, scoreBreakdown } = await tailorResumeWithScoring({
      resumeText,
      jdTitle: job.title,
      jdCompany: job.company,
      jdText: job.jd_text,
    });

    const buffer = await renderResumeDocx(resume, {
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
    });

    const { path, signedUrl } = await uploadAndSign(userId, `resume-${jobId}-${Date.now()}.docx`, buffer);

    await supabase.from('generated_documents').insert({
      user_id: userId,
      job_id: jobId,
      type: 'resume',
      file_url: path,
      ats_score: atsScore,
      iteration_count: iterations,
    });

    res.json({
      fileUrl: signedUrl,
      atsScore,
      iterations,
      missingKeywords: scoreBreakdown.missingKeywords,
      cached: false,
    });
  } catch (err) {
    console.error('documents/resume failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to generate tailored resume' });
  }
});

// POST /api/documents/cover-letter  { userId, jobId, regenerate? }
router.post('/cover-letter', async (req, res) => {
  const { userId, jobId, regenerate } = req.body;
  if (!userId || !jobId) {
    return res.status(400).json({ error: 'userId and jobId are required' });
  }

  try {
    if (!regenerate) {
      const existing = await findExisting(userId, jobId, 'cover_letter');
      if (existing) {
        return res.json({ fileUrl: existing.signedUrl, cached: true });
      }
    }

    const { job, profile } = await loadJobAndProfile(userId, jobId);

    const body = await generateCoverLetterBody({
      candidateName: profile.full_name,
      candidateSummary: profile.summary,
      candidateSkills: profile.skills,
      jdTitle: job.title,
      jdCompany: job.company,
      jdText: job.jd_text,
    });

    const buffer = await renderCoverLetterDocx({
      body,
      candidateName: profile.full_name,
      jdTitle: job.title,
      jdCompany: job.company,
    });

    const { path, signedUrl } = await uploadAndSign(
      userId,
      `cover-letter-${jobId}-${Date.now()}.docx`,
      buffer
    );

    await supabase.from('generated_documents').insert({
      user_id: userId,
      job_id: jobId,
      type: 'cover_letter',
      file_url: path,
    });

    res.json({ fileUrl: signedUrl, cached: false });
  } catch (err) {
    console.error('documents/cover-letter failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to generate cover letter' });
  }
});

module.exports = router;
