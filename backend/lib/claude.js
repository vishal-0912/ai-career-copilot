const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function stripJsonFences(raw) {
  return raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
}

const PROFILE_EXTRACTION_PROMPT = `You are extracting a structured career profile from a resume.
Read the resume text below and return ONLY a JSON object (no markdown, no commentary) with this exact shape:

{
  "full_name": "the candidate's full name as it appears on the resume, or null if not found",
  "email": "the candidate's email address, or null if not found",
  "phone": "the candidate's phone number as written, or null if not found",
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

const TAILOR_RESUME_PROMPT = `You are tailoring a candidate's resume for a specific job posting.
You will rewrite/reorganize their REAL resume content to better match the job description —
you are NOT allowed to invent employers, job titles, dates, degrees, projects, certifications,
or skills that aren't genuinely evidenced in their original resume. This is a hard rule:
fabrication makes the resume dishonest and is worse than a lower ATS score.

Return ONLY a JSON object (no markdown, no commentary) with this exact shape:

{
  "headline": "a one-line professional title for the top of the resume, e.g. 'Frontend Engineer | React.js | Next.js | TypeScript' — see headline rules below",
  "summary": "2-4 sentence professional summary tailored to this role, using only truthful claims",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "title": "job title as held",
      "company": "company name",
      "dates": "e.g. Jan 2022 - Present",
      "bullets": ["achievement/responsibility bullet, rewritten to surface relevant keywords where truthfully applicable", "..."]
    }
  ],
  "projects": [
    {
      "name": "project name, exactly as in the original resume",
      "context": "short context line, e.g. 'Company Internal Tool | React.js, Axios, REST APIs' — omit if the original doesn't state one",
      "bullets": ["project bullet, rewritten to surface relevant keywords where truthfully applicable", "..."]
    }
  ],
  "certifications": ["certification name exactly as in the original resume, ..."],
  "education": [
    { "degree": "degree name", "school": "school name", "dates": "e.g. 2018 - 2022" }
  ]
}

Headline rules (this is a distinct, required field — do not fold it into summary or skip it):
- The headline is the job-title line that sits directly under the candidate's name. Real ATS
  systems and recruiters weight this line heavily, so it must not be left out.
- Base it on the JOB TITLE below, rewritten only as far as the candidate's real, evidenced
  experience genuinely supports it. If the candidate has truly done this job (even under a
  slightly different internal title), it is honest to present the headline in the JD's own
  terminology — that is normal, expected resume practice, not fabrication.
- If the JD's title is not honestly supported by the candidate's real background, use the closest
  truthful title from their actual experience instead of the JD's title verbatim.
- Never invent seniority, a specialization, or domain experience the resume doesn't evidence.

Rules:
- Preserve every real job, degree, skill, project, and certification from the original resume —
  do not drop entries. If the original resume lists projects or certifications, they MUST appear
  in the "projects" / "certifications" fields above — never silently omit them.
- For each real project, rewrite its bullets (not just restate them) to surface relevant,
  truthful keywords from the job description — projects are a legitimate place to add ATS
  keyword coverage without touching the experience section.
- Where the job description uses specific terminology the candidate's real experience genuinely
  supports (even if the original resume phrased it differently), use the JD's terminology.
- Do not add skills, tools, achievements, projects, or certifications that aren't backed by the
  original resume text.
- If the original resume has no projects or no certifications, return an empty array for that
  field rather than inventing any.
- Return valid JSON only.
{{FEEDBACK_BLOCK}}
ORIGINAL RESUME TEXT:
"""
{{RESUME_TEXT}}
"""

JOB TITLE: {{JD_TITLE}}
COMPANY: {{JD_COMPANY}}

JOB DESCRIPTION:
"""
{{JD_TEXT}}
"""`;

// feedback is an optional array of keywords the previous attempt missed — passed back in on
// retry iterations so Claude knows specifically what to try to (truthfully) work in.
async function tailorResumeContent({ resumeText, jdTitle, jdCompany, jdText, feedback }) {
  const feedbackBlock = feedback?.length
    ? `\nThe previous attempt scored below target. If any of these terms are genuinely supported by the candidate's real experience, work them in naturally. If they are NOT truthfully applicable, leave them out rather than fabricating — a lower score is fine, dishonesty is not: ${feedback.join(', ')}\n`
    : '\n';

  const prompt = TAILOR_RESUME_PROMPT.replace('{{FEEDBACK_BLOCK}}', feedbackBlock)
    .replace('{{RESUME_TEXT}}', resumeText)
    .replace('{{JD_TITLE}}', jdTitle || 'Not specified')
    .replace('{{JD_COMPANY}}', jdCompany || 'Not specified')
    .replace('{{JD_TEXT}}', jdText || '');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return JSON.parse(stripJsonFences(message.content[0].text));
}

const COVER_LETTER_PROMPT = `Write a personalized cover letter for this candidate applying to this role.
Return ONLY the letter body text — no JSON, no markdown, no subject line, no "Dear Hiring Manager"
salutation or "Sincerely" sign-off (those are added separately). 3-4 paragraphs: an opening that
names the role and company, 1-2 paragraphs connecting the candidate's real, genuine experience to
what the job needs, and a brief closing. Do not invent experience the candidate doesn't have.

CANDIDATE NAME: {{CANDIDATE_NAME}}
CANDIDATE BACKGROUND:
"""
{{CANDIDATE_SUMMARY}}
"""
CANDIDATE SKILLS: {{CANDIDATE_SKILLS}}

JOB TITLE: {{JD_TITLE}}
COMPANY: {{JD_COMPANY}}
JOB DESCRIPTION:
"""
{{JD_TEXT}}
"""`;

async function generateCoverLetterBody({ candidateName, candidateSummary, candidateSkills, jdTitle, jdCompany, jdText }) {
  const prompt = COVER_LETTER_PROMPT.replace('{{CANDIDATE_NAME}}', candidateName || 'the candidate')
    .replace('{{CANDIDATE_SUMMARY}}', candidateSummary || '')
    .replace('{{CANDIDATE_SKILLS}}', (candidateSkills || []).join(', '))
    .replace('{{JD_TITLE}}', jdTitle || 'Not specified')
    .replace('{{JD_COMPANY}}', jdCompany || 'Not specified')
    .replace('{{JD_TEXT}}', jdText || '');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

module.exports = {
  extractCandidateProfile,
  extractJobFromText,
  tailorResumeContent,
  generateCoverLetterBody,
};
