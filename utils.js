export function getRagPrompt(contextString, question) {
  return `You are a helpful assistant. Answer the user's question based ONLY on the provided context. If the context doesn't contain the answer, state politely "I'm sorry, I don't have specific information about that in the knowledge base.". Do not make up answers.

Context:
---
${contextString}
---

Question: ${question}
Answer:`;
}



// --- Helper: Simple Text Splitter --- 
/**
 * Splits text into chunks based on size and overlap
 * This is a basic splitter; More sophisticated methods exists.
 * @param {string} text The input text.
 * @param {number} chunkSize Max characters per chunk.
 * @param {number} chunkOverlap Characters overlap between chunks.
 * @returns {string[]} Array of text chunks.
 **/

export function simpleTextSplitter(text, chunkSize, chunkOverlap) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.slice(i, end));
    i += chunkSize - chunkOverlap;
    if (i <= 0) i = end;
  }
  // Filter out any potentially empty chunks if they occur
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

export function combineDocuments(docs) {
  return docs.map((doc) => doc.content).join("\n\n---\n\n");
}
