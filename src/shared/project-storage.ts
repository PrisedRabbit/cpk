import { isAbsolute, join, resolve } from "node:path";
import { DB_FILE, PROJECT_CONFIG_DIR, getConfiguredDataDir, resolveDataDir } from "./constants.js";

export interface ResolvedProjectStorage {
  mode: "local" | "hosted";
  projectPath: string | null;
  dbPath: string;
}

function expandHome(dir: string): string {
  return resolveDataDir(dir);
}

function getConfiguredHostedBase(): string {
  return expandHome(getConfiguredDataDir());
}

function resolveHostedRoot(dbDir?: string, projectPath?: string): string {
  if (!dbDir) {
    return join(getConfiguredHostedBase(), "projects");
  }

  const expanded = expandHome(dbDir);
  if (isAbsolute(expanded)) {
    return expanded;
  }

  if (projectPath) {
    return resolve(projectPath, expanded);
  }

  return resolve(getConfiguredHostedBase(), expanded);
}

export function getLocalProjectDbPath(projectPath: string): string {
  return join(projectPath, PROJECT_CONFIG_DIR, DB_FILE);
}

export function getHostedProjectDbPath(
  projectId: string,
  dbDir?: string,
  projectPath?: string,
): string {
  return join(resolveHostedRoot(dbDir, projectPath), projectId, DB_FILE);
}

export function resolveProjectStorage(input: {
  projectId: string;
  projectPath?: string;
  dbDir?: string;
}): ResolvedProjectStorage {
  if (input.projectPath && !input.dbDir) {
    return {
      mode: "local",
      projectPath: input.projectPath,
      dbPath: getLocalProjectDbPath(input.projectPath),
    };
  }

  return {
    mode: "hosted",
    projectPath: null,
    dbPath: getHostedProjectDbPath(input.projectId, input.dbDir, input.projectPath),
  };
}
