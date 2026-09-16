import { NextResponse } from "next/server";

import {
  createOrRestoreWorkspace,
  expireWorkspaceCookie,
  getWorkspace,
} from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/clients";
import { removeWorkspaceStorage } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";

export async function POST() {
  try {
    return NextResponse.json(await createOrRestoreWorkspace());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const workspace = await getWorkspace();
    await removeWorkspaceStorage(workspace.id);
    const { error } = await getSupabaseAdmin().from("workspaces").delete().eq("id", workspace.id);
    if (error) throw error;
    await expireWorkspaceCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
