import type { DocumentCitation } from "@/lib/types";

export function citedDocumentSources(answer: string, available: DocumentCitation[]) {
  const byId = new Map(available.map((source) => [source.id, source]));
  const used = new Set<string>();
  const sources: DocumentCitation[] = [];

  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const id = match[1];
    const source = byId.get(id);
    if (source && !used.has(id)) {
      sources.push(source);
      used.add(id);
    }
  }

  return sources;
}
