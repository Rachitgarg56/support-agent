import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "created_tables.sql"), "utf8");

describe("database isolation contract", () => {
  it("filters vector retrieval by workspace before limiting", () => {
    const functionBody = sql.slice(sql.indexOf("create or replace function public.match_document_chunks"));
    expect(functionBody).toContain("chunks.workspace_id = p_workspace_id");
    expect(functionBody).toContain("docs.workspace_id = p_workspace_id");
    expect(functionBody.indexOf("chunks.workspace_id = p_workspace_id")).toBeLessThan(functionBody.indexOf("limit least(match_count"));
  });

  it("keeps quota checks and increments in one database function", () => {
    expect(sql).toContain("create or replace function public.consume_demo_quota");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("workspace_count >= p_workspace_limit");
    expect(sql).toContain("global_count >= p_global_limit");
    expect(sql).toContain("ip_count >= p_ip_limit");
  });

  it("denies browser roles direct table access", () => {
    expect(sql).toContain("from anon, authenticated");
    expect(sql).toContain("alter table public.document_chunks enable row level security");
  });
});
