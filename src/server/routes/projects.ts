import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
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
  unregisterProject,
} from "../db/project-index.js";
import { getConfiguredDataDir, resolveDataDir } from "../../shared/constants.js";
import { NotFoundError } from "../middleware/error.js";

const projects = new Hono();

function closeProjectConnections(projectId: string, dbPath: string): void {
  let closeError: Error | undefined;

  try {
    closeDb(projectId);
  } catch (error) {
    closeError = error instanceof Error ? error : new Error(String(error));
  }

  try {
    closeDb(dbPath);
  } catch (error) {
    if (!closeError) {
      closeError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (closeError) {
    throw closeError;
  }

  if (!existsSync(dbPath)) {
    throw new Error(`Project database file is missing: ${dbPath}`);
  }
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

function moveFileToTrash(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`Project database file is missing: ${src}`);
  }

  mkdirSync(dirname(dest), { recursive: true });

  try {
    renameSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      throw err;
    }
    copyFileSync(src, dest);
    rmSync(src, { force: true });
  }
}

function moveProjectDbFiles(sourceDbPath: string, destDbPath: string): void {
  const sourceWal = `${sourceDbPath}-wal`;
  const sourceShm = `${sourceDbPath}-shm`;
  const moved: Array<{ src: string; dest: string }> = [];
  const rollback = (): void => {
    for (let i = moved.length - 1; i >= 0; i -= 1) {
      const movedFile = moved[i];
      if (!movedFile) continue;
      const { src, dest } = movedFile;
      if (existsSync(dest)) {
        moveFileToTrash(dest, src);
      }
    }
  };

  try {
    if (existsSync(sourceShm)) {
      moveFileToTrash(sourceShm, `${destDbPath}-shm`);
      moved.push({ src: sourceShm, dest: `${destDbPath}-shm` });
    }
    if (existsSync(sourceWal)) {
      moveFileToTrash(sourceWal, `${destDbPath}-wal`);
      moved.push({ src: sourceWal, dest: `${destDbPath}-wal` });
    }
    moveFileToTrash(sourceDbPath, destDbPath);
    moved.push({ src: sourceDbPath, dest: destDbPath });
  } catch (error) {
    rollback();
    throw error;
  }
}

function moveProjectDbToTrash(dbPath: string, trashDir: string): string {
  const trashDbPath = join(trashDir, "data.db");
  moveProjectDbFiles(dbPath, trashDbPath);

  return trashDbPath;
}

function getProjectTrashDir(projectId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return join(resolveDataDir(getConfiguredDataDir()), "trash", "projects", `${projectId}-${ts}`);
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

projects.delete("/projects/:id", (c) => {
  const id = c.req.param("id");
  const entry = getProjectEntry(id);
  if (!entry) throw new NotFoundError("Project not found");

  const trashDir = getProjectTrashDir(id);

  closeProjectConnections(id, entry.db_path);

  try {
    const trashDbPath = moveProjectDbToTrash(entry.db_path, trashDir);
    try {
      unregisterProject(id);
    } catch (rollbackError) {
      moveProjectDbFiles(trashDbPath, entry.db_path);
      throw rollbackError;
    }
    return c.json({ data: { id, trash_path: trashDir } });
  } catch (error) {
    if (existsSync(join(trashDir, "data.db"))) {
      moveProjectDbFiles(join(trashDir, "data.db"), entry.db_path);
    }
    throw error;
  }
});

export default projects;
