const express = require('express');
const { extractTextFromUrl } = require('../lib/extractText');
const { extractCandidateProfile } = require('../lib/claude');
const { embedText } = require('../lib/embeddings');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// POST /api/resume/process
// body: { resumeId, userId, fileUrl }
// Extracts text -> Claude structured profile -> embedding -> saves candidate_profiles row
router.post('/process', async (req, res) => {
  const { resumeId, userId, fileUrl, fileName } = req.body;

  if (!resumeId || !userId || !fileUrl) {
    return res.status(400).json({ error: 'resumeId, userId, and fileUrl are required' });
  }

  try {
    // 1. Extract raw text
    const rawText = await extractTextFromUrl(fileUrl, fileName);
    await supabase.from('resumes').update({ raw_text: rawText }).eq('id', resumeId);

    // 2. Ask Claude for the structured profile (now includes contact info — needed for
    // the Day 3 resume DOCX header, not just matching)
    const profile = await extractCandidateProfile(rawText);

    // 3. Embed a compact representation for matching later
    const embeddingInput = [
      profile.summary,
      profile.skills.join(', '),
      profile.job_titles.join(', '),
    ].join('\n');
    const embedding = await embedText(embeddingInput);

    // 4. Save the candidate profile
    const { data, error } = await supabase
      .from('candidate_profiles')
      .insert({
        user_id: userId,
        resume_id: resumeId,
        full_name: profile.full_name ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        skills: profile.skills,
        job_titles: profile.job_titles,
        keywords: profile.keywords,
        years_experience: profile.years_experience,
        summary: profile.summary,
        raw_json: profile,
        embedding,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ candidateProfile: data });
  } catch (err) {
    console.error('resume/process failed:', err);
    res.status(500).json({ error: err.message ?? 'Failed to process resume' });
  }
});

module.exports = router;
