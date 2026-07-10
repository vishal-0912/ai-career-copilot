# AI Career Copilot

Upload a resume, get an AI-extracted career profile, browse a job feed matched to that
profile by semantic similarity, import any job posting by URL, and download resumes and
cover letters that Claude tailors to each specific listing — iterating automatically
until a deterministic ATS score clears a target threshold. Track every job you apply to
through a simple status pipeline (Saved → Applied → Interviewing → Offer / Rejected).

Built as a 4-day solo hackathon project. Frontend on Vercel, backend on Render, Supabase
for auth/database/storage.

## Features

- **Auth** — email/password and Google OAuth via Supabase Auth
- **Resume upload → AI profile** — upload a PDF/DOCX resume; Claude extracts a structured
  profile (summary, skills, target job titles, ATS keywords, years of experience, contact
  info) and the app embeds it for matching
- **Job feed** — pulls listings from Adzuna and JSearch (RapidAPI), ranks them against
  your profile by cosine similarity over Voyage embeddings (pgvector), shown as a match %
- **Import by URL** — paste one or more job posting URLs (LinkedIn, Naukri, a company
  careers page, anything) and Claude extracts a structured job posting from the scraped
  page text
- **Tailored resume generation** — Claude rewrites your real resume (never fabricates
  experience) to better match a specific job description, rescoring against a
  deterministic ATS scorer up to 3 times and keeping the best-scoring attempt; rendered
  to a real `.docx` file
- **Cover letter generation** — a personalized cover letter per job, also rendered to
  `.docx`
- **Document caching** — generating a resume/cover letter for a job is cached; repeat
  downloads reuse the saved file (no repeat Claude calls) unless you explicitly hit
  Regenerate
- **Application tracking** — mark any job as Saved / Applied / Interviewing / Offer /
  Rejected, from either the job feed or a dedicated "My Applications" table; auto-links
  whichever tailored resume/cover letter you last generated for that job

## Architecture

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind, deployed on Vercel |
| Backend | Express (Node), deployed on Render |
| Database / Auth / Storage | Supabase (Postgres + pgvector, Auth, Storage) |
| Resume/job/cover-letter generation | Anthropic Claude (`claude-sonnet-4-5`) |
| Embeddings (matching) | Voyage AI (`voyage-3-lite`, 512-dim) |
| Job sources | Adzuna API, JSearch (RapidAPI) |
| Document rendering | `docx` (Node) |
| Page scraping (Import by URL) | `cheerio` |

The frontend never talks to Claude, Voyage, Adzuna, or JSearch directly — all of that
goes through the Express backend, which holds the API keys. The frontend talks to
Supabase directly for auth and resume file upload, and to the backend for everything
AI/job-related.

### Why a shared job pool

The `jobs` table is a single shared pool across all users — if two users both search
"Software Engineer", the second search reuses the first user's embeddings instead of
paying for duplicate Voyage calls. A `user_jobs` linking table records which jobs each
user actually fetched or imported, and the feed (`match_jobs_for_user()`) only ranks
jobs linked to the requesting user — so the shared pool stays cheap without one user
seeing another user's search results.

### Document generation loop

`backend/lib/tailorResume.js` calls Claude to rewrite the resume against the job
description, scores the result with a pure deterministic scorer
(`backend/lib/atsScorer.js` — keyword frequency + light stemming + formatting checks, no
LLM self-grading), and if the score is below target (90) feeds the missing keywords back
to Claude for another pass, up to 3 iterations total, keeping whichever attempt scored
highest. Claude is instructed never to invent employers, titles, dates, or skills that
aren't genuinely in the original resume.

## Repo structure

