import { NextResponse } from "next/server";

import { getWorkspace } from "@/lib/server/auth";
import { listDocuments } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";

export async function GET() {
  try {
    const workspace = await getWorkspace();
    return NextResponse.json({ documents: await listDocuments(workspace.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
