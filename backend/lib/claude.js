const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROFILE_EXTRACTION_PROMPT = `You are extracting a structured career profile from a resume.
Read the resume text below and return ONLY a JSON object (no markdown, no commentary) with this exact shape:

{
  "summary": "one paragraph, third person, summarizing the candidate's background and strengths",
  "skills": ["skill1", "skill2", ...],
  "job_titles": ["most relevant target job titles based on their experience"],
  "keywords": ["ATS-relevant keywords pulled directly from the resume: tools, technologies, methodologies, certifications"],
  "years_experience": <number, best estimate, or null if unclear>
}

Rules:
- Only include skills/keywords that are actually evidenced in the resume text. Do not invent anything.
- job_titles should be titles the candidate is qualified for based on their actual experience, not aspirational titles they've never held or been adjacent to.
- Return valid JSON only.

RESUME TEXT:
"""
{{RESUME_TEXT}}
"""`;

async function extractCandidateProfile(resumeText) {
  const prompt = PROFILE_EXTRACTION_PROMPT.replace('{{RESUME_TEXT}}', resumeText);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();
  // Strip accidental markdown code fences if the model adds them
  const jsonText = raw.replace(/^```json\s*/i, '').replace(/```$/, '');

  return JSON.parse(jsonText);
}

module.exports = { extractCandidateProfile };
