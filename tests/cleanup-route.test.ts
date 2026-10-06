import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  recoveredStatus: "",
  removedPaths: [] as string[],
  deletedIds: [] as string[],
  abandoned: [] as Array<{ id: string; workspace_id: string; storage_path: string }>,
}));

vi.mock("@/lib/server/env", () => ({ getServerEnv: () => ({ COOKIE_SIGNING_SECRET: "test-secret", CRON_SECRET: "cron" }) }));
vi.mock("@/lib/server/crypto", () => ({ hashWithSalt: (value: string) => value, safeEqual: (a: string, b: string) => a === b }));
vi.mock("@/lib/server/documents", () => ({ removeWorkspaceStorage: async () => {} }));
vi.mock("@/lib/server/clients", () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ remove: async (paths: string[]) => { state.removedPaths.push(...paths); return { error: null }; } }) },
    from: (table: string) => {
      if (table === "workspaces") return { select: () => ({ lt: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      if (table === "usage_counters") return { delete: () => ({ lt: async () => ({ error: null }) }) };
      return {
        update: (values: { status: string }) => ({
          eq: () => ({ lt: () => ({ select: async () => { state.recoveredStatus = values.status; return { data: [{ id: "stale" }], error: null }; } }) }),
        }),
        select: () => ({ in: () => ({ lt: () => ({ limit: async () => ({ data: state.abandoned, error: null }) }) }) }),
        delete: () => ({ in: async (_field: string, ids: string[]) => { state.deletedIds.push(...ids); return { error: null }; } }),
      };
    },
  }),
}));

import { GET } from "@/app/api/cron/cleanup/route";

describe("cleanup", () => {
  beforeEach(() => { state.recoveredStatus = ""; state.removedPaths = []; state.deletedIds = []; state.abandoned = []; });

  it("keeps stale processing files and makes the document retryable", async () => {
    const response = await GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer cron" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recoveredProcessing: 1, abandonedUploads: 0 });
    expect(state.recoveredStatus).toBe("failed");
    expect(state.removedPaths).toEqual([]);
  });

  it("removes abandoned unsigned uploads but leaves stale jobs alone", async () => {
    state.abandoned = [{ id: "abandoned", workspace_id: "workspace", storage_path: "workspace/abandoned.txt" }];
    const response = await GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer cron" } }));
    expect(response.status).toBe(200);
    expect(state.removedPaths).toEqual(["workspace/abandoned.txt"]);
    expect(state.deletedIds).toEqual(["abandoned"]);
  });
});
