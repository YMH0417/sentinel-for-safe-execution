import { parseArgs } from "util";
import { writeFile } from "fs/promises";
import { analyzeRows } from "../analysis/engine.js";
import { loadDefinition } from "../analysis/definition.js";
import { readInputFile } from "../analysis/sourceParsers.js";
import {
  addSentinelInsights,
  getSentinelDefinition,
} from "../analysis/sentinel.js";
import type { InputFormat } from "../analysis/types.js";

function usage(): string {
  return [
    "Reusable data analysis",
    "",
    "Usage:",
    "  npm run analyze -- --input <file> [options]",
    "",
    "Options:",
    "  -i, --input <file>       JSON, JSONL/NDJSON, or CSV input",
    "  -c, --config <file>      Analysis definition JSON (default: Sentinel)",
    "  -f, --format <format>    json, jsonl, or csv (inferred by extension)",
    "  -o, --output <file>      Write the result to a JSON file",
    "      --include-records    Include normalized records in the output",
    "      --fail-on-invalid    Exit with code 2 if invalid rows are found",
    "      --compact            Disable pretty JSON formatting",
    "  -h, --help               Show this help",
  ].join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      config: { type: "string", short: "c" },
      format: { type: "string", short: "f" },
      output: { type: "string", short: "o" },
      "include-records": { type: "boolean", default: false },
      "fail-on-invalid": { type: "boolean", default: false },
      compact: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!values.input) {
    throw new Error(`--input is required\n\n${usage()}`);
  }
  if (
    values.format &&
    !["json", "jsonl", "csv"].includes(values.format)
  ) {
    throw new Error("--format must be json, jsonl, or csv");
  }

  const definition = values.config
    ? await loadDefinition(values.config)
    : await getSentinelDefinition();
  const rows = await readInputFile(
    values.input,
    values.format as InputFormat | undefined
  );
  let result = analyzeRows(rows, definition);
  if (definition.name === "sentinel-events") {
    result = addSentinelInsights(result);
  }

  const outputValue = values["include-records"]
    ? { report: result.report, records: result.records }
    : result.report;
  const json = JSON.stringify(outputValue, null, values.compact ? 0 : 2);
  if (values.output) {
    await writeFile(values.output, `${json}\n`, "utf8");
    process.stdout.write(
      `Analysis written to ${values.output}: ${result.report.quality.validRows} valid, ${result.report.quality.invalidRows} invalid, ${result.report.quality.duplicateRows} duplicate\n`
    );
  } else {
    process.stdout.write(`${json}\n`);
  }

  if (
    values["fail-on-invalid"] &&
    result.report.quality.invalidRows +
      result.report.quality.duplicateRows >
      0
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Analysis failed"}\n`
  );
  process.exitCode = 1;
});
