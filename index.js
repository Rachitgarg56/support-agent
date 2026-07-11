import {webSearchRetrievalAgent} from "./webSearchRetrievalAgent.js";

const retrievalQuery = "How do I access the scrimba discord?"
const webSearchQyery = "What is the latest openai large language model?"

async function main(query) {
  const response = await webSearchRetrievalAgent(query);

  console.log(`\n\nGenerated answer: ${response.answer}\n\nRetrieval docs: ${response.sources ?
    JSON.stringify(response.sources, null, 2): null}`);
}

main(retrievalQuery);
