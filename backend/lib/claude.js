const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function stripJsonFences(raw) {
  return raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
}

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

  return JSON.parse(stripJsonFences(message.content[0].text));
}

const JOB_EXTRACTION_PROMPT = `You are extracting a structured job posting from raw webpage text.
This text was scraped from a job listing page, so it will contain leftover site navigation,
cookie banners, and other noise mixed in with the real posting — ignore all of that noise.

Return ONLY a JSON object (no markdown, no commentary) with this exact shape:

{
  "title": "job title",
  "company": "company name, or null if you truly cannot find it",
  "location": "location, or null if not stated",
  "salary_min": <number or null, in the currency/units as stated>,
  "salary_max": <number or null>,
  "jd_text": "the actual job description text: responsibilities, requirements, qualifications — preserve the real wording, don't summarize or paraphrase it away",
  "employment_type": "e.g. Full-time, Contract, Internship, or null if not stated"
}

If the page clearly is not a job posting at all (e.g. it's a login wall, an error page, or unrelated
content), return exactly {"error": "not a job posting"} instead of the shape above.

PAGE TEXT:
"""
{{PAGE_TEXT}}
"""`;

async function extractJobFromText(pageText) {
  const prompt = JOB_EXTRACTION_PROMPT.replace('{{PAGE_TEXT}}', pageText);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return JSON.parse(stripJsonFences(message.content[0].text));
}

module.exports = { extractCandidateProfile, extractJobFromText };
