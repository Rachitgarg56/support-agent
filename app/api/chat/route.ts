import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  embed,
  stepCountIs,
  streamText,
} from "ai";
import { z } from "zod";

import { demoLimits } from "@/lib/limits";
import type { AppUIMessage } from "@/lib/types";
import { getWorkspace } from "@/lib/server/auth";
import {
  buildGroundedRequest,
  latestQuestion,
  type MatchRow,
} from "@/lib/server/chat-grounding";
import { getGoogleProvider, getSupabaseAdmin } from "@/lib/server/clients";
import {
  ANSWERING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "@/lib/server/env";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { consumeDemoQuota, getHashedIp } from "@/lib/server/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(100),
  allowWebSearch: z.boolean().default(false),
});

function fixedMessageStream(question: string) {
  const textId = crypto.randomUUID();
  const stream = createUIMessageStream<AppUIMessage>({
    execute({ writer }) {
      writer.write({
        type: "data-retrieval",
        data: { status: "no_match", canSearchWeb: true, question },
      });
      writer.write({ type: "text-start", id: textId });
      writer.write({
        type: "text-delta",
        id: textId,
        delta:
          "I couldn’t find enough evidence in your uploaded documents to answer that confidently. You can search the web instead, or try a more specific question.",
      });
      writer.write({ type: "text-end", id: textId });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  try {
    const workspace = await getWorkspace();
    const { messages, allowWebSearch } = bodySchema.parse(await request.json());
    const question = latestQuestion(messages);
    const supabase = getSupabaseAdmin();

    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "ready");
    if (countError) throw countError;
    if (!count) throw new ApiError(409, "NO_READY_DOCUMENTS", "Upload and process a document before asking questions.");

    const ipHash = getHashedIp(request.headers);
    await consumeDemoQuota({
      action: "question",
      workspaceId: workspace.id,
      ipHash,
      workspaceLimit: demoLimits.questionsPerWorkspacePerDay,
      globalLimit: demoLimits.globalQuestionsPerDay,
      ipLimit: demoLimits.questionsPerIpPerDay,
    });

    const { embedding } = await embed({
      model: getGoogleProvider().embeddingModel(EMBEDDING_MODEL),
      value: question,
      maxRetries: 0,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
    });
    const { data, error } = await supabase.rpc("match_document_chunks", {
      p_workspace_id: workspace.id,
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 6,
    });
    if (error) throw error;
    const matches = (data || []) as MatchRow[];

    if (!matches.length && !allowWebSearch) return fixedMessageStream(question);

    if (!matches.length) {
      await consumeDemoQuota({
        action: "web_search",
        workspaceId: workspace.id,
        ipHash,
        workspaceLimit: demoLimits.webSearchesPerWorkspacePerDay,
        globalLimit: demoLimits.globalWebSearchesPerDay,
        ipLimit: demoLimits.globalWebSearchesPerDay,
      });

      const stream = createUIMessageStream<AppUIMessage>({
        execute({ writer }) {
          writer.write({
            type: "data-retrieval",
            data: { status: "web", canSearchWeb: false, question },
          });
          const result = streamText({
            model: getGoogleProvider()(ANSWERING_MODEL),
            system:
              "Answer using the Google Search results. Be concise, distinguish current web information from uploaded documents, and never claim the answer came from the user's files. Include source links where supported.",
            prompt: question,
            tools: { google_search: getGoogleProvider().tools.googleSearch({}) },
            toolChoice: "required",
            stopWhen: stepCountIs(3),
            maxRetries: 0,
          });
          writer.merge(result.toUIMessageStream({ sendSources: true }));
        },
        onError: () =>
          "The free AI quota may be temporarily exhausted. Please try again after the daily reset or view the recorded walkthrough.",
      });
      return createUIMessageStreamResponse({ stream });
    }

    const grounded = buildGroundedRequest(question, matches);

    const stream = createUIMessageStream<AppUIMessage>({
      execute({ writer }) {
        writer.write({ type: "data-citations", data: { items: grounded.citations } });
        writer.write({
          type: "data-retrieval",
          data: { status: "matched", canSearchWeb: false, question },
        });
        const result = streamText({
          model: getGoogleProvider()(ANSWERING_MODEL),
          maxRetries: 0,
          system: grounded.system,
          prompt: grounded.prompt,
        });
        writer.merge(result.toUIMessageStream());
      },
      onError: () =>
        "The free AI quota may be temporarily exhausted. Please try again after the daily reset or view the recorded walkthrough.",
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    return errorResponse(error);
  }
}
