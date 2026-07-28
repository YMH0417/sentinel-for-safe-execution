import type { NextFunction, Request, Response } from "express";

type ParserError = Error & {
  status?: number;
  type?: string;
};

export function notFoundHandler(
  _req: Request,
  res: Response
): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "API endpoint not found",
    },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const candidate = err as ParserError;
  if (candidate?.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON",
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[api] unhandled error: ${message}`);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    },
  });
}
