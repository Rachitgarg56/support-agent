import { googleGenAI } from "./config.js";

export const SIMILARITY_MATCH_COUNT = 5;
export const ANSWERING_MODEL = "gemini-2.5-flash"
// export const ANSWERING_MODEL = "gemini-2.5-flash-lite" // gemini-2.5-flash
export const CLASSIFICATION_MODEL = "gemini-2.5-flash-lite" // gemini-2.5-flash
export const EMBEDDING_MODEL_NAME = 'gemini-embedding-001'; 
export const aiModel = googleGenAI(ANSWERING_MODEL);
export const KNOWLEDGE_BASE_DESCRIPTION = "Scrimba, an online platform for learning to code. It has its own discord channel also.";

export const MATCH_THRESHOLD = 0.5;
export const CHUNK_SIZE = 2000; 
export const CHUNK_OVERLAP = 100; 