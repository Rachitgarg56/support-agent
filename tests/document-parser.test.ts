import { describe, expect, it } from "vitest";

import {
  chunkPages,
  extractDocument,
  extensionOf,
  normalizeMediaType,
  sanitizeFileName,
  splitText,
} from "@/lib/server/document-parser";

describe("document validation", () => {
  it("normalizes supported extensions and MIME types", () => {
    expect(extensionOf("Guide.PDF")).toBe(".pdf");
    expect(normalizeMediaType("guide.pdf", "")).toBe("application/pdf");
    expect(normalizeMediaType("notes.md", "")).toBe("text/markdown");
    expect(normalizeMediaType("notes.txt", "text/plain")).toBe("text/plain");
  });

  it("rejects unsupported or mismatched types", () => {
    expect(() => normalizeMediaType("sheet.csv", "text/csv")).toThrow("Only PDF");
    expect(() => normalizeMediaType("fake.pdf", "text/plain")).toThrow("MIME");
  });

  it("removes path separators from display names", () => {
    expect(sanitizeFileName("../private\\notes.txt")).toBe(".._private_notes.txt");
  });

  it("rejects corrupt PDFs, binary text, and empty documents before embedding", async () => {
    await expect(extractDocument(new TextEncoder().encode("not really a pdf"), "fake.pdf", "application/pdf")).rejects.toThrow("PDF signature");
    await expect(extractDocument(new Uint8Array([65, 0, 66]), "binary.txt", "text/plain")).rejects.toThrow("Binary data");
    await expect(extractDocument(new TextEncoder().encode("  \n  "), "empty.md", "text/markdown")).rejects.toThrow("readable text");
  });
});

describe("chunking", () => {
  it("keeps overlap without entering an infinite loop", () => {
    const input = Array.from({ length: 100 }, (_, index) => `word-${index}`).join(" ");
    const chunks = splitText(input, 120, 20);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
    expect(chunks.join(" ")).toContain("word-0");
    expect(chunks.at(-1)).toContain("word-99");
  });

  it("never merges content across PDF pages", () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: "First page evidence." },
      { pageNumber: 2, text: "Second page evidence." },
    ]);
    expect(chunks).toEqual([
      { pageNumber: 1, chunkIndex: 0, content: "First page evidence." },
      { pageNumber: 2, chunkIndex: 1, content: "Second page evidence." },
    ]);
  });
});
