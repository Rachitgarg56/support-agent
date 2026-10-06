export type EvalEvidence = { file: string; quote: string };
export type EvalCase = {
  id: string;
  split: "development" | "holdout";
  category: string;
  question: string;
  expectedEvidence: EvalEvidence[];
  expectedAnswerTerms: string[];
  shouldAbstain: boolean;
};
export type EvalObservation = {
  caseId: string;
  answer: string;
  retrieved: Array<{ file: string; excerpt: string }>;
  latencyMs: number;
  review?: {
    answerCorrect?: boolean | null;
    citationsSupported?: boolean | null;
    abstainedCorrectly?: boolean | null;
    // Optional override when a streamed excerpt truncates the expected quote.
    retrievedEvidenceIndices?: number[];
  };
};

function normalize(value: string) {
  return value.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
}

function ratio(numerator: number, denominator: number) {
  return { numerator, denominator, value: denominator ? numerator / denominator : null };
}

function rated(observations: EvalObservation[], field: "answerCorrect" | "citationsSupported" | "abstainedCorrectly") {
  const values = observations.map((item) => item.review?.[field]).filter((value): value is boolean => typeof value === "boolean");
  return ratio(values.filter(Boolean).length, values.length);
}

export function scoreEvaluation(cases: EvalCase[], observations: EvalObservation[]) {
  const byId = new Map(cases.map((item) => [item.id, item]));
  let evidenceFound = 0;
  let evidenceTotal = 0;
  for (const observation of observations) {
    const item = byId.get(observation.caseId);
    if (!item) throw new Error(`Unknown evaluation case: ${observation.caseId}`);
    evidenceTotal += item.expectedEvidence.length;
    const topThree = observation.retrieved.slice(0, 3);
    item.expectedEvidence.forEach((evidence, index) => {
      const reviewed = observation.review?.retrievedEvidenceIndices;
      const found = reviewed
        ? reviewed.includes(index)
        : topThree.some((source) => source.file === evidence.file && normalize(source.excerpt).includes(normalize(evidence.quote)));
      if (found) evidenceFound += 1;
    });
  }
  const latencies = observations.map((item) => item.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length ? latencies[Math.ceil(p * latencies.length) - 1] : null;
  return {
    casesRun: observations.length,
    retrievalRecallAt3: ratio(evidenceFound, evidenceTotal),
    answerCorrectness: rated(observations, "answerCorrect"),
    citationSupport: rated(observations, "citationsSupported"),
    abstention: rated(observations.filter((item) => byId.get(item.caseId)?.shouldAbstain), "abstainedCorrectly"),
    latencyMs: { count: latencies.length, p50: percentile(0.5), p95: percentile(0.95) },
  };
}