```
schema.sql                  # run this in the Supabase SQL editor — safe to re-run in full
frontend/
  app/
    page.tsx                # landing page
    login/page.tsx          # email/password + Google auth
    dashboard/page.tsx      # server component, loads the signed-in user's profile
    auth/callback/route.ts  # OAuth callback
    auth/signout/route.ts   # POST logout
  components/
    DashboardClient.tsx        # client wrapper holding shared state across the sections below
    ResumeUpload.tsx           # upload widget + AI profile card
    JobsSection.tsx            # search/refresh, import by URL, job feed, document buttons
    ApplicationsSection.tsx    # "My Applications" tracking table
    ProfileCard.tsx
    MatchRing.tsx               # per-job match % ring shown on each job card
    StatusStepper.tsx           # Saved/Applied/Interviewing/Offer stepper control
    Toast.tsx                   # global toast notification provider
  lib/
    supabase/                  # browser + server Supabase clients
    apiError.ts                 # parses the backend's {error} JSON into a clean message,
                                 # instead of surfacing the raw response body to the user
backend/
  index.js                   # Express app, mounts all routes
  routes/
    resume.js                # POST /api/resume/process
    jobs.js                  # POST /api/jobs/refresh, GET /api/jobs/feed
    import.js                # POST /api/import/jobs
    documents.js             # POST /api/documents/resume, /cover-letter
    applications.js          # tracking CRUD
  lib/
    claude.js                # all Claude prompts (profile extraction, job extraction,
                              # resume tailoring, cover letter generation)
    embeddings.js             # Voyage embedding calls, rate-limit throttling
    atsScorer.js               # deterministic ATS scoring
    tailorResume.js             # tailor + rescore loop
    renderResumeDocx.js          # resume -> .docx
    renderCoverLetterDocx.js      # cover letter -> .docx
    adzuna.js / jsearch.js         # job source integrations
    scrape.js                       # page text extraction for Import by URL
    jobs.js                          # shared-pool dedup + embedding upsert
    extractText.js                    # PDF/DOCX text extraction
    supabase.js                        # service-role Supabase client
```

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the entire contents of `schema.sql`. It creates every
   table, RLS policy, storage bucket, and Postgres function used by the app, and is safe
   to re-run in full any time (every `create` is guarded with `if not exists` /
   `or replace`, every `create policy` has a matching `drop policy if exists`).
3. Under Authentication → Providers, enable **Email** and **Google**. For Google, add
   your app's URL(s) to the redirect allowlist (Authentication → URL Configuration →
   Redirect URLs) — include both your local dev URL (`http://localhost:3000/**`) and your
   production URL.
4. Grab your project URL, anon key, and service role key from Settings → API — you'll
   need all three below.

### 2. API keys you'll need

| Service | Used for | Get it from |
|---|---|---|
| Anthropic | Profile extraction, job extraction, resume tailoring, cover letters | [console.anthropic.com](https://console.anthropic.com) |
| Voyage AI | Embeddings for job matching | [dashboard.voyageai.com](https://dashboard.voyageai.com) |
| Adzuna | Job search | [developer.adzuna.com](https://developer.adzuna.com) |
| JSearch (RapidAPI) | Second job source (optional — backend skips it if unset) | [rapidapi.com](https://rapidapi.com), subscribe to the JSearch API |

**Voyage rate limits matter here.** Accounts with no payment method on file are capped
at ~3 requests/minute, which makes a job refresh take several minutes (the app embeds
every new job it saves). Adding a payment method unlocks Voyage's Tier 1 (2000 RPM) —
see `VOYAGE_MIN_INTERVAL_MS` below.

### 3. Backend

```
cd backend
npm install
cp .env.example .env   # fill in real values, see table below
npm run dev             # http://localhost:4000/health should return {"ok":true}
```

Deploy to Render: new Web Service pointed at `backend/`, build command `npm install`,
start command `npm start`, and set every variable from `.env` in Render's dashboard too.

#### Backend environment variables

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | From Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS, backend-only, never expose to the frontend |
| `ANTHROPIC_API_KEY` | |
| `VOYAGE_API_KEY` | |
| `VOYAGE_MIN_INTERVAL_MS` | Throttle between embedding calls. `21000` (~3 RPM) if you have no payment method on Voyage; drop to `100` or so (~600 RPM, safely under Tier 1's 2000 RPM) once you add one |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | |
| `ADZUNA_COUNTRY` | e.g. `in`, `us`, `gb` — Adzuna is country-scoped |
| `RAPIDAPI_JSEARCH_KEY` | Optional — leave unset to run with Adzuna only |
| `JSEARCH_COUNTRY` | e.g. `in` |
| `PORT` | Defaults to `4000` |

### 4. Frontend

```
cd frontend
npm install
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000    # or your deployed Render URL
```

```
npm run dev    # http://localhost:3000
```

Deploy to Vercel: import the repo, set the **Root Directory to `frontend`** (important —
Vercel will otherwise try to treat `backend/` as a second service, which doesn't work
since it's a long-running Express app, not a serverless function), and set the same three
env vars with `NEXT_PUBLIC_BACKEND_URL` pointed at your deployed Render URL.

## Local run order

```
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Open `http://localhost:3000`, sign up with email/password (fastest to test — Google
sign-in needs the OAuth redirect configured first), upload a resume, and the AI Career
Profile card should appear within a few seconds. From there: search or import jobs, view
your match-ranked feed, download a tailored resume/cover letter for any job, and track
its application status.
