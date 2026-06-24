import {retrieveSimilarDocs} from "./retrieveSimilarDocs.js"
import {getRagPrompt, combineDocuments} from "./utils.js"
import {ANSWERING_MODEL} from "./constants.js"
import { generateText, Output, stepCountIs, tool } from "ai"
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
  // classificationStructuredOutput();
  generateResponseFromToolCalls();
}

async function generateResponseFromToolCalls() {
  const NUMBER_OF_STEPS = 3;

  const getCurrentTemp = tool({
    description: "Get current temperature of location",
    inputSchema: z.object({
      location: z.string(),
    }),
    execute: async ({location}) => ({location, temperature: 28}),
  });

  const getCityAttractions = tool({
    description: "Get attractions of city",
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({city}) => ({city , attractions: ["Taj Mahal", "Yamuna River"]}),
  })

  const { text, toolResults, steps } = await generateText({
    model: googleGenAI(ANSWERING_MODEL),
    tools: { getCurrentTemp, getCityAttractions },
    stopWhen: stepCountIs(NUMBER_OF_STEPS),
    prompt: "What is the current temperature in Agra and name some of the places of attraction.",
  });

  console.log(text)
  console.log(JSON.stringify(toolResults, null, 2));
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
