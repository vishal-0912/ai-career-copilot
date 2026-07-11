// Deterministic ATS scorer — deliberately NOT an LLM call. The tailoring loop in
// tailorResume.js asks Claude to rewrite the resume, but the score that decides
// whether another iteration is needed comes from here: plain keyword-overlap and
// formatting checks, same category of heuristic real ATS parsers use. This is what
// makes "climbed to 90%" a verifiable claim instead of the model grading its own work.

const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been
  before being below between both but by can't cannot could couldn't did didn't do does
  doesn't doing don't down during each few for from further had hadn't has hasn't have
  haven't having he he'd he'll he's her here here's hers herself him himself his how
  how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most
  mustn't my myself no nor not of off on once only or other ought our ours ourselves out
  over own same shan't she she'd she'll she's should shouldn't so some such than that
  that's the their theirs them themselves then there there's these they they'd they'll
  they're they've this those through to too under until up very was wasn't we we'd we'll
  we're we've were weren't what what's when when's where where's which while who who's
  whom why why's with won't would wouldn't you you'd you'll you're you've your yours
  yourself yourselves also using use used etc will may must within across per big plus
  ideal growing looking join team role company years year experience work working
  ability skills required requirements preferred strong good excellent great solid`
    .split(/\s+/)
    .filter(Boolean)
);

// Matches words, and tech tokens with internal punctuation like "C++", "Node.js", "CI/CD".
const TOKEN_RE = /[a-zA-Z][a-zA-Z0-9+#./-]{1,}/g;

function tokenize(text) {
  return (text || '').toLowerCase().match(TOKEN_RE) || [];
}

// Deliberately crude suffix-stripping, not a real stemmer — just enough to stop
// "testing" vs "tested" vs "test" from counting as a miss. Irregular verbs (build/built)
// won't collapse, which is a known, acceptable limitation of doing this without a
// dictionary; real ATS keyword matchers are frequently this literal too.
function stem(word) {
  if (word.length > 5 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Pulls the JD's most frequent, non-generic terms as the "target keywords" a
// well-tailored resume should reasonably contain.
function extractKeywords(jdText, topN = 30) {
  const counts = new Map();

  for (const token of tokenize(jdText)) {
    const clean = token.replace(/^[./-]+|[./-]+$/g, ''); // trim stray leading/trailing punctuation
    if (clean.length < 3) continue;
    if (STOPWORDS.has(clean)) continue;
    if (/^\d+$/.test(clean)) continue; // skip pure numbers (years, salary figures, etc.)
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([word]) => word);
}

// Builds a stem-set from resume text once, so matching N keywords against it is O(N)
// lookups instead of N regex scans over the whole resume.
function buildStemSet(text) {
  return new Set(tokenize(text).map(stem));
}

const SECTION_HEADERS = [
  /\b(work\s+)?experience\b/i,
  /\beducation\b/i,
  /\bskills\b/i,
  /\bprojects\b/i,
];

function formattingScore(resumeText) {
  const found = SECTION_HEADERS.filter((re) => re.test(resumeText)).length;
  return Math.round((found / SECTION_HEADERS.length) * 100);
}

// Returns a 0-100 score plus the matched/missing keyword breakdown — the missing
// list is what the tailoring loop feeds back into the next Claude retry.
function scoreResume(resumeText, jdText) {
  const jdKeywords = extractKeywords(jdText);
  const resumeStems = buildStemSet(resumeText);

  const matchedKeywords = jdKeywords.filter((kw) => resumeStems.has(stem(kw)));
  const missingKeywords = jdKeywords.filter((kw) => !matchedKeywords.includes(kw));

  const keywordScorePct = jdKeywords.length
    ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
    : 100; // no extractable keywords (very short JD) — don't penalize for that

  const formatScorePct = formattingScore(resumeText);

  const score = Math.max(
    0,
    Math.min(100, Math.round(keywordScorePct * 0.8 + formatScorePct * 0.2))
  );

  return {
    score,
    keywordScore: keywordScorePct,
    formattingScore: formatScorePct,
    matchedKeywords,
    missingKeywords,
    totalKeywords: jdKeywords.length,
  };
}

module.exports = { scoreResume, extractKeywords };
