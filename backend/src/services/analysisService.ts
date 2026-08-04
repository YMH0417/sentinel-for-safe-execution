import { existsSync } from "fs";
import { analyzeRows } from "../analysis/engine.js";
import { readInputFile, rowsFromValues } from "../analysis/sourceParsers.js";
import {
  addSentinelInsights,
  analyzeSentinelRows,
  getSentinelDefinition,
} from "../analysis/sentinel.js";
import type {
  AnalysisDefinition,
  AnalysisResult,
  InputRow,
} from "../analysis/types.js";
import { getEvents, getEventsStorageLabel } from "./eventService.js";

export async function analyzePersistedEvents(): Promise<AnalysisResult> {
  const eventsFile = await getEventsStorageLabel();
  const events = await getEvents();
  const rows =
    events.length > 0
      ? rowsFromValues(events, eventsFile)
      : existsSync(eventsFile)
        ? await readInputFile(eventsFile, "jsonl")
        : rowsFromValues(events, eventsFile);
  return analyzeSentinelRows(rows);
}

export async function analyzeValues(
  values: unknown[],
  definition?: AnalysisDefinition,
  source = "api"
): Promise<AnalysisResult> {
  const rows: InputRow[] = rowsFromValues(values, source);
  if (!definition) return analyzeSentinelRows(rows);
  const result = analyzeRows(rows, definition);
  return definition.name === "sentinel-events"
    ? addSentinelInsights(result)
    : result;
}

export { getSentinelDefinition };
