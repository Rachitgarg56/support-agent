import {retrieveSimilarDocs} from "./retrieveSimilarDocs.js"
import {getRagPrompt, combineDocuments} from "./utils.js"
import {ANSWERING_MODEL} from "./constants.js"
import { generateText, Output } from "ai"
import {googleGenAI} from "./config.js"
import { ingestDocuments } from "./upsertDocuments.js"
import { z } from 'zod';

const query = "Generate a lasagna recipe."

async function main(query){
  // // split text into chunks, embed ans store into vector db
  // // await ingestDocuments(); 

  // //retrieve docs that contain content relevant to the query
  // const retrievedDocs = await retrieveSimilarDocs(query)
  // // console.log(retrievedDocs)

  // //create a prompt including context docs to send to the model

  // const contextString = combineDocuments(retrievedDocs);

  // //create a prompt including context docs to send to the model
  // const prompt = getRagPrompt(contextString, query)

  // // console.log(`Prompt: ${prompt}`)

  // // //send prompt to model to generate response
  // const { text } = await generateText({
  //   model: googleGenAI(ANSWERING_MODEL),
  //   prompt: prompt
  // });

  // console.log(text);
  // basicStruturedOutput(query);
  classificationStructuredOutput();
}

async function basicStruturedOutput(query) {
  const result = await generateText({
    model: googleGenAI(ANSWERING_MODEL),
    output: Output.object({
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(
            z.object({
              name: z.string(),
              amount: z.string(),
            }),
          ),
          steps: z.array(z.string()),
        }),
      }),
    }),
    prompt: query,
  });

  console.log(JSON.stringify(result.output.recipe, null, 2));
}

async function classificationStructuredOutput() {
  const result = await generateText({
    model: googleGenAI(ANSWERING_MODEL),
    output: Output.object({
      schema: z.object({
        sentiment: z.string().describe("Understand the sentiment of the user and explain in 1 statement."),
        satisfaction: z.enum(["positive", "negative"]).describe("Sentiment of the customer review."),     
      }),
    }),
    prompt: "I am not really satified with the testimonials on your website about the product!",
  });

  console.log(JSON.stringify(result.output, null, 2)); 
}

main(query)
