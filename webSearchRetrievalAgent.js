import { generateText, stepCountIs, tool } from "ai";
import { KNOWLEDGE_BASE_DESCRIPTION, ANSWERING_MODEL } from "./constants.js";
import {getRetrievalWebSearchPrompt} from "./prompts.js";
import { googleGenAI } from "./config.js";
import { knowledgeBaseTool } from "./knowledgeBaseTool.js";

const TOOL_CALLING_MODEL = ANSWERING_MODEL;
const MAX_TOOL_STEPS = 3; // Allow LLM to call tool and generate response


/**
 * Gets a llm response using tool calling for KB retrieval and web search
 */
export async function webSearchRetrievalAgent(question) {
    console.log(`[ToolBased] Received question: ${question}`);

    // Define the tools available to the model
    const tools = {
        knowledgeBaseSearch: knowledgeBaseTool,
        // google's built-in web search tool
        web_search_preview: googleGenAI.tools.googleSearch({}),
    };

    try {
        // Single call to generateText, letting the LLM decide on tool use
        const result = await generateText({
            model: googleGenAI(TOOL_CALLING_MODEL),
            tools: tools,
            stopWhen: stepCountIs(MAX_TOOL_STEPS),
            // System prompt guides the LLM on its role and when to use tools
            system: getRetrievalWebSearchPrompt(KNOWLEDGE_BASE_DESCRIPTION),
            prompt: question,
        });

        console.log((`[ToolBased] generateText finished.`));

        // --- Extract results --- 
        let answer = result.text;
        let sources = null;
        let toolUsed = null;

        // Check if web search was used (OpenaI response structure)
        if (result.sources && result.sources.length > 0) {
            console.log(`[ToolBased] Web search sources found.`);
            sources = result.sources.map((s) => ({
                // Adapt to our expected format
                type: 'web',
                title: s.title,
                url: s.url,
                snippet: s.snippet,
            }));
            toolUsed = 'web_search_preview';
        }

        // Check if our knowledge base tool was called by looking at steps
        // This requires inspecting the intermediate steps
        const kbToolCall = result.steps?.find((step) => 
            step.toolCalls?.some((tc) => tc.toolName === 'knowledgeBaseSearch')
        );

        if (kbToolCall) {
            console.log(`[ToolBased] Knowledge base tool call detected in steps.`);
            toolUsed = 'knowledgeBaseSearch'; //Prioprtize showing KB if both potentially used?

            // Find the corresponding tool result
            const kbToolResultStep = result.steps?.find(
                (step) =>
                    step.toolResults?.some(
                        (tr) => tr.toolCallId === kbToolCall.toolCalls[0].toolCallId
                    ) // Assuming the call per step for KB
            );
            const kbResultData = kbToolResultStep?.toolResults[0]?.output;

            if (kbResultData?.retrievedDocuments) {
                console.log(`[ToolBased] Extracted KB documents from tool result.`);
                sources = kbResultData.retrievedDocuments.map((doc) => ({
                    // Adapt to our format
                    type: 'knowledgeBase',
                    content: doc.content,
                    metadata: doc.metadata,
                    similarity: doc.similarity,
                }));
            } else if (kbResultData?.info) {
                console.log("[ToolBased] KB tool returned 'info':", kbResultData.info);
            } else if (kbResultData?.error) {
                console.warn(
                    '[ToolBased] KB tool returned an error:',
                    kbResultData.error
                );
            }
        }

        // If no text was generated but tools were called, provide a summary
        if (!answer.trim() && toolUsed) {
            answer = `I used the ${
                toolUsed === 'web_search_preview' ? 'web_search' : 'knowledge_base'
            } tool but didn't generate a final summary. You can check the retrieved sources.`;
        }

        return {
            answer: answer || "I couldn't generate a response.",
            sources: sources,
            toolUsed: toolUsed,
        };
    } catch (error) {
        console.error(`[ToolBased] Error in RAG process:`, error);
        const errorAnswer =
            'I encountered an error while processing your request using tool calling. Please try again.'
        return {
            answer: errorAnswer,
            sources: null,
            toolUsed: null,
            error: {
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
}
