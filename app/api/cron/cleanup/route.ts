import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/server/clients";
import { hashWithSalt, safeEqual } from "@/lib/server/crypto";
import { removeWorkspaceStorage } from "@/lib/server/documents";
import { getServerEnv } from "@/lib/server/env";
import { ApiError, errorResponse } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const env = getServerEnv();
    const provided = request.headers.get("authorization") || "";
    const receivedHash = hashWithSalt(provided, env.COOKIE_SIGNING_SECRET);
    const expectedHash = hashWithSalt(`Bearer ${env.CRON_SECRET}`, env.COOKIE_SIGNING_SECRET);
    if (!safeEqual(receivedHash, expectedHash)) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid cleanup credential.");
    }
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const { data: expired, error } = await supabase
      .from("workspaces")
      .select("id")
      .lt("expires_at", now.toISOString())
      .limit(100);
    if (error) throw error;
    for (const workspace of expired || []) {
      await removeWorkspaceStorage(workspace.id);
      const { error: deleteError } = await supabase.from("workspaces").delete().eq("id", workspace.id);
      if (deleteError) throw deleteError;
    }

    // The processing route has a 60-second budget; preserve timed-out files for retry.
    const stalledBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: recovered, error: recoveryError } = await supabase
      .from("documents")
      .update({ status: "failed", error: "Processing timed out. Please retry.", updated_at: now.toISOString() })
      .eq("status", "processing")
      .lt("updated_at", stalledBefore)
      .select("id");
    if (recoveryError) throw recoveryError;

    const abandonedBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data: abandoned, error: abandonedError } = await supabase
      .from("documents")
      .select("id, workspace_id, storage_path")
      .in("status", ["pending", "uploaded"])
      .lt("updated_at", abandonedBefore)
      .limit(100);
    if (abandonedError) throw abandonedError;
    if (abandoned?.length) {
      const { error: storageError } = await supabase.storage.from("documents").remove(abandoned.map((item) => item.storage_path));
      if (storageError) throw storageError;
      const { error: deleteError } = await supabase.from("documents").delete().in("id", abandoned.map((item) => item.id));
      if (deleteError) throw deleteError;
    }
    await supabase.from("usage_counters").delete().lt("usage_date", new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10));
    return NextResponse.json({ expiredWorkspaces: expired?.length || 0, abandonedUploads: abandoned?.length || 0, recoveredProcessing: recovered?.length || 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
