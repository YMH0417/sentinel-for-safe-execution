import { Router, Request, Response } from "express";
import { validateDefinition } from "../analysis/definition.js";
import {
  analyzePersistedEvents,
  analyzeValues,
  getSentinelDefinition,
} from "../services/analysisService.js";

const router = Router();
const MAX_API_RECORDS = 10_000;

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await analyzePersistedEvents();
    res.json(result.report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    res.status(500).json({
      error: { code: "ANALYSIS_FAILED", message },
    });
  }
});

router.get("/definition", async (_req: Request, res: Response) => {
  try {
    res.json(await getSentinelDefinition());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Definition unavailable";
    res.status(500).json({
      error: { code: "ANALYSIS_DEFINITION_FAILED", message },
    });
  }
});

/**
 * Analyze in-memory records with either Sentinel's definition or a caller
 * supplied declarative mapping. The definition contains no executable code.
 */
router.post("/run", async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      error: {
        code: "INVALID_ANALYSIS_REQUEST",
        message: "request body must be an object",
      },
    });
  }

  const body = req.body as {
    records?: unknown;
    definition?: unknown;
    includeRecords?: unknown;
  };
  if (!Array.isArray(body.records)) {
    return res.status(400).json({
      error: {
        code: "INVALID_ANALYSIS_REQUEST",
        message: "records must be an array",
      },
    });
  }
  if (body.records.length > MAX_API_RECORDS) {
    return res.status(413).json({
      error: {
        code: "ANALYSIS_LIMIT_EXCEEDED",
        message: `records cannot exceed ${MAX_API_RECORDS} items`,
      },
    });
  }

  try {
    const definition =
      body.definition === undefined
        ? undefined
        : validateDefinition(body.definition);
    const result = await analyzeValues(body.records, definition);
    res.json(
      body.includeRecords === true
        ? { report: result.report, records: result.records }
        : result.report
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    res.status(400).json({
      error: { code: "INVALID_ANALYSIS_DEFINITION", message },
    });
  }
});

export default router;
