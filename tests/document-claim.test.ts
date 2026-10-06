import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "pending", workspaceId: "workspace-a", claims: 0 }));
const row = () => ({
  id: "document-a", workspace_id: state.workspaceId, name: "test.txt", media_type: "text/plain",
  size_bytes: 10, storage_path: "workspace-a/document-a.txt", status: state.status,
  error: null, chunk_count: 0, created_at: "2026-01-01T00:00:00Z",
});

vi.mock("@/lib/server/clients", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => {
        const filters: Record<string, string> = {};
        return {
          eq(key: string, value: string) { filters[key] = value; return this; },
          async maybeSingle() {
            return { data: filters.id === "document-a" && filters.workspace_id === state.workspaceId ? row() : null, error: null };
          },
        };
      },
      update: () => {
        const filters: Record<string, string> = {};
        let allowed: string[] = [];
        return {
          eq(key: string, value: string) { filters[key] = value; return this; },
          in(_key: string, values: string[]) { allowed = values; return this; },
          select() { return this; },
          async maybeSingle() {
            if (filters.id !== "document-a" || filters.workspace_id !== state.workspaceId || !allowed.includes(state.status)) {
              return { data: null, error: null };
            }
            state.claims += 1;
            state.status = "processing";
            return { data: row(), error: null };
          },
        };
      },
    }),
  }),
}));

import { claimDocumentProcessing } from "@/lib/server/documents";

describe("atomic processing claim", () => {
  beforeEach(() => { state.status = "pending"; state.claims = 0; });

  it("claims only once when two requests race", async () => {
    const results = await Promise.all([
      claimDocumentProcessing("document-a", "workspace-a"),
      claimDocumentProcessing("document-a", "workspace-a"),
    ]);
    expect(results.filter((result) => result.claimed)).toHaveLength(1);
    expect(state.claims).toBe(1);
    expect(results.find((result) => !result.claimed)?.document.status).toBe("processing");
  });

  it("does not expose or claim a document from another workspace", async () => {
    await expect(claimDocumentProcessing("document-a", "workspace-b")).rejects.toMatchObject({ status: 404, code: "DOCUMENT_NOT_FOUND" });
    expect(state.claims).toBe(0);
  });
});
