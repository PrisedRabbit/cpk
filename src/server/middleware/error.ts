import type { Context } from "hono";
import { ZodError } from "zod";

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

  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "internal_error",
      message: "An unexpected error occurred",
    },
    500,
  );
}
