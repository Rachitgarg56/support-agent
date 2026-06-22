import {retrieveSimilarDocs} from "./retrieveSimilarDocs.js"
import {getRagPrompt, combineDocuments} from "./utils.js"
import {ANSWERING_MODEL} from "./constants.js"
import { generateText } from "ai"
import {googleGenAI} from "./config.js"

const query = "In 1843, what was the key milestone in computing?"

async function main(query){
  //retrieve docs that contain content relevant to the query
  const retrievedDocs = await retrieveSimilarDocs(query)
//   console.log(retrievedDocs)

  //create a prompt including context docs to send to the model

  const contextString = combineDocuments(retrievedDocs);

  //create a prompt including context docs to send to the model
  const prompt = getRagPrompt(contextString, query)

  // console.log(`Prompt: ${prompt}`)

  // //send prompt to model to generate response
  const { text } = await generateText({
    model: googleGenAI(ANSWERING_MODEL),
    prompt: query
  });

  console.log(text);
}

main(query)
