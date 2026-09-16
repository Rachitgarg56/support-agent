import { NextResponse } from "next/server";
import { z } from "zod";

import { demoLimits } from "@/lib/limits";
import { getWorkspace } from "@/lib/server/auth";
import { getDocument, processDocument, toDocumentSummary } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";
import { consumeDemoQuota, getHashedIp } from "@/lib/server/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const workspace = await getWorkspace();
    const id = z.uuid().parse((await context.params).id);
    const existing = await getDocument(id, workspace.id);
    if (existing.status === "ready") {
      return NextResponse.json({ document: toDocumentSummary(existing) });
    }
    await consumeDemoQuota({
      action: "document_process",
      workspaceId: workspace.id,
      ipHash: getHashedIp(request.headers),
      workspaceLimit: demoLimits.maxFiles,
      globalLimit: demoLimits.globalDocumentsPerDay,
      ipLimit: demoLimits.globalDocumentsPerDay,
    });
    return NextResponse.json({ document: await processDocument(id, workspace.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
