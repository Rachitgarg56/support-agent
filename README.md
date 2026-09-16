# Papertrail — Document Q&A Demo

A full-stack, workspace-isolated retrieval-augmented generation (RAG) application built for a public portfolio. Visitors unlock the demo with a shared code, upload their own PDF/TXT/Markdown documents, and ask independently grounded questions with citations.

## What it includes

- Next.js App Router, React, TypeScript, Tailwind CSS, and Vercel AI SDK UI
- Gemini 2.5 Flash-Lite answers and `gemini-embedding-001` embeddings
- Private Supabase Storage and pgvector similarity search
- Anonymous workspaces isolated inside the vector-search function
- Direct signed uploads, page-aware PDF extraction, and streamed citations
- Explicit Google Search fallback only after document retrieval has no match
- Atomic per-workspace, per-IP, and global daily free-tier quotas
- No server-side chat history

## Local setup

1. Create a Supabase project and run [`created_tables.sql`](./created_tables.sql) in its SQL editor.
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

## Deployment

- Deploy the repository to Vercel using the Hobby plan and configure all environment variables.
- Set `DEMO_ACCESS_CODE` to the code shared beside the project link on your résumé.
- Keep the Gemini project on its free tier with billing disabled if zero spend is required.
- The daily Vercel cron removes expired workspaces, abandoned uploads, and old quota rows.
- Supabase Free projects can pause after inactivity; resume and smoke-test the project before interviews.
