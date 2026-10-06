# Papertrail — Document Q&A Demo

A full-stack, workspace-isolated retrieval-augmented generation (RAG) application built for a public portfolio. Visitors unlock the demo with a shared code, upload their own PDF/TXT/Markdown documents, and ask independently grounded questions with citations.

## What it includes

- Next.js App Router, React, TypeScript, Tailwind CSS, and Vercel AI SDK UI
- Gemini 2.5 Flash-Lite answers and `gemini-embedding-001` embeddings
- Private Supabase Storage and pgvector similarity search
- Anonymous workspaces isolated inside the vector-search function
- Direct signed uploads, page-aware PDF extraction, and streamed citations
- Explicit, quota-controlled Google Search fallback when the visitor chooses it, including after a weak document answer
- Atomic per-workspace, per-IP, and global daily free-tier quotas
- No server-side chat history

## Local setup

1. Create a Supabase project and run [`created_tables.sql`](./created_tables.sql) in its SQL editor. For an existing project, run [`migrations/20261002_atomic_upload_reservation.sql`](./migrations/20261002_atomic_upload_reservation.sql) **before** deploying code that uses `reserve_document_upload`.
2. Copy `.env.example` to `.env.local` and fill every required value. Generate long random strings for `COOKIE_SIGNING_SECRET`, `RATE_LIMIT_SALT`, and `CRON_SECRET`.
3. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEMO_ACCESS_CODE`, and all signing secrets server-only.
4. Install and start the app:

   ```bash
   npm ci --legacy-peer-deps
   npm run dev
   ```

Open `http://localhost:3000`, enter your demo code, and upload a readable document.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Server | Gemini generation and embeddings |
| `SUPABASE_URL` | Server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Storage and database administration |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Direct signed uploads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Direct signed uploads; table access remains denied |
| `DEMO_ENABLED` | Server | Emergency live-demo switch |
| `DEMO_ACCESS_CODE` | Server | Shared résumé access code |
| `COOKIE_SIGNING_SECRET` | Server | Signs access cookies |
| `RATE_LIMIT_SALT` | Server | HMAC-hashes visitor IPs |
| `CRON_SECRET` | Server | Protects the cleanup route |
| `NEXT_PUBLIC_REPOSITORY_URL` | Browser | Optional source-code link |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` | Browser | Optional recorded fallback link |

The app intentionally does not inspect or send raw PDF files to Gemini. It extracts text on the server and sends only selected chunks to the answer model. Free-tier Google usage may still be used to improve Google products, so the UI warns visitors not to upload confidential material.

## Limits

On Vercel, the portfolio profile allows three files per workspace, 5 MB per file, 100 PDF pages, 10 questions per workspace per day, and three web fallbacks. Local development uses higher limits. The global quota functions reject requests before invoking Gemini.

Text-bearing PDFs are supported. OCR, encrypted PDFs, DOCX, spreadsheets, authentication, durable background jobs, and persisted conversations are intentionally out of scope.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Playwright includes a browser smoke test for the protected entry screen:

```bash
npx playwright install chromium
npm run test:e2e
```

CI runs type-checking, linting, unit and SQL-contract tests, the browser smoke test, and a production build. A full upload-to-citation journey and multi-user isolation still require a configured Supabase project and Gemini credentials; validate those against your deployed environment before sharing the link.

## RAG evaluation (small, fictional benchmark)

[`evals/cases.v1.json`](./evals/cases.v1.json) contains 20 fixed questions and expected evidence from three fictional Asterline documents. It covers direct facts, paraphrases, two-document answers, superseded facts, unanswered questions, and an injected instruction. Twelve cases are for development; eight are held out from prompt/retrieval tuning. Expected evidence is fixed, but **answers are generated afresh** during a live run. This small curated set is a regression aid, not proof of general accuracy.

`npm run eval:offline` runs deterministic dataset, ranking, citation, and mocked-provider checks in CI. These do not measure Gemini quality. To run real answers yourself against a configured local or deployed app, use Node 22 and run:

```bash
npm run eval:live -- --confirm-live --base-url=http://localhost:3000
```

The live runner opens a fresh anonymous browser workspace, uploads the three fictional Markdown files, asks at most 20 questions (or the workspace's lower daily cap), stops on a `429` quota error, records answers/evidence/latency in ignored `evals/results/latest.json`, and deletes its synthetic workspace through the UI. It is never run in CI. If your deployed server uses a different **public** demo code, add `--code=YOUR_PUBLIC_CODE`; do not pass any secret/API key. A Vercel workspace's 10-question daily cap means a hosted run covers only the first 10 cases, not all 20. Run the full set locally only if the free provider quota permits it.

Inspect each saved answer against the source text. Fill `review.answerCorrect`, `review.citationsSupported`, and (for unanswerable cases) `review.abstainedCorrectly` with `true` or `false`, then run `npm run eval:score`. Retrieval recall@3 counts expected evidence found in the three streamed candidate excerpts; if a 240-character excerpt truncates the expected sentence, set `review.retrievedEvidenceIndices` to the zero-based indices of expected passages you confirmed in the full source. The report shows numerators and denominators for retrieval recall@3, reviewed answer correctness, reviewed citation support, reviewed abstention, and p50/p95 latency. Unreviewed answers are excluded from quality denominators. Citation support and correctness need human judgment; exact excerpt matching can undercount retrieval, and these 20 synthetic questions do not estimate real-user accuracy.

Before sharing a deployment, manually run the full journey with a non-confidential document: enter the code, upload, wait for `ready`, ask a grounded question, inspect its citation, deliberately ask an unanswerable question, choose web search, then confirm document deletion. Repeat in a second private browser context and verify it cannot list, retrieve, process, or delete the first context's documents. Try an invalid PDF, a missing upload, a provider-quota failure, and the 320px keyboard layout. For a near-5 MB/100-page PDF, measure the browser Network duration of `/api/documents/:id/process` on the deployed app; it must finish comfortably below its 60-second route budget. If it approaches the limit, lower the hosted `maxFileBytes`/`maxPdfPages` in [`lib/limits.ts`](./lib/limits.ts) before advertising that limit. This external timing and deployed end-to-end check cannot be honestly certified by CI's mocked backend.

## Deployment

- Deploy the repository to Vercel using the Hobby plan and configure all environment variables.
- Set `DEMO_ACCESS_CODE` to the code shared beside the project link on your résumé.
- Keep the Gemini project on its free tier with billing disabled if zero spend is required.
- The daily Vercel cron removes expired workspaces, abandoned uploads, and old quota rows. Processing jobs stale for over five minutes become retryable failures without losing their files.
- Supabase Free projects can pause after inactivity; resume and smoke-test the project before interviews.
