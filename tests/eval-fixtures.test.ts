import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { scoreEvaluation, type EvalCase, type EvalObservation } from "@/lib/eval/metrics";

const suite = JSON.parse(readFileSync(join(process.cwd(), "evals/cases.v1.json"), "utf8")) as {
  version: number;
  documents: string[];
  cases: EvalCase[];
};

describe("versioned fictional RAG evaluation", () => {
  it("keeps 20 questions, including eight holdouts that are not prompt-tuning examples", () => {
    expect(suite.version).toBe(1);
    expect(suite.cases).toHaveLength(20);
    expect(suite.cases.filter((item) => item.split === "holdout")).toHaveLength(8);
    expect(new Set(suite.cases.map((item) => item.id)).size).toBe(20);
    expect(new Set(suite.cases.map((item) => item.category))).toEqual(new Set(["direct", "paraphrase", "multi_document", "conflict", "unanswerable", "injection"]));
  });

  it("references actual evidence in the fictional documents without prescribing model responses", () => {
    for (const item of suite.cases) {
      expect(item.question.length).toBeGreaterThan(10);
      expect((item.expectedEvidence.length === 0)).toBe(item.shouldAbstain);
      for (const evidence of item.expectedEvidence) {
        expect(suite.documents).toContain(evidence.file);
        const document = readFileSync(join(process.cwd(), "evals/fixtures", evidence.file), "utf8");
        expect(document).toContain(evidence.quote);
      }
    }
  });

  it("reports explicit denominators and leaves unreviewed answer quality unscored", () => {
    const cases = suite.cases.slice(0, 2);
    const observations: EvalObservation[] = [
      { caseId: cases[0].id, answer: "Fresh model output", retrieved: [{ file: cases[0].expectedEvidence[0].file, excerpt: cases[0].expectedEvidence[0].quote }], latencyMs: 100, review: { answerCorrect: true, citationsSupported: true } },
      { caseId: cases[1].id, answer: "Another output", retrieved: [], latencyMs: 200 },
    ];
    const score = scoreEvaluation(cases, observations);
    expect(score.retrievalRecallAt3).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(score.answerCorrectness).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(score.citationSupport.denominator).toBe(1);
    expect(score.latencyMs).toEqual({ count: 2, p50: 100, p95: 200 });
  });

  it("does not credit evidence below rank three or from another document", () => {
    const item = suite.cases[0];
    const observation: EvalObservation = {
      caseId: item.id,
      answer: "",
      retrieved: [
        { file: "other.md", excerpt: item.expectedEvidence[0].quote },
        { file: item.expectedEvidence[0].file, excerpt: "Unrelated passage" },
        { file: "other.md", excerpt: "Also unrelated" },
        { file: item.expectedEvidence[0].file, excerpt: item.expectedEvidence[0].quote },
      ],
      latencyMs: 0,
    };
    expect(scoreEvaluation([item], [observation]).retrievalRecallAt3.numerator).toBe(0);
  });
});
