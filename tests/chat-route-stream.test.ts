import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchRow } from "@/lib/server/chat-grounding";

const state = vi.hoisted(() => ({
  matches: [] as MatchRow[],
  streamOptions: [] as Array<{ sendStart?: boolean; sendSources?: boolean }>,
}));

vi.mock("@/lib/server/auth", () => ({ getWorkspace: async () => ({ id: "workspace-1" }) }));
vi.mock("@/lib/server/quota", () => ({ getHashedIp: () => "hashed-ip", consumeDemoQuota: async () => {} }));
vi.mock("@/lib/server/clients", () => ({
  getGoogleProvider: () => Object.assign(() => ({}), {
    embeddingModel: () => ({}),
    tools: { googleSearch: () => ({}) },
  }),
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ count: 1, error: null }) }) }) }),
    rpc: async () => ({ data: state.matches, error: null }),
  }),
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    embed: async () => ({ embedding: [0.1] }),
    streamText: () => ({
      toUIMessageStream: (options: { sendStart?: boolean; sendSources?: boolean } = {}) => {
        state.streamOptions.push(options);
        return new ReadableStream({
          start(controller) {
            if (options.sendStart !== false) controller.enqueue({ type: "start", messageId: "second-assistant-message" });
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({ type: "text-delta", id: "answer", delta: "The limit is 1,000 requests [1]." });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.close();
          },
        });
      },
    }),
  };
});

import { POST } from "@/app/api/chat/route";

function request(allowWebSearch: boolean) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "How many API requests per hour in the starter plan?" }] }], allowWebSearch }),
  });
}

describe("chat response stream", () => {
  beforeEach(() => {
    state.matches = [];
    state.streamOptions = [];
  });

  it("does not start a second assistant message after document citation data", async () => {
    state.matches = [{ id: 1, document_id: "doc-1", file_name: "guide.pdf", page_number: 2, content: "Starter plan allows 1,000 API requests per hour.", similarity: 0.9 }];
    const response = await POST(request(false));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(state.streamOptions).toEqual([{ sendStart: false }]);
    expect(body).toContain("data-citations");
    expect(body).not.toContain('"type":"start"');
  });

  it("keeps the explicit web-search answer in one assistant message", async () => {
    const response = await POST(request(true));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(state.streamOptions).toEqual([{ sendSources: true, sendStart: false }]);
    expect(body).not.toContain('"type":"start"');
  });
});
