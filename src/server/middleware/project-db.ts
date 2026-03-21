/**
 * Middleware that resolves the correct DB connection for a project.
 *
 * When a request includes project_id, looks up the project in the index
 * and opens/caches the connection to that project's .codepakt/data.db.
 *
 * Sets the DB on the Hono context so route handlers and queries can use it.
 */
import type Database from "better-sqlite3";
import { getDb, openDatabase } from "../db/index.js";
import { getProjectEntry } from "../db/project-index.js";

/**
 * Resolve project DB. Call this at the start of any route that needs a project-specific DB.
 * Returns the Database instance for the given project_id.
 *
 * Falls back to the default DB if the project isn't in the index
 * (backward compat for tests and single-DB mode).
 */
export function resolveProjectDb(projectId: string): Database.Database {
  const entry = getProjectEntry(projectId);
  if (entry) {
    return openDatabase(entry.db_path, projectId);
  }
  // Fallback: use default DB (backward compat)
  return getDb();
}
