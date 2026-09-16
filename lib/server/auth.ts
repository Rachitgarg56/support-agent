import "server-only";

import { cookies } from "next/headers";

import { clientLimits } from "@/lib/limits";
import { getSupabaseAdmin } from "@/lib/server/clients";
import {
  createSignedValue,
  hashToken,
  randomToken,
  verifySignedValue,
} from "@/lib/server/crypto";
import { getServerEnv } from "@/lib/server/env";
import { ApiError } from "@/lib/server/errors";

export const DEMO_COOKIE = "rag_demo_access";
export const WORKSPACE_COOKIE = "rag_workspace";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function issueDemoAccessCookie() {
  const expiresAt = Date.now() + THIRTY_DAYS_SECONDS * 1000;
  const signed = createSignedValue(
    String(expiresAt),
    getServerEnv().COOKIE_SIGNING_SECRET,
  );
  (await cookies()).set(DEMO_COOKIE, signed, {
    ...cookieOptions,
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

export async function requireDemoAccess() {
  const env = getServerEnv();
  if (env.DEMO_ENABLED !== "true") {
    throw new ApiError(503, "DEMO_DISABLED", "The live demo is temporarily disabled.");
  }

  const value = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!value) throw new ApiError(401, "ACCESS_REQUIRED", "Enter the demo access code to continue.");
  const payload = verifySignedValue(value, env.COOKIE_SIGNING_SECRET);
  if (!payload || Number(payload) <= Date.now()) {
    throw new ApiError(401, "ACCESS_EXPIRED", "Your demo access has expired.");
  }
}

export type Workspace = { id: string; expires_at: string };

async function findWorkspace(rawToken: string): Promise<Workspace | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, expires_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data as Workspace;
}

export async function getWorkspace() {
  await requireDemoAccess();
  const token = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!token) throw new ApiError(401, "WORKSPACE_REQUIRED", "Create a workspace to continue.");
  const workspace = await findWorkspace(token);
  if (!workspace) {
    throw new ApiError(401, "WORKSPACE_EXPIRED", "This workspace has expired. Create a new one.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS_SECONDS * 1000);
  const { error } = await getSupabaseAdmin()
    .from("workspaces")
    .update({ last_active_at: now.toISOString(), expires_at: expiresAt.toISOString() })
    .eq("id", workspace.id);
  if (error) throw error;
  return workspace;
}

export async function createOrRestoreWorkspace() {
  await requireDemoAccess();
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(WORKSPACE_COOKIE)?.value;
  if (existingToken) {
    const existing = await findWorkspace(existingToken);
    if (existing) return { workspaceId: existing.id, limits: clientLimits };
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_SECONDS * 1000);
  const { data, error } = await getSupabaseAdmin()
    .from("workspaces")
    .insert({ token_hash: hashToken(token), expires_at: expiresAt.toISOString() })
    .select("id")
    .single();
  if (error) throw error;

  cookieStore.set(WORKSPACE_COOKIE, token, {
    ...cookieOptions,
    maxAge: THIRTY_DAYS_SECONDS,
  });
  return { workspaceId: data.id as string, limits: clientLimits };
}

export async function expireWorkspaceCookie() {
  (await cookies()).set(WORKSPACE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
