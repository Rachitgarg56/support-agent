import { generateText } from 'ai';
import { googleGenAI } from './config.js';

const query = 'What is the latest model of openai?';
const llmmModel = 'gemini-2.5-flash';

async function main(query) {
  await webSearch(query);
}

main(query);

async function webSearch(query) {
  const { text, sources } = await generateText({
    model: googleGenAI(llmmModel),
    prompt: query,
    tools: {
      google_search: googleGenAI.tools.googleSearch({}),
    },
    maxSteps: 3, 
  });
 
  console.log('Text', text + '\n\n');
  console.log('Sources', sources);
}
