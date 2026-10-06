import { NextResponse } from "next/server";
import { z } from "zod";

import { demoLimits } from "@/lib/limits";
import { getWorkspace } from "@/lib/server/auth";
import { claimDocumentProcessing, failDocumentProcessing, processDocument, toDocumentSummary } from "@/lib/server/documents";
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
    const claim = await claimDocumentProcessing(id, workspace.id);
    if (!claim.claimed) {
      return NextResponse.json({ document: toDocumentSummary(claim.document) });
    }
    try {
      await consumeDemoQuota({
        action: "document_process",
        workspaceId: workspace.id,
        ipHash: getHashedIp(request.headers),
        workspaceLimit: demoLimits.maxFiles,
        globalLimit: demoLimits.globalDocumentsPerDay,
        ipLimit: demoLimits.globalDocumentsPerDay,
      });
    } catch (error) {
      await failDocumentProcessing(id, workspace.id, "Processing quota unavailable. Retry when the daily quota resets.");
      throw error;
    }
    return NextResponse.json({ document: await processDocument(claim.document) });
  } catch (error) {
    return errorResponse(error);
  }
}
