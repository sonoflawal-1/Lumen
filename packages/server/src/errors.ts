import type { Request, Response, NextFunction } from "express";

export class ValidationError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

export class PolicyError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "PolicyError";
    this.statusCode = statusCode;
  }
}

export class StellarError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "StellarError";
    this.statusCode = statusCode;
  }
}

export type ErrorResponse = {
  error: string;
  details?: unknown;
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  console.error("Lumen error:", err);

  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  if (err instanceof PolicyError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  if (err instanceof StellarError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Default unexpected error
  return res.status(500).json({
    error: "Internal server error",
  });
};

export const wrapHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res, next);
    } catch (err: any) {
      next(err);
    }
  };
};