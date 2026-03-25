import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
/**
 * Database connection management.
 *
 * Hybrid model: each project has its own SQLite file at .codepakt/data.db.
 * The server maintains a connection pool (Map<projectId, Database>), lazy-loading
 * connections as projects are accessed.
 *
 * For single-project usage (most of v0.1), there's only one connection in the pool.
 */
import Database from "better-sqlite3";

export interface NativeModuleMismatchDetails {
  runtime_arch: string;
  runtime_platform: NodeJS.Platform;
  runtime_exec_path: string;
  addon_path: string | null;
  addon_arch: string | null;
  required_arch: string | null;
  load_error_code: string;
}

interface DatabaseReadiness {
  ready: boolean;
  checked: boolean;
  checked_at: string | null;
  error_code: string | null;
  message: string | null;
  details: NativeModuleMismatchDetails | null;
}

const databaseReadiness: DatabaseReadiness = {
  ready: false,
  checked: false,
  checked_at: null,
  error_code: null,
  message: null,
  details: null,
};

function markDatabaseReady(): void {
  databaseReadiness.ready = true;
  databaseReadiness.checked = true;
  databaseReadiness.checked_at = new Date().toISOString();
  databaseReadiness.error_code = null;
  databaseReadiness.message = null;
  databaseReadiness.details = null;
}

function markDatabaseFailure(error: Error): void {
  databaseReadiness.ready = false;
  databaseReadiness.checked = true;
  databaseReadiness.checked_at = new Date().toISOString();
  if (isNativeModuleMismatchError(error)) {
    databaseReadiness.error_code = error.code;
    databaseReadiness.message = error.message;
    databaseReadiness.details = error.details;
    return;
  }

  const detectedMismatch = detectNativeModuleMismatch(error);
  if (detectedMismatch) {
    databaseReadiness.error_code = detectedMismatch.code;
    databaseReadiness.message = detectedMismatch.message;
    databaseReadiness.details = detectedMismatch.details;
    return;
  }
  databaseReadiness.error_code = "database_error";
  databaseReadiness.message = error.message;
  databaseReadiness.details = null;
}

export class NativeModuleMismatchError extends Error {
  readonly code = "native_module_mismatch";
  readonly details: NativeModuleMismatchDetails;

