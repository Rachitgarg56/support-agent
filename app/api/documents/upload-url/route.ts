import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { demoLimits } from "@/lib/limits";
import { getWorkspace } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/clients";
import {
  extensionOf,
  normalizeMediaType,
  sanitizeFileName,
  validateFileSize,
} from "@/lib/server/document-parser";
import { DOCUMENTS_BUCKET } from "@/lib/server/env";
import { ApiError, errorResponse } from "@/lib/server/errors";

const schema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mediaType: z.string().max(100),
});

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspace();
    const input = schema.parse(await request.json());
    const name = sanitizeFileName(input.name);
    const mediaType = normalizeMediaType(name, input.mediaType);
    validateFileSize(input.size);

    const supabase = getSupabaseAdmin();
    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id);
    if (countError) throw countError;
    if ((count || 0) >= demoLimits.maxFiles) {
      throw new ApiError(409, "FILE_LIMIT_REACHED", `This workspace can contain at most ${demoLimits.maxFiles} active files.`);
    }

    const documentId = randomUUID();
    const storagePath = `${workspace.id}/${documentId}${extensionOf(name)}`;
    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      workspace_id: workspace.id,
      name,
      media_type: mediaType,
      size_bytes: input.size,
      storage_path: storagePath,
      status: "pending",
    });
    if (insertError) throw insertError;

    const { data, error: signedUrlError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (signedUrlError || !data) {
      await supabase.from("documents").delete().eq("id", documentId);
      throw signedUrlError || new Error("Could not create upload URL");
    }

    return NextResponse.json({
      documentId,
      path: data.path,
      token: data.token,
      bucket: DOCUMENTS_BUCKET,
      mediaType,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
