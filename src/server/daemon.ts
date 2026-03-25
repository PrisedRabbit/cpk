/**
 * Daemon management for the Codepakt server.
 * Unix-only (macOS + Ubuntu). Uses fork + detach with PID file.
 */
import { execFileSync, fork } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DATA_DIR,
  DEFAULT_PORT,
  LOG_FILE,
  PID_FILE,
  getConfiguredDataDir,
  resolveDataDir,
} from "../shared/constants.js";
import type { NativeModuleMismatchDetails } from "./db/index.js";

interface NativeMismatchLogPayload {
  error: "native_module_mismatch";
  message: string;
  details?: NativeModuleMismatchDetails;
}

export class DaemonNativeModuleMismatchError extends Error {
  readonly code = "native_module_mismatch";

  constructor(
    message: string,
    public readonly details?: NativeModuleMismatchDetails,
  ) {
    super(message);
    this.name = "DaemonNativeModuleMismatchError";
  }
}

export function getDaemonDataDir(): string {
  return resolveDataDir(getConfiguredDataDir() ?? DEFAULT_DATA_DIR);
}

function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  let root = dirname(__filename);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(root, "package.json"))) return root;
    root = dirname(root);
  }
  return root;
}

function getPort(port?: number): number {
  return port ?? (Number(process.env.CPK_PORT) || DEFAULT_PORT);
}

function getPidPath(dataDir = getDaemonDataDir()): string {
  return join(dataDir, PID_FILE);
}

function writePidFile(pid: number, dataDir = getDaemonDataDir()): void {
  writeFileSync(getPidPath(dataDir), String(pid));
}

function clearPidFile(dataDir = getDaemonDataDir()): void {
  const pidPath = getPidPath(dataDir);
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }
}

/**
 * Check if a process with the given PID is actually running.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = just check existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Read PID from file. Returns undefined if file doesn't exist or PID is stale.
 */
export function readPid(options?: { dataDir?: string }): number | undefined {
  const dataDir = options?.dataDir ?? getDaemonDataDir();
  const pidPath = getPidPath(dataDir);
  if (!existsSync(pidPath)) return undefined;

  const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
  if (Number.isNaN(pid)) {
    // Corrupt PID file — clean up
    unlinkSync(pidPath);
    return undefined;
  }

  if (!isProcessRunning(pid)) {
    // Stale PID file (process crashed or was killed)
    unlinkSync(pidPath);
    return undefined;
  }

  return pid;
}

function readProcessCommand(pid: number): string {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function isCodepaktProcess(pid: number): boolean {
  const command = readProcessCommand(pid);
  if (!command) return false;
  return (
    command.includes("/server/start.") ||
    command.includes(`${join("dist", "server", "start.js")}`) ||
    command.includes(`${join("src", "server", "start.ts")}`)
  );
}

function getListeningPid(port: number): number | undefined {
  try {
    const output = execFileSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf-8",
    }).trim();
    if (!output) return undefined;

    const firstLine = output.split("\n")[0]?.trim() ?? "";
    const pid = Number.parseInt(firstLine, 10);
    return Number.isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

function getCodepaktListeningPid(port: number): number | undefined {
  const pid = getListeningPid(port);
  if (!pid) return undefined;
  return isCodepaktProcess(pid) ? pid : undefined;
}

/**
 * Check if the daemon is currently running.
 */
export function isDaemonRunning(options?: {
  port?: number;
  dataDir?: string;
  repairPidFile?: boolean;
}): { running: boolean; pid?: number } {
  const dataDir = options?.dataDir ?? getDaemonDataDir();
  const port = getPort(options?.port);
  const pid = readPid({ dataDir });
  if (pid) return { running: true, pid };

  const listenerPid = getCodepaktListeningPid(port);
  if (!listenerPid) return { running: false };

  if (options?.repairPidFile !== false) {
    writePidFile(listenerPid, dataDir);
  }

  return { running: true, pid: listenerPid };
}

/**
 * Start the daemon. Forks a detached child process.
 * Returns the PID on success.
 */
export function startDaemon(options?: { port?: number; dataDir?: string }): number {
  const dataDir = options?.dataDir ?? getDaemonDataDir();
  const port = getPort(options?.port);
  const existing = isDaemonRunning({ port, dataDir });
  if (existing.running && existing.pid !== undefined) {
    return existing.pid;
  }

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const logPath = join(dataDir, LOG_FILE);

  // Resolve the server start script
  // In prod (npm link / global install): dist/server/start.js
  // In dev (tsx): src/server/start.ts
  const pkgRoot = getPackageRoot();

  // Prefer TS source when the repo is present so daemon starts current code.
  // Fall back to built JS for packaged installs where src/ is absent.
  const startScriptSrc = join(pkgRoot, "src", "server", "start.ts");
  const startScriptDist = join(pkgRoot, "dist", "server", "start.js");

  const scriptPath = existsSync(startScriptSrc) ? startScriptSrc : startScriptDist;

  // Open log file for stdout/stderr
  const logFd = openSync(logPath, "a");

  const child = fork(scriptPath, [], {
    detached: true,
    stdio: ["ignore", logFd, logFd, "ipc"],
    env: {
      ...process.env,
      CPK_PORT: String(port),
      CPK_DATA_DIR: dataDir,
    },
    execArgv: scriptPath.endsWith(".ts") ? ["--import", "tsx"] : [],
  });

  // Write PID file
  if (child.pid) {
    writePidFile(child.pid, dataDir);
  }

  // Detach the child — parent can exit
  child.unref();
  child.disconnect();

  if (child.pid === undefined) {
    throw new Error("Failed to start daemon: child process did not expose a PID");
  }

  return child.pid;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HealthProbeResult {
  reachable: boolean;
  servesCodepakt: boolean;
  ready: boolean;
}

async function probeHealth(baseUrl: string): Promise<HealthProbeResult> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1200) });
    const payload = (await res.json().catch(() => undefined)) as
      | {
          status?: unknown;
          version?: unknown;
          uptime_seconds?: unknown;
          db?: { ready?: unknown };
        }
      | undefined;
    if (!payload || typeof payload !== "object") {
      return { reachable: true, servesCodepakt: false, ready: false };
    }
    const servesCodepakt =
      typeof payload.version === "string" && typeof payload.uptime_seconds === "number";
    const ready = payload.status === "ok" && payload.db?.ready === true && res.ok;
    return { reachable: true, servesCodepakt, ready };
  } catch {
    return { reachable: false, servesCodepakt: false, ready: false };
  }
}

