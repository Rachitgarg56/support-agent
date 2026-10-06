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
    const documentId = randomUUID();
    const storagePath = `${workspace.id}/${documentId}${extensionOf(name)}`;
    const { data: reserved, error: reserveError } = await supabase.rpc("reserve_document_upload", {
      p_workspace_id: workspace.id,
      p_document_id: documentId,
      p_name: name,
      p_media_type: mediaType,
      p_size_bytes: input.size,
      p_storage_path: storagePath,
      p_max_files: demoLimits.maxFiles,
    });
    if (reserveError) throw reserveError;
    if (!reserved) {
      throw new ApiError(409, "FILE_LIMIT_REACHED", `This workspace can contain at most ${demoLimits.maxFiles} active files.`);
    }

    let signedUpload: { path: string; token: string };
    try {
      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data) throw error || new Error("Could not create upload URL");
      signedUpload = data;
    } catch (error) {
      await supabase.from("documents").delete().eq("id", documentId).eq("workspace_id", workspace.id).eq("status", "pending");
      throw error;
    }

    return NextResponse.json({
      documentId,
      path: signedUpload.path,
      token: signedUpload.token,
      bucket: DOCUMENTS_BUCKET,
      mediaType,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
