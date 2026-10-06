import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ storageFails: false, databaseDeletes: 0, removed: [] as string[] }));

vi.mock("@/lib/server/clients", () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ remove: async (paths: string[]) => {
      state.removed.push(...paths);
      return { error: state.storageFails ? new Error("Storage unavailable") : null };
    } }) },
    from: () => ({
      select: () => {
        const filters: Record<string, string> = {};
        return {
          eq(key: string, value: string) { filters[key] = value; return this; },
          async maybeSingle() {
            return { data: filters.id === "doc-a" && filters.workspace_id === "workspace-a"
              ? { id: "doc-a", workspace_id: "workspace-a", storage_path: "workspace-a/doc-a.txt" } : null, error: null };
          },
        };
      },
      delete: () => ({
        eq() { return this; },
        then(resolve: (value: { error: null }) => void) { state.databaseDeletes += 1; resolve({ error: null }); },
      }),
    }),
  }),
}));

import { deleteDocument } from "@/lib/server/documents";

describe("document deletion cleanup", () => {
  beforeEach(() => { state.storageFails = false; state.databaseDeletes = 0; state.removed = []; });

  it("retains the database row when private storage removal fails", async () => {
    state.storageFails = true;
    await expect(deleteDocument("doc-a", "workspace-a")).rejects.toThrow("Storage unavailable");
    expect(state.databaseDeletes).toBe(0);
    expect(state.removed).toEqual(["workspace-a/doc-a.txt"]);
  });

  it("deletes the row after removing the file", async () => {
    await deleteDocument("doc-a", "workspace-a");
    expect(state.databaseDeletes).toBe(1);
  });
});