function readNativeMismatchFromLog(logPath: string): NativeMismatchLogPayload | undefined {
  if (!existsSync(logPath)) return undefined;
  const lines = readFileSync(logPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    const rawJson = line.slice(jsonStart);
    try {
      const parsed = JSON.parse(rawJson) as {
        error?: unknown;
        message?: unknown;
        details?: NativeModuleMismatchDetails;
      };
      if (parsed.error === "native_module_mismatch" && typeof parsed.message === "string") {
        return {
          error: "native_module_mismatch",
          message: parsed.message,
          details: parsed.details,
        };
      }
    } catch {
      // Ignore non-JSON lines
    }
  }

  return undefined;
}

function getRebuildCommand(pkgRoot: string): { command: string; args: string[]; display: string } {
  if (existsSync(join(pkgRoot, "pnpm-lock.yaml"))) {
    return {
      command: "pnpm",
      args: ["-C", pkgRoot, "rebuild", "better-sqlite3"],
      display: `pnpm -C ${pkgRoot} rebuild better-sqlite3`,
    };
  }
  if (existsSync(join(pkgRoot, "yarn.lock"))) {
    return {
      command: "yarn",
      args: ["--cwd", pkgRoot, "rebuild", "better-sqlite3"],
      display: `yarn --cwd ${pkgRoot} rebuild better-sqlite3`,
    };
  }
  return {
    command: "npm",
    args: ["rebuild", "better-sqlite3", "--prefix", pkgRoot],
    display: `npm rebuild better-sqlite3 --prefix ${pkgRoot}`,
  };
}

function rebuildNativeModule(pkgRoot: string): string {
  const command = getRebuildCommand(pkgRoot);
  try {
    execFileSync(command.command, command.args, {
      encoding: "utf-8",
      stdio: "pipe",
      env: process.env,
    });
    return command.display;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };
    const stdout =
      typeof execError.stdout === "string" ? execError.stdout : execError.stdout?.toString("utf-8");
    const stderr =
      typeof execError.stderr === "string" ? execError.stderr : execError.stderr?.toString("utf-8");
    throw new Error(
      `Automatic rebuild failed (${command.display}). ${execError.message}${
        stderr ? `\n${stderr.trim()}` : ""
      }${stdout ? `\n${stdout.trim()}` : ""}`,
    );
  }
}

