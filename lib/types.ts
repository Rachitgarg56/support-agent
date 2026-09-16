import type { UIMessage } from "ai";

export type DocumentStatus =
  | "pending"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export type DocumentSummary = {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
  createdAt: string;
};

export type DocumentCitation = {
  id: string;
  type: "document";
  documentId: string;
  fileName: string;
  pageNumber?: number;
  excerpt: string;
  similarity: number;
};

export type AppDataParts = {
  citations: { items: DocumentCitation[] };
  retrieval: {
    status: "matched" | "no_match" | "web";
    canSearchWeb: boolean;
    question: string;
  };
};

export type AppUIMessage = UIMessage<never, AppDataParts>;

export type DemoLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxPdfPages: number;
  questionsPerWorkspacePerDay: number;
  webSearchesPerWorkspacePerDay: number;
};

export type WorkspaceResponse = {
  workspaceId: string;
  limits: DemoLimits;
};
