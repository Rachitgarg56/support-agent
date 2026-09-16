import type { DemoLimits } from "@/lib/types";

export const isHostedDemo = process.env.VERCEL === "1";

export const demoLimits: DemoLimits & {
  maxTextChars: number;
  maxChunksPerDocument: number;
  globalDocumentsPerDay: number;
  globalQuestionsPerDay: number;
  globalWebSearchesPerDay: number;
  questionsPerIpPerDay: number;
} = isHostedDemo
  ? {
      maxFiles: 3,
      maxFileBytes: 5 * 1024 * 1024,
      maxPdfPages: 100,
      maxTextChars: 500_000,
      maxChunksPerDocument: 400,
      globalDocumentsPerDay: 5,
      globalQuestionsPerDay: 50,
      globalWebSearchesPerDay: 10,
      questionsPerWorkspacePerDay: 10,
      questionsPerIpPerDay: 100,
      webSearchesPerWorkspacePerDay: 3,
    }
  : {
      maxFiles: 10,
      maxFileBytes: 10 * 1024 * 1024,
      maxPdfPages: 200,
      maxTextChars: 1_000_000,
      maxChunksPerDocument: 800,
      globalDocumentsPerDay: 100,
      globalQuestionsPerDay: 500,
      globalWebSearchesPerDay: 100,
      questionsPerWorkspacePerDay: 100,
      questionsPerIpPerDay: 500,
      webSearchesPerWorkspacePerDay: 30,
    };

export const clientLimits: DemoLimits = {
  maxFiles: demoLimits.maxFiles,
  maxFileBytes: demoLimits.maxFileBytes,
  maxPdfPages: demoLimits.maxPdfPages,
  questionsPerWorkspacePerDay: demoLimits.questionsPerWorkspacePerDay,
  webSearchesPerWorkspacePerDay: demoLimits.webSearchesPerWorkspacePerDay,
};
