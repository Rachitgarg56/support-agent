import { tool } from "ai";
import { z } from "zod";
import { embed } from "ai";
import { googleGenAI, supabase } from "./config.js";
import { 
    SIMILARITY_MATCH_COUNT,
    EMBEDDING_MODEL_NAME
} from "./constants.js";

export const knowledgeBaseTool = tool({
    description: `Search the Scrimba internal knowledge base for questions about:
        - Scrimba courses, curriculum, and coding exercises
        - Platform features (editor, playground, screencasts)
        - Account, billing, subscriptions, and pricing
        - Community resources including the Scrimba Discord server
        - Certificates, career paths, and Scrimba-specific support

        Use this whenever the question is about Scrimba itself, even if phrased generally
        (e.g. "how do I access the Discord?" or "how do I get help?"). Do NOT use for
        general programming questions or topics unrelated to Scrimba.`,
    inputSchema: z.object({
        query: z
        .string()
        .describe(
            'The specific query or question to serach for in the Scrimba knowledge base.'
        ),
    }),
    execute: async ({query}) => {
        console.log(`[Tool:KB] Received query: ${query}`);
        try {
            // 1. Embed the query
            const {embedding} = await embed({
                model: googleGenAI.embeddingModel(EMBEDDING_MODEL_NAME),
                value: query,
                providerOptions: {
                    google: {
                        outputDimensionality: 1536,
                    },
                },
            })
            console.log(`[Tool:KB] Generated query embedding.`);

            // 2. Query Supabase
            const {data: documents, error: matchError} = await supabase.rpc(
                'match_documents',
                {
                    query_embedding: embedding,
                    match_count: SIMILARITY_MATCH_COUNT,
                }
            );

            if (matchError) {
                console.error(`[Tool:KB] Error matching documents:`, matchError);
                // Return an error message that an LLM can understand
                return {error: `Database query failed: ${matchError.message}`};
            }

            if (!documents || documents.length === 0) {
                console.log(`[Tool:KN] No relevant documents found.`);
                return {
                    info: 'No relevant information found in the knowledge base for the query',
                };
            }

            console.log(`[Tool:KB] Retrieved ${documents.length} document chunks.`);
            // Return the retrieved documents structured for the LLM and potentially yhe frontend
            // We include content, metadata, and similarity
            return {retrievedDocuments: documents}; 
        } catch (error) {
            console.error(`[Tool:KB] Error during execution:`, error);
        }
    }
})
