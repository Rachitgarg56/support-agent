import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reservations: new Set<string>(),
  signedUrlFails: false,
  status: "pending",
  processCalls: 0,
  quotaCalls: 0,
  quotaFails: false,
}));

const documentRow = () => ({
  id: "00000000-0000-4000-8000-000000000002",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  name: "guide.txt", media_type: "text/plain", size_bytes: 10, storage_path: "guide.txt",
  status: state.status, error: null, chunk_count: 0, created_at: "2026-01-01T00:00:00Z",
});

vi.mock("@/lib/server/auth", () => ({ getWorkspace: async () => ({ id: "00000000-0000-4000-8000-000000000001" }) }));
vi.mock("@/lib/limits", () => ({ demoLimits: { maxFiles: 3, maxFileBytes: 5 * 1024 * 1024, globalDocumentsPerDay: 5 } }));
vi.mock("@/lib/server/quota", async () => {
  const { ApiError } = await import("@/lib/server/errors");
  return {
    getHashedIp: () => "hashed-ip",
    consumeDemoQuota: async () => {
      state.quotaCalls += 1;
      if (state.quotaFails) throw new ApiError(429, "DEMO_QUOTA_REACHED", "Daily limit reached.");
    },
  };
});
vi.mock("@/lib/server/clients", () => ({
  getSupabaseAdmin: () => ({
    rpc: async (_name: string, args: { p_document_id: string; p_max_files: number }) => {
      if (state.reservations.size >= args.p_max_files) return { data: false, error: null };
      state.reservations.add(args.p_document_id);
      return { data: true, error: null };
    },
    storage: { from: () => ({ createSignedUploadUrl: async () => state.signedUrlFails
      ? { data: null, error: new Error("Signing failed") }
      : { data: { path: "path", token: "signed-token" }, error: null } }) },
    from: () => ({
      delete: () => {
        let id = "";
        let calls = 0;
        return { eq(key: string, value: string) {
          if (key === "id") id = value;
          calls += 1;
          if (calls === 3) { state.reservations.delete(id); return Promise.resolve({ error: null }); }
          return this;
        } };
      },
    }),
  }),
}));
vi.mock("@/lib/server/documents", () => ({
  claimDocumentProcessing: async () => {
    if (state.status === "processing" || state.status === "ready") return { document: documentRow(), claimed: false };
    state.status = "processing";
    return { document: documentRow(), claimed: true };
  },
  failDocumentProcessing: async () => { state.status = "failed"; },
  processDocument: async () => {
    state.processCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    state.status = "ready";
    return documentRow();
  },
  toDocumentSummary: (row: ReturnType<typeof documentRow>) => row,
}));

import { POST as reserveUpload } from "@/app/api/documents/upload-url/route";
import { POST as processUpload } from "@/app/api/documents/[id]/process/route";

const uploadRequest = () => new Request("http://localhost/api/documents/upload-url", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "guide.txt", size: 10, mediaType: "text/plain" }),
});
const processRequest = () => new Request("http://localhost/api/documents/00000000-0000-4000-8000-000000000002/process", { method: "POST" });
const params = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) };

describe("ingestion route reliability", () => {
  beforeEach(() => {
    state.reservations.clear();
    state.signedUrlFails = false;
    state.status = "pending";
    state.processCalls = 0;
    state.quotaCalls = 0;
    state.quotaFails = false;
  });

  it("allows at most three concurrent upload reservations", async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => reserveUpload(uploadRequest())));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect(state.reservations.size).toBe(3);
  });

  it("releases a reservation when signing fails", async () => {
    state.signedUrlFails = true;
    const response = await reserveUpload(uploadRequest());
    expect(response.status).toBe(503);
    expect(state.reservations.size).toBe(0);
  });

  it("runs exactly one processing job and consumes quota once under parallel requests", async () => {
    const responses = await Promise.all([processUpload(processRequest(), params), processUpload(processRequest(), params)]);
    expect(responses.map((item) => item.status)).toEqual([200, 200]);
    expect(state.processCalls).toBe(1);
    expect(state.quotaCalls).toBe(1);
    const statuses = await Promise.all(responses.map(async (response) => (await response.json()).document.status));
    expect(statuses).toContain("processing");
    expect(statuses).toContain("ready");
  });

  it("releases a claimed document for retry if quota rejects before embedding", async () => {
    state.quotaFails = true;
    const response = await processUpload(processRequest(), params);
    expect(response.status).toBe(429);
    expect(state.status).toBe("failed");
    expect(state.processCalls).toBe(0);
  });
});
