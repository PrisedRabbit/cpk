import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { Hono } from "hono";
import { resolveProjectStorage } from "../../shared/project-storage.js";
import { ProjectCreateSchema, ProjectUpdateSchema } from "../../shared/schemas.js";
import { SCHEMA_VERSION, closeDb, openDatabase } from "../db/index.js";
import {
  getProjectEntry,
  listProjectEntries,
  registerProject,
  touchProject,
  updateProjectEntry,
} from "../db/project-index.js";
import { NotFoundError } from "../middleware/error.js";

const projects = new Hono();

function checkpointDatabase(dbPath: string, key?: string): void {
  if (!existsSync(dbPath)) {
    throw new Error(`Project database file is missing: ${dbPath}`);
  }

  try {
    openDatabase(dbPath, key).pragma("wal_checkpoint(TRUNCATE)");
  } catch (error) {
    throw new Error(`Failed to checkpoint project database before move: ${dbPath}`, {
      cause: error,
    });
  }
}

function closeProjectConnections(projectId: string, dbPath: string): void {
  checkpointDatabase(dbPath, projectId);
  checkpointDatabase(dbPath);
  closeDb(projectId);
  closeDb(dbPath);
}

function moveProjectDb(currentDbPath: string, nextDbPath: string): void {
  if (currentDbPath === nextDbPath) return;
  if (!existsSync(currentDbPath)) {
    throw new Error(`Project database file is missing: ${currentDbPath}`);
  }

  mkdirSync(dirname(nextDbPath), { recursive: true });

  try {
    renameSync(currentDbPath, nextDbPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      throw err;
    }

    copyFileSync(currentDbPath, nextDbPath);
    rmSync(currentDbPath, { force: true });
  }

  rmSync(`${currentDbPath}-wal`, { force: true });
  rmSync(`${currentDbPath}-shm`, { force: true });
}

/**
 * Create a project.
 *
 * With `path` and no `db_dir`, creates a project-local DB at <path>/.codepakt/data.db.
 * Without `path`, or with `db_dir`, uses hosted storage under ~/.codepakt or the custom root.
 */
projects.post("/projects", async (c) => {
  const body = await c.req.json();
  const input = ProjectCreateSchema.parse(body);

  // Generate project ID
  const id = randomUUID();
  const storage = resolveProjectStorage({
    projectId: id,
    projectPath: input.path,
    dbDir: input.db_dir,
  });

  const projectDb = openDatabase(storage.dbPath, id);

  // Register in global index with schema version
  registerProject(id, input.name, storage.projectPath, storage.dbPath, SCHEMA_VERSION);

  // Initialize task counter in metadata
  projectDb
    .prepare("INSERT OR IGNORE INTO metadata (key, value) VALUES ('next_task_number', '1')")
    .run();

  return c.json(
    {
      data: {
        id,
        name: input.name,
        description: input.description ?? null,
        path: storage.projectPath,
      },
    },
    201,
  );
});

/**
 * List all projects from the global index.
 * Dashboard uses this for the project switcher.
 * Falls back to default DB if no index entries exist.
 */
projects.get("/projects", (c) => {
  const entries = listProjectEntries();
  return c.json({ data: entries });
});

/**
 * Get a specific project's details.
 */
projects.get("/projects/:id", (c) => {
  const id = c.req.param("id");

  const entry = getProjectEntry(id);
  if (!entry) throw new NotFoundError("Project not found");

  touchProject(id);
  return c.json({
    data: {
      id: entry.id,
      name: entry.name,
      path: entry.path,
      schema_version: entry.schema_version,
      last_accessed: entry.last_accessed,
      created_at: entry.created_at,
    },
  });
});

projects.patch("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const entry = getProjectEntry(id);
  if (!entry) throw new NotFoundError("Project not found");

  const body = await c.req.json();
  const input = ProjectUpdateSchema.parse(body);
  const storage = resolveProjectStorage({
    projectId: id,
    projectPath: entry.path ?? undefined,
    dbDir: input.db_dir,
  });

  closeProjectConnections(id, entry.db_path);
  moveProjectDb(entry.db_path, storage.dbPath);

  const updated = updateProjectEntry(id, {
    path: storage.projectPath,
    db_path: storage.dbPath,
  });
  openDatabase(storage.dbPath, id);

  return c.json({
    data: {
      id,
      name: updated?.name ?? entry.name,
      path: updated?.path ?? storage.projectPath,
      schema_version: updated?.schema_version ?? entry.schema_version,
      last_accessed: updated?.last_accessed ?? entry.last_accessed,
      created_at: updated?.created_at ?? entry.created_at,
    },
  });
});

export default projects;
