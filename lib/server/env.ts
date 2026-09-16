import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEMO_ACCESS_CODE: z.string().min(6),
  COOKIE_SIGNING_SECRET: z.string().min(32),
  RATE_LIMIT_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  DEMO_ENABLED: z.enum(["true", "false"]).default("true"),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}

export const DOCUMENTS_BUCKET = "documents";
export const ANSWERING_MODEL = "gemini-2.5-flash-lite";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 1536;
