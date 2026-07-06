/**
 * Generates the prompt for classifying the question type (RETRIEVAL vs GENERAL)
 * @param {string} question - The user's question
 * @param {string} knowledgeBaseDescription - Description of the knowledge base
 * @returns {string} The classification prompt
 */
export function getClassificationPrompt(question, knowledgeBaseDescription) {
    return `Classify the user's question. The goal is to use a customer support knowledge base about ${knowledgeBaseDescription} If the question is about Scrimba itself OR if it's a coding/technical problem that someone using Scrimba might encounter (like code errors, tool issues, programming concepts). If the question is clearly off-topic (e.g., cooking, sports, general trivia unrelated to tech), respond 'GENERAL'. Otherwise, respond 'RETRIEVE'. 
    
    Question: ${question}
    CLassification:`;
}

/**
 * Generates the prompt for answering a general question directly
 * @param {string} question - The user's question
 * @returns {string} The general prompt
 */
export function getGeneralPrompt(question) {
    return `Answer the following question concisely: ${question}`;
}

/**
 * Generates the prompt for when no releavant documents are found during retrieval.
 * @param {string} question - The original user question
 * @param {string} knowledgeBaseDescription - Description of the knowledge base
 * @returns {string} The fallback prompt
 */
export function getFallbackPrompt(question, knowledgeBaseDescription) {
    return `You were asked: "${question}". You searched a knowledge base about ${knowledgeBaseDescription} but foun no relevant information. Inform the user politely that you couldn't find specific details in the knowledge base and offer to answer generally if possible, or state you cannot answer.`;
}

/**
 * Generates the prompt for answering based on retrieved constext.
 * @param {string} contextString - The combined context from retrieved documents.
 * @param {string} question - The user's question.
 * @param {string} knowledgeBaseDescription - Description of the knowledge base.
 * @returns {string} The RAG prompt.
 */
export function getRagPrompt(
    contextString, 
    question,
    knowledgeBaseDescription
) {
  return `You are a helpful assistant for ${knowledgeBaseDescription}. Answer the user's question based on the provided context. If the context doesn't contain the answer, kindl inform the user.

Context:
---
${contextString}
---

Question: ${question}
Answer:`;
}
