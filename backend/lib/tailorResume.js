const { tailorResumeContent } = require('./claude');
const { scoreResume } = require('./atsScorer');

const TARGET_SCORE = 90;
const MAX_ITERATIONS = 3;

// Flattens the structured resume JSON Claude returns into plain text, so the
// deterministic scorer (which just wants text) can grade it the same way it
// would grade any resume.
function flattenResumeText(resume) {
  const parts = [resume.headline, resume.summary, (resume.skills || []).join(', ')];

  for (const job of resume.experience || []) {
    parts.push(`${job.title || ''} ${job.company || ''} ${job.dates || ''}`);
    parts.push(...(job.bullets || []));
  }

  parts.push('Experience'); // the section headers themselves live in the DOCX template,
  parts.push('Education');  // not in this JSON — add them so formattingScore() can see them
  parts.push('Skills');

  // Projects/certifications carry real, truthful keyword surface too (see claude.js prompt) —
  // they need to count toward the score or the tailoring loop has no incentive to keep them.
  if (resume.projects?.length) parts.push('Projects');
  for (const project of resume.projects || []) {
    parts.push(`${project.name || ''} ${project.context || ''}`);
    parts.push(...(project.bullets || []));
  }

  if (resume.certifications?.length) {
    parts.push('Certifications');
    parts.push(resume.certifications.join(', '));
  }

  for (const edu of resume.education || []) {
    parts.push(`${edu.degree || ''} ${edu.school || ''} ${edu.dates || ''}`);
  }

  return parts.filter(Boolean).join('\n');
}

// Runs the tailor → score → (maybe) retry loop. Returns the best attempt seen across
// all iterations (not necessarily the last one — an earlier pass could score higher),
// along with the score breakdown and how many iterations it took.
async function tailorResumeWithScoring({ resumeText, jdTitle, jdCompany, jdText }) {
  let feedback = undefined;
  let best = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const tailored = await tailorResumeContent({
      resumeText,
      jdTitle,
      jdCompany,
      jdText,
      feedback,
    });

    const flatText = flattenResumeText(tailored);
    const scoreResult = scoreResume(flatText, jdText);

    if (!best || scoreResult.score > best.scoreResult.score) {
      best = { resume: tailored, scoreResult, iteration };
    }

    if (scoreResult.score >= TARGET_SCORE) break;
    feedback = scoreResult.missingKeywords;
  }

  return {
    resume: best.resume,
    atsScore: best.scoreResult.score,
    scoreBreakdown: best.scoreResult,
    iterations: best.iteration,
  };
}

module.exports = { tailorResumeWithScoring, flattenResumeText };