async function waitForHealthyCodepakt(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await probeHealth(baseUrl);
    if (health.reachable && health.ready) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function terminateProcess(pid: number): Promise<void> {
  if (!isProcessRunning(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return;
    await sleep(100);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already gone
  }
}

export async function ensureLocalDaemonReady(options?: {
  port?: number;
  dataDir?: string;
  baseUrl?: string;
  startupTimeoutMs?: number;
}): Promise<{ pid?: number }> {
  const dataDir = options?.dataDir ?? getDaemonDataDir();
  const port = getPort(options?.port);
  const baseUrl = options?.baseUrl ?? `http://localhost:${port}`;
  const startupTimeoutMs = options?.startupTimeoutMs ?? 10000;
  const packageRoot = getPackageRoot();
  const sourceStartScript = join(packageRoot, "src", "server", "start.ts");
  const preferSourceDaemon = existsSync(sourceStartScript);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const pidFromFile = readPid({ dataDir });
  const health = await probeHealth(baseUrl);
  if (health.reachable && !health.servesCodepakt) {
    throw new Error(`Port ${port} is serving a non-Codepakt /health response.`);
  }

  const listenerPid = getListeningPid(port);
  const listenerIsCodepakt = listenerPid !== undefined && isCodepaktProcess(listenerPid);
  let shouldRestartDaemon = false;

  if (health.reachable && health.ready) {
    if (listenerPid !== undefined && !listenerIsCodepakt) {
      throw new Error(`Port ${port} is occupied by a non-Codepakt process (PID: ${listenerPid}).`);
    }

    if (listenerPid !== undefined) {
      const listenerCommand = readProcessCommand(listenerPid);
      const listenerIsSourceBacked = listenerCommand.includes(sourceStartScript);
      if (preferSourceDaemon && !listenerIsSourceBacked) {
        shouldRestartDaemon = true;
        await terminateProcess(listenerPid);
        clearPidFile(dataDir);
      } else {
        writePidFile(listenerPid, dataDir);
        return { pid: listenerPid };
      }
    }

    if (!shouldRestartDaemon && pidFromFile !== undefined) {
      writePidFile(pidFromFile, dataDir);
      return { pid: pidFromFile };
    }

    if (!shouldRestartDaemon) {
      return {};
    }
  }

  if (listenerPid !== undefined && listenerIsCodepakt) {
    await terminateProcess(listenerPid);
  }
  if (pidFromFile !== undefined && pidFromFile !== listenerPid && isCodepaktProcess(pidFromFile)) {
    await terminateProcess(pidFromFile);
  }
  clearPidFile(dataDir);

  const blockingPid = getListeningPid(port);
  if (blockingPid !== undefined && !isCodepaktProcess(blockingPid)) {
    throw new Error(`Port ${port} is occupied by a non-Codepakt process (PID: ${blockingPid}).`);
  }
  if (blockingPid !== undefined && isCodepaktProcess(blockingPid)) {
    const healthy = await waitForHealthyCodepakt(baseUrl, 2000);
    if (healthy) {
      writePidFile(blockingPid, dataDir);
      return { pid: blockingPid };
    }
    await terminateProcess(blockingPid);
    clearPidFile(dataDir);
  }

  const logPath = join(dataDir, LOG_FILE);
  let startedPid = startDaemon({ port, dataDir });
  let ready = await waitForHealthyCodepakt(baseUrl, startupTimeoutMs);

  if (!ready) {
    const mismatch = readNativeMismatchFromLog(logPath);
    if (!mismatch) {
      throw new Error(
        `Codepakt server failed to become healthy on :${port}. Check logs: cpk server logs`,
      );
    }

    await terminateProcess(startedPid);
    clearPidFile(dataDir);

    let rebuildCommand: string;
    try {
      rebuildCommand = rebuildNativeModule(packageRoot);
    } catch (error) {
      throw new DaemonNativeModuleMismatchError(
        `${mismatch.message} Automatic rebuild failed. ${(error as Error).message}`,
        mismatch.details,
      );
    }

    startedPid = startDaemon({ port, dataDir });
    ready = await waitForHealthyCodepakt(baseUrl, startupTimeoutMs);
    if (!ready) {
      const latestMismatch = readNativeMismatchFromLog(logPath) ?? mismatch;
      throw new DaemonNativeModuleMismatchError(
        `${latestMismatch.message} Automatic rebuild was attempted once (${rebuildCommand}) but the server is still unhealthy. Check logs: cpk server logs`,
        latestMismatch.details,
      );
    }
  }

  const finalPid = getCodepaktListeningPid(port) ?? startedPid;
  writePidFile(finalPid, dataDir);
  return { pid: finalPid };
}

/**
 * Stop the daemon by sending SIGTERM.
 */
export function stopDaemon(): boolean {
  const running = isDaemonRunning();
  if (!running.running || running.pid === undefined) return false;

  try {
    process.kill(running.pid, "SIGTERM");
  } catch {
    // Process already gone
  }

  clearPidFile();

  return true;
}
