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
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const SCHEMA_VERSION = 1;

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

-- agents
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    capabilities TEXT NOT NULL DEFAULT '[]',
    owns TEXT NOT NULL DEFAULT '[]',
    cannot TEXT NOT NULL DEFAULT '[]',
    provider TEXT,
    status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle','working','offline')),
    current_task_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
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

  const db = new Database(dbPath);

  // Performance and safety pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  // Apply schema (idempotent via IF NOT EXISTS)
  db.exec(SCHEMA_SQL);

  // Set schema version if not already set
  const versionRow = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!versionRow) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
  }

  pool.set(poolKey, db);
  return db;
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
  const testDb = new Database(":memory:");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(SCHEMA_SQL);
  testDb.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);

  pool.set(DEFAULT_KEY, testDb);
  return testDb;
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
