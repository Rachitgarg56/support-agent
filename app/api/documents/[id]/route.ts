import { NextResponse } from "next/server";
import { z } from "zod";

import { getWorkspace } from "@/lib/server/auth";
import { deleteDocument } from "@/lib/server/documents";
import { errorResponse } from "@/lib/server/errors";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const workspace = await getWorkspace();
    const id = z.uuid().parse((await context.params).id);
    await deleteDocument(id, workspace.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
