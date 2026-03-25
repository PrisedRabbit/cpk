/**
 * Shared CLI helpers — output formatting, error handling, client creation.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DaemonNativeModuleMismatchError, ensureLocalDaemonReady } from "../server/daemon.js";
import {
  COORDINATION_VERSION_PREFIX,
  DEFAULT_PORT,
  PROJECT_CONFIG_DIR,
  VERSION,
} from "../shared/constants.js";
import { ApiClient, ApiClientError } from "./api-client.js";
import { getAgentName, getDataDir, getProjectId, getServerUrl } from "./config.js";

export function createClient(): ApiClient {
  const url = getServerUrl();
  const projectId = getProjectId();
  return new ApiClient(url, projectId);
}

function isLocalDefaultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const configuredPort = Number(process.env.CPK_PORT) || DEFAULT_PORT;
    const effectivePort =
      parsed.port.length > 0
        ? Number.parseInt(parsed.port, 10)
        : parsed.protocol === "https:"
          ? 443
          : 80;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      effectivePort === configuredPort
    );
  } catch {
    return false;
  }
}

export async function createClientReady(): Promise<ApiClient> {
  const url = getServerUrl();
  const projectId = getProjectId();

  if (isLocalDefaultUrl(url)) {
    await ensureLocalDaemonReady({
      baseUrl: url,
      port: Number(process.env.CPK_PORT) || DEFAULT_PORT,
      dataDir: getDataDir(),
    });
  }

  return new ApiClient(url, projectId);
}

export function requireProjectId(): string {
  const id = getProjectId();
  if (!id) {
    console.error("No project configured. Run `cpk init` first.");
    process.exit(1);
  }
  return id;
}

export function requireAgentName(flagValue?: string): string {
  const name = flagValue ?? getAgentName();
  if (!name) {
    console.error("No agent name set. Use --agent flag or set CPK_AGENT env var.");
    process.exit(1);
  }
  return name;
}

export function output(data: unknown, human?: boolean): void {
  if (human) {
    // Human-readable output
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Compact JSON for agent consumption
    console.log(JSON.stringify(data));
  }
}

/**
 * Check if .codepakt/CLAUDE.md version stamp matches the installed CLI version.
 * Prints a warning to stderr if stale. Non-blocking.
 */
export function warnIfStaleCoordinationFiles(): void {
  try {
    const claudePath = join(process.cwd(), PROJECT_CONFIG_DIR, "CLAUDE.md");
    if (!existsSync(claudePath)) return;

    const firstLine = readFileSync(claudePath, "utf-8").split("\n")[0] ?? "";
    if (!firstLine.startsWith(COORDINATION_VERSION_PREFIX)) return;

    const fileVersion = firstLine
      .replace(COORDINATION_VERSION_PREFIX, "")
      .replace("-->", "")
      .trim();
    if (fileVersion !== VERSION) {
      console.error(
        `⚠ Coordination files outdated (v${fileVersion} → v${VERSION}). Run: cpk generate`,
      );
    }
  } catch {
    // Don't block on check failures
  }
}

export function handleError(err: unknown): never {
  if (err instanceof ApiClientError) {
    if (err.errorCode === "connection_error") {
      console.error(err.message);
    } else if (err.errorCode === "native_module_mismatch") {
      console.error(
        JSON.stringify({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }),
      );
    } else {
      console.error(JSON.stringify({ error: err.errorCode, message: err.message }));
    }
  } else if (err instanceof DaemonNativeModuleMismatchError) {
    console.error(
      JSON.stringify({
        error: err.code,
        message: err.message,
        details: err.details,
      }),
    );
  } else if ((err as { code?: unknown } | undefined)?.code === "native_module_mismatch") {
    const nativeError = err as { code: string; message?: string; details?: unknown };
    console.error(
      JSON.stringify({
        error: nativeError.code,
        message: nativeError.message ?? "Native module mismatch",
        details: nativeError.details,
      }),
    );
  } else if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error("Unknown error");
  }
  process.exit(1);
}
