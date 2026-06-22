import {SIMILARITY_MATCH_COUNT, EMBEDDING_MODEL_NAME, MATCH_THRESHOLD} from "./constants.js"
import {googleGenAI, supabase} from "./config.js"
import { embed } from 'ai';

export async function retrieveSimilarDocs(query){

  // Create vector embeddings based on the query
  const { embedding } = await embed({
    model: googleGenAI.embedding(EMBEDDING_MODEL_NAME),
    value: query,
    providerOptions: {
        google: {
            outputDimensionality: 1536,
        },
    },
  });

  //retrieve similar docs from supabase based on embeddings
  const { data: documents, error: matchError } = await supabase.rpc(
      'match_documents',
    {
      query_embedding: embedding,
      match_count: SIMILARITY_MATCH_COUNT,
      match_threshold: MATCH_THRESHOLD,
    }
  );

  if(matchError){
    throw new Error (`Failed to fetch docs from supabase. Error: ${JSON.stringify(matchError)}`)
  }

  return documents
}