  constructor(details: NativeModuleMismatchDetails) {
    const addonArch = details.addon_arch ?? "unknown";
    const requiredArch = details.required_arch ?? details.runtime_arch;
    const addonPath = details.addon_path ?? "unknown";
    super(
      `Native module mismatch for better-sqlite3: addon=${addonArch}, runtime=${requiredArch}, addon_path=${addonPath}. Rebuild better-sqlite3 with the current Node runtime (${details.runtime_exec_path}).`,
    );
    this.name = "NativeModuleMismatchError";
    this.details = details;
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function extractAddonPath(message: string): string | null {
  const dlopenPath = message.match(/dlopen\(([^,]+),/)?.[1]?.trim();
  if (dlopenPath) return dlopenPath;

  const addonPath = message.match(/([^\s']*better_sqlite3\.node)/)?.[1];
  return addonPath ?? null;
}

function extractArchPair(message: string): {
  addonArch: string | null;
  requiredArch: string | null;
} {
  const pair = message.match(/have '([^']+)', need '([^']+)'/);
  return {
    addonArch: pair?.[1] ?? null,
    requiredArch: pair?.[2] ?? null,
  };
}

export function detectNativeModuleMismatch(error: unknown): NativeModuleMismatchError | undefined {
  const normalized = normalizeError(error);
  const code = (normalized as NodeJS.ErrnoException).code;
  const message = normalized.message ?? "";
  if (code !== "ERR_DLOPEN_FAILED") return undefined;
  if (!message.includes("better_sqlite3.node")) return undefined;

  const { addonArch, requiredArch } = extractArchPair(message);
  return new NativeModuleMismatchError({
    runtime_arch: process.arch,
    runtime_platform: process.platform,
    runtime_exec_path: process.execPath,
    addon_path: extractAddonPath(message),
    addon_arch: addonArch,
    required_arch: requiredArch,
    load_error_code: code,
  });
}

export function isNativeModuleMismatchError(error: unknown): error is NativeModuleMismatchError {
  return (
    error instanceof NativeModuleMismatchError ||
    ((error as { code?: unknown } | undefined)?.code === "native_module_mismatch" &&
      typeof (error as { message?: unknown } | undefined)?.message === "string")
  );
}

export function classifyDatabaseLoadError(error: unknown): Error {
  const mismatch = detectNativeModuleMismatch(error);
  if (mismatch) return mismatch;
  return normalizeError(error);
}

export function getDatabaseReadiness(): DatabaseReadiness {
  return { ...databaseReadiness };
}

export function preflightDatabaseRuntime(): void {
  let probe: Database.Database | undefined;
  try {
    probe = new Database(":memory:");
    probe.prepare("SELECT 1 AS ok").get();
    markDatabaseReady();
  } catch (error) {
    const classified = classifyDatabaseLoadError(error);
    markDatabaseFailure(classified);
    throw classified;
  } finally {
    probe?.close();
  }
}

export const SCHEMA_VERSION = 3;

const SCHEMA_SQL = `
-- schema_version
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

-- metadata (key-value store for project-level settings)
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('backlog','open','in-progress','review','blocked','done')),
    assignee TEXT,
    priority TEXT NOT NULL DEFAULT 'P1'
        CHECK (priority IN ('P0','P1','P2')),
    epic TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    capabilities TEXT NOT NULL DEFAULT '[]',
    depends_on TEXT NOT NULL DEFAULT '[]',
    deps_met INTEGER NOT NULL DEFAULT 1,
    acceptance_criteria TEXT NOT NULL DEFAULT '[]',
    context_refs TEXT NOT NULL DEFAULT '[]',
    verify TEXT,
    notes TEXT NOT NULL DEFAULT '[]',
    blocker_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    UNIQUE(project_id, task_number)
);

-- agents (auto-created on interaction, no registration needed)
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle','working')),
    current_task_id TEXT,
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, name)
);

-- events
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT,
    agent TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- docs
CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('operational','decision','reference','learning')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    section TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_deps_met ON tasks(project_id, deps_met);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_epic ON tasks(project_id, epic);
CREATE INDEX IF NOT EXISTS idx_docs_project_type ON docs(project_id, type);
`;

/**
 * Run schema migrations from oldVersion to SCHEMA_VERSION.
 * Pre-release (v0.1): destructive migrations are acceptable.
 */
function migrateSchema(db: Database.Database, oldVersion: number): void {
  if (oldVersion < 2) {
    // v1 → v2: Simplified agents table (removed role, capabilities, owns, cannot, provider, created_at; added last_seen)
    db.exec(`
      DROP TABLE IF EXISTS agents;
      CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'idle'
              CHECK (status IN ('idle','working')),
          current_task_id TEXT,
          last_seen TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, name)
      );
    `);
  }

  if (oldVersion < 3) {
    const hasTagsColumn = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).some(
      (column) => column.name === "tags",
    );
    if (!hasTagsColumn) {
      db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION);
}

/**
 * Connection pool: projectId → Database instance.
 * For backward compat and tests, a "default" key is used when no projectId is specified.
 */
const pool = new Map<string, Database.Database>();

/** Default key for single-DB mode (tests, legacy) */
const DEFAULT_KEY = "__default__";

/**
 * Open (or return cached) database connection for a specific DB file.
 * Applies schema and pragmas on first open.
 */
export function openDatabase(dbPath: string, key?: string): Database.Database {
  const poolKey = key ?? dbPath;
  const existing = pool.get(poolKey);
  if (existing) return existing;

  // Ensure parent directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath);

    // Performance and safety pragmas
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = NORMAL");

    // Apply schema (idempotent via IF NOT EXISTS)
    db.exec(SCHEMA_SQL);

    // Check schema version and migrate if needed
    const versionRow = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
      | { version: number }
      | undefined;
    if (!versionRow) {
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
    } else if (versionRow.version < SCHEMA_VERSION) {
      migrateSchema(db, versionRow.version);
    }

    pool.set(poolKey, db);
    markDatabaseReady();
    return db;
  } catch (error) {
    db?.close();
    const classified = classifyDatabaseLoadError(error);
    markDatabaseFailure(classified);
    throw classified;
  }
}

/**
 * Get schema version from a database.
 */
export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

/**
 * Initialize a single default database (backward compat).
 * Used by server start when a single dbPath is provided.
 */
export function initDatabase(dbPath: string): Database.Database {
  return openDatabase(dbPath, DEFAULT_KEY);
}

/**
 * Initialize an in-memory database for testing.
 */
export function initTestDatabase(): Database.Database {
  let testDb: Database.Database | undefined;
  try {
    testDb = new Database(":memory:");
    testDb.pragma("foreign_keys = ON");
    testDb.exec(SCHEMA_SQL);
    testDb.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);

    pool.set(DEFAULT_KEY, testDb);
    markDatabaseReady();
    return testDb;
  } catch (error) {
    testDb?.close();
    const classified = classifyDatabaseLoadError(error);
    markDatabaseFailure(classified);
    throw classified;
  }
}

/**
 * Get database by key. Falls back to default.
 *
 * If a projectId is passed and it's in the connection pool, returns that DB.
 * If not in the pool but exists in the project index, lazy-opens it.
 * If no key, returns the default DB (tests, single-project mode).
 */
export function getDb(projectId?: string): Database.Database {
  if (!projectId) {
    const db = pool.get(DEFAULT_KEY);
    if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
    return db;
  }

  // Check pool first
  const cached = pool.get(projectId);
  if (cached) return cached;

  // Try to resolve from project index (lazy open)
  if (_resolveFromIndex) {
    const db = _resolveFromIndex(projectId);
    if (db) return db;
  }

  // Last resort: try default DB
  const fallback = pool.get(DEFAULT_KEY);
  if (fallback) return fallback;

  throw new Error(`No database connection for project '${projectId}'.`);
}

/**
 * Close a specific database connection.
 */
export function closeDb(key?: string): void {
  const poolKey = key ?? DEFAULT_KEY;
  const db = pool.get(poolKey);
  if (db) {
    db.close();
    pool.delete(poolKey);
  }
}

/**
 * Close all database connections. Used in graceful shutdown.
 */
export function closeAllDbs(): void {
  for (const [key, db] of pool) {
    db.close();
    pool.delete(key);
  }
}

/**
 * Register a resolver that looks up project DB paths from the index.
 * Called by the server on startup to wire the index into the DB layer.
 * This avoids circular imports between index.ts and project-index.ts.
 */
let _resolveFromIndex: ((projectId: string) => Database.Database | undefined) | null = null;

export function setProjectResolver(
  resolver: (projectId: string) => Database.Database | undefined,
): void {
  _resolveFromIndex = resolver;
}

// Cleanup on process exit
process.on("exit", () => {
  closeAllDbs();
});
