import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/server/env";

let supabaseAdmin: SupabaseClient | undefined;
let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const env = getServerEnv();
    supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseAdmin;
}

export function getGoogleProvider() {
  if (!googleProvider) {
    googleProvider = createGoogleGenerativeAI({
      apiKey: getServerEnv().GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return googleProvider;
}
