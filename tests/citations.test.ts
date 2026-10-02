import { describe, expect, it } from "vitest";

import { citedDocumentSources } from "@/lib/citations";
import type { DocumentCitation } from "@/lib/types";

const sources: DocumentCitation[] = [
  { id: "1", type: "document", documentId: "a", fileName: "guide.pdf", pageNumber: 2, excerpt: "Starter: 1,000 requests per hour.", similarity: 0.9 },
  { id: "2", type: "document", documentId: "a", fileName: "guide.pdf", pageNumber: 2, excerpt: "Data retention policy.", similarity: 0.8 },
  { id: "3", type: "document", documentId: "a", fileName: "guide.pdf", pageNumber: 1, excerpt: "Quota resets hourly.", similarity: 0.7 },
];

describe("cited document sources", () => {
  it("shows only cited passages, once, in answer order", () => {
    expect(citedDocumentSources("The limit is 1,000 [1]. It resets hourly [3]. See [1].", sources).map((source) => source.id)).toEqual(["1", "3"]);
  });

  it("rejects references not present in the retrieved evidence", () => {
    expect(citedDocumentSources("Unsupported [4] and [99].", sources)).toEqual([]);
  });

  it("does not treat page numbers or ordinary numbers as citations", () => {
    expect(citedDocumentSources("The limit is 1,000 on page 2.", sources)).toEqual([]);
  });
});
