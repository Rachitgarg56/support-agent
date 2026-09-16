import "server-only";

import { getSupabaseAdmin } from "@/lib/server/clients";
import { hashWithSalt } from "@/lib/server/crypto";
import { getServerEnv } from "@/lib/server/env";
import { ApiError } from "@/lib/server/errors";

export function getHashedIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  return hashWithSalt(ip, getServerEnv().RATE_LIMIT_SALT);
}

export async function consumeIpQuota(
  action: string,
  ipHash: string,
  limit: number,
) {
  const { data, error } = await getSupabaseAdmin().rpc("consume_ip_quota", {
    p_action: action,
    p_ip_hash: ipHash,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data) throw new ApiError(429, "DEMO_QUOTA_REACHED", "Too many attempts. Please try again tomorrow.");
}

export async function consumeDemoQuota(input: {
  action: string;
  workspaceId: string;
  ipHash: string;
  workspaceLimit: number;
  globalLimit: number;
  ipLimit: number;
}) {
  const { data, error } = await getSupabaseAdmin().rpc("consume_demo_quota", {
    p_action: input.action,
    p_workspace_id: input.workspaceId,
    p_ip_hash: input.ipHash,
    p_workspace_limit: input.workspaceLimit,
    p_global_limit: input.globalLimit,
    p_ip_limit: input.ipLimit,
  });
  if (error) throw error;
  if (!data) {
    throw new ApiError(
      429,
      "DEMO_QUOTA_REACHED",
      "The free demo quota has been reached for today. Please use the recorded walkthrough or try again after the daily reset.",
    );
  }
}
