/**
 * CLI configuration management.
 * Manages per-project .apm/config.json and global settings.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DEFAULT_DATA_DIR, DEFAULT_PORT, PROJECT_CONFIG_DIR, resolveDataDir } from "../shared/constants.js";
import type { ProjectConfig } from "../shared/types.js";

/**
 * Get the .apm directory path for a project.
 */
function getConfigDir(projectDir?: string): string {
  return join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR);
}

/**
 * Load project config from .apm/config.json in the current or specified directory.
 */
export function loadConfig(projectDir?: string): ProjectConfig | undefined {
  const configPath = join(getConfigDir(projectDir), CONFIG_FILE);
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return undefined;
  }
}

/**
 * Save project config to .apm/config.json.
 * Auto-creates .apm/ directory with .gitignore.
 */
export function saveConfig(config: ProjectConfig, projectDir?: string): void {
  const configDir = getConfigDir(projectDir);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Auto-create .gitignore to prevent committing config
  const gitignorePath = join(configDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "*\n");
  }

  const configPath = join(configDir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Get server URL from config, env var, or default.
 */
export function getServerUrl(projectDir?: string): string {
  // Env var takes precedence
  if (process.env["CPK_URL"] ?? process.env["APM_URL"]) return (process.env["CPK_URL"] ?? process.env["APM_URL"])!;

  // Then project config
  const config = loadConfig(projectDir);
  if (config?.url) return config.url;

  // Default to localhost
  const port = Number(process.env["CPK_PORT"] ?? process.env["APM_PORT"]) || DEFAULT_PORT;
  return `http://localhost:${port}`;
}

/**
 * Get agent name from env var or config.
 */
export function getAgentName(projectDir?: string): string | undefined {
  if (process.env["CPK_AGENT"] ?? process.env["APM_AGENT"]) return (process.env["CPK_AGENT"] ?? process.env["APM_AGENT"])!;
  const config = loadConfig(projectDir);
  return config?.agent_name;
}

/**
 * Get project ID from config.
 */
export function getProjectId(projectDir?: string): string | undefined {
  const config = loadConfig(projectDir);
  return config?.project_id;
}

/**
 * Get the data directory (for server/DB).
 */
export function getDataDir(): string {
  return resolveDataDir(process.env["CPK_DATA_DIR"] ?? process.env["APM_DATA_DIR"] ?? DEFAULT_DATA_DIR);
}
