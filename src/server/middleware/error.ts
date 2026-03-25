import type { Context } from "hono";
import { ZodError } from "zod";
import { detectNativeModuleMismatch, isNativeModuleMismatchError } from "../db/index.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = "BadRequestError";
  }
}

export function handleError(err: Error, c: Context) {
  if (isNativeModuleMismatchError(err)) {
    return c.json(
      {
        error: err.code,
        message: err.message,
        details: err.details,
      },
      500,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        error: "validation_error",
        message: "Invalid request data",
        details: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      },
      400,
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: err.name.replace("Error", "").toLowerCase(),
        message: err.message,
      },
      err.statusCode as 400 | 404 | 409,
    );
  }

  const nativeMismatch = detectNativeModuleMismatch(err);
  if (nativeMismatch) {
    return c.json(
      {
        error: nativeMismatch.code,
        message: nativeMismatch.message,
        details: nativeMismatch.details,
      },
      500,
    );
  }

  // Unknown project ID → the DB connection can't be resolved
  if (err.message?.includes("No database connection for project")) {
    return c.json(
      {
        error: "project_not_found",
        message: err.message,
      },
      404,
    );
  }

  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "internal_error",
      message: "An unexpected error occurred",
    },
    500,
  );
}
