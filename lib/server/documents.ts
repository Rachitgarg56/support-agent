import "server-only";

import { embedMany } from "ai";

import type { DocumentSummary } from "@/lib/types";
import { getGoogleProvider, getSupabaseAdmin } from "@/lib/server/clients";
import { chunkPages, extractDocument } from "@/lib/server/document-parser";
import { DOCUMENTS_BUCKET, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/server/env";
import { ApiError, safeErrorMessage } from "@/lib/server/errors";

type DocumentRow = {
  id: string;
  workspace_id: string;
  name: string;
  media_type: string;
  size_bytes: number;
  storage_path: string;
  status: DocumentSummary["status"];
  error: string | null;
  chunk_count: number;
  created_at: string;
};

export function toDocumentSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    name: row.name,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    chunkCount: row.chunk_count,
    error: row.error || undefined,
    createdAt: row.created_at,
  };
}

export async function listDocuments(workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .select("id, workspace_id, name, media_type, size_bytes, storage_path, status, error, chunk_count, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DocumentRow[]).map(toDocumentSummary);
}

export async function getDocument(documentId: string, workspaceId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("documents")
    .select("id, workspace_id, name, media_type, size_bytes, storage_path, status, error, chunk_count, created_at")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.");
  return data as DocumentRow;
}

export async function deleteDocument(documentId: string, workspaceId: string) {
  const document = await getDocument(documentId, workspaceId);
  const supabase = getSupabaseAdmin();
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([document.storage_path]);
  if (storageError) console.warn("Could not remove storage object", storageError.message);
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
}

export async function removeWorkspaceStorage(workspaceId: string) {
  const bucket = getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET);
  const { data, error } = await bucket.list(workspaceId, { limit: 1000 });
  if (error) throw error;
  const paths = (data || []).filter((item) => item.id).map((item) => `${workspaceId}/${item.name}`);
  if (paths.length) {
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
  }
}

export async function processDocument(documentId: string, workspaceId: string) {
  const document = await getDocument(documentId, workspaceId);
  if (document.status === "ready") return toDocumentSummary(document);

  const supabase = getSupabaseAdmin();
  const { error: statusError } = await supabase
    .from("documents")
    .update({ status: "processing", error: null, updated_at: new Date().toISOString() })
    .eq("id", document.id)
    .eq("workspace_id", workspaceId);
  if (statusError) throw statusError;

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.storage_path);
    if (downloadError || !file) {
      throw new ApiError(422, "UPLOAD_NOT_FOUND", "The uploaded file could not be found. Upload it again.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== Number(document.size_bytes)) {
      throw new ApiError(422, "FILE_SIZE_MISMATCH", "The uploaded file size does not match the request.");
    }
    const pages = await extractDocument(bytes, document.name, document.media_type);
    const chunks = chunkPages(pages);

    const embeddings: number[][] = [];
    for (let start = 0; start < chunks.length; start += 50) {
      const batch = chunks.slice(start, start + 50);
      const result = await embedMany({
        model: getGoogleProvider().embeddingModel(EMBEDDING_MODEL),
        values: batch.map((chunk) => chunk.content),
        maxParallelCalls: 2,
        maxRetries: 0,
        providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
      });
      embeddings.push(...result.embeddings);
    }

    const { error: clearError } = await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", document.id)
      .eq("workspace_id", workspaceId);
    if (clearError) throw clearError;

    for (let start = 0; start < chunks.length; start += 50) {
      const rows = chunks.slice(start, start + 50).map((chunk, offset) => ({
        workspace_id: workspaceId,
        document_id: document.id,
        chunk_index: chunk.chunkIndex,
        page_number: chunk.pageNumber ?? null,
        content: chunk.content,
        metadata: { fileName: document.name },
        embedding: embeddings[start + offset],
      }));
      const { error: insertError } = await supabase.from("document_chunks").insert(rows);
      if (insertError) throw insertError;
    }

    const { data: ready, error: updateError } = await supabase
      .from("documents")
      .update({
        status: "ready",
        error: null,
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id)
      .eq("workspace_id", workspaceId)
      .select("id, workspace_id, name, media_type, size_bytes, storage_path, status, error, chunk_count, created_at")
      .single();
    if (updateError) throw updateError;
    return toDocumentSummary(ready as DocumentRow);
  } catch (error) {
    const message = safeErrorMessage(error);
    await supabase.from("document_chunks").delete().eq("document_id", document.id);
    await supabase
      .from("documents")
      .update({ status: "failed", error: message, chunk_count: 0, updated_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("workspace_id", workspaceId);
    throw new ApiError(422, "PROCESSING_FAILED", message);
  }
}
