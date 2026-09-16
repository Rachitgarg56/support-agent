import { extractText, getDocumentProxy } from "unpdf";

import { demoLimits } from "@/lib/limits";
import { ApiError } from "@/lib/server/errors";

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

export type ExtractedPage = { pageNumber?: number; text: string };
export type TextChunk = { pageNumber?: number; chunkIndex: number; content: string };

export function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

export function normalizeMediaType(name: string, mediaType: string) {
  const extension = extensionOf(name);
  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new ApiError(400, "UNSUPPORTED_FILE", "Only PDF, TXT, and Markdown files are supported.");
  }
  if (extension === ".pdf" && mediaType && mediaType !== "application/pdf") {
    throw new ApiError(400, "INVALID_FILE_TYPE", "The PDF MIME type is invalid.");
  }
  if (extension !== ".pdf" && !["text/plain", "text/markdown", ""].includes(mediaType)) {
    throw new ApiError(400, "INVALID_FILE_TYPE", "The text file MIME type is invalid.");
  }
  return extension === ".pdf" ? "application/pdf" : extension === ".md" ? "text/markdown" : "text/plain";
}

export function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[\\/\0-\x1f\x7f]/g, "_").trim().slice(0, 180);
  if (!cleaned) throw new ApiError(400, "INVALID_FILE_NAME", "The filename is invalid.");
  return cleaned;
}

export function validateFileSize(size: number) {
  if (!Number.isInteger(size) || size <= 0 || size > demoLimits.maxFileBytes) {
    throw new ApiError(
      400,
      "INVALID_FILE_SIZE",
      `Files must be between 1 byte and ${Math.floor(demoLimits.maxFileBytes / 1024 / 1024)} MB.`,
    );
  }
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocument(
  bytes: Uint8Array,
  name: string,
  mediaType: string,
): Promise<ExtractedPage[]> {
  validateFileSize(bytes.byteLength);
  const normalizedType = normalizeMediaType(name, mediaType);

  if (normalizedType === "application/pdf") {
    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      throw new ApiError(400, "INVALID_PDF", "The file does not have a valid PDF signature.");
    }

    const pdf = await getDocumentProxy(bytes);
    try {
      if (pdf.numPages > demoLimits.maxPdfPages) {
        throw new ApiError(
          400,
          "PDF_TOO_LONG",
          `PDFs may contain at most ${demoLimits.maxPdfPages} pages.`,
        );
      }
      const result = await extractText(pdf, { mergePages: false });
      const pages = (Array.isArray(result.text) ? result.text : [result.text])
        .map((text, index) => ({ pageNumber: index + 1, text: normalizeText(text) }))
        .filter((page) => page.text.length > 0);
      const totalLength = pages.reduce((sum, page) => sum + page.text.length, 0);
      if (totalLength < 30) {
        throw new ApiError(
          400,
          "NO_READABLE_TEXT",
          "No readable text was found. Scanned or image-only PDFs are not supported.",
        );
      }
      if (totalLength > demoLimits.maxTextChars) {
        throw new ApiError(400, "DOCUMENT_TOO_LARGE", "The extracted document contains too much text for this demo.");
      }
      return pages;
    } finally {
      await pdf.destroy();
    }
  }

  if (bytes.includes(0)) {
    throw new ApiError(400, "INVALID_TEXT_FILE", "Binary data is not accepted as a text document.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError(400, "INVALID_TEXT_ENCODING", "Text files must use UTF-8 encoding.");
  }
  text = normalizeText(text);
  if (!text) throw new ApiError(400, "EMPTY_DOCUMENT", "The document does not contain readable text.");
  if (text.length > demoLimits.maxTextChars) {
    throw new ApiError(400, "DOCUMENT_TOO_LARGE", "The document contains too much text for this demo.");
  }
  return [{ text }];
}

export function splitText(text: string, chunkSize = 1500, overlap = 200) {
  if (chunkSize <= overlap || overlap < 0) throw new Error("Chunk size must be greater than overlap.");
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const breakpoint = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
      if (breakpoint > start + Math.floor(chunkSize * 0.6)) end = breakpoint;
    }
    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export function chunkPages(pages: ExtractedPage[]): TextChunk[] {
  const chunks = pages.flatMap((page) =>
    splitText(page.text).map((content) => ({ content, pageNumber: page.pageNumber })),
  );
  if (chunks.length > demoLimits.maxChunksPerDocument) {
    throw new ApiError(400, "TOO_MANY_CHUNKS", "The document is too large to index in this demo.");
  }
  return chunks.map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }));
}
