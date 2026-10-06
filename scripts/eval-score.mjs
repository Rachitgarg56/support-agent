import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { scoreEvaluation } from "../lib/eval/metrics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const suite = JSON.parse(await readFile(join(root, "evals/cases.v1.json"), "utf8"));
const result = JSON.parse(await readFile(join(root, "evals/results/latest.json"), "utf8"));
console.log(JSON.stringify(scoreEvaluation(suite.cases, result.observations), null, 2));
