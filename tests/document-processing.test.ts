import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ missing: false, status: "processing", embedCalls: 0, maxRetries: -1 }));

vi.mock("@/lib/server/clients", () => ({
  getGoogleProvider: () => ({ embeddingModel: () => ({}) }),
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ download: async () => state.missing
      ? { data: null, error: new Error("missing") }
      : { data: new Blob([new Uint8Array(10)]), error: null } }) },
    from: (table: string) => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      update: (values: { status?: string }) => ({
        eq: () => ({ eq: () => { state.status = values.status || state.status; return Promise.resolve({ error: null }); } }),
      }),
      insert: () => Promise.resolve({ error: null }),
      select: () => { throw new Error(`Unexpected select on ${table}`); },
    }),
  }),
}));
vi.mock("@/lib/server/document-parser", () => ({
  extractDocument: async () => [{ text: "Fictional evidence about limits." }],
  chunkPages: () => [{ chunkIndex: 0, content: "Fictional evidence about limits." }],
}));
vi.mock("ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("ai")>(),
  embedMany: async (options: { maxRetries: number }) => {
    state.embedCalls += 1;
    state.maxRetries = options.maxRetries;
    throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { statusCode: 429 });
  },
}));

import { processDocument } from "@/lib/server/documents";

const claimed = {
  id: "00000000-0000-4000-8000-000000000002",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  name: "guide.txt", media_type: "text/plain", size_bytes: 10, storage_path: "guide.txt",
  status: "processing" as const, error: null, chunk_count: 0, created_at: "2026-01-01T00:00:00Z",
};

describe("processing failures", () => {
  beforeEach(() => { state.missing = false; state.status = "processing"; state.embedCalls = 0; state.maxRetries = -1; });

  it("fails a missing signed upload before invoking Gemini", async () => {
    state.missing = true;
    await expect(processDocument(claimed)).rejects.toMatchObject({ status: 422, code: "PROCESSING_FAILED" });
    expect(state.embedCalls).toBe(0);
    expect(state.status).toBe("failed");
  });

  it("does not retry provider 429 and returns a stable quota error", async () => {
    await expect(processDocument(claimed)).rejects.toMatchObject({ status: 429, code: "PROVIDER_QUOTA_REACHED" });
    expect(state.embedCalls).toBe(1);
    expect(state.maxRetries).toBe(0);
    expect(state.status).toBe("failed");
  });
});
