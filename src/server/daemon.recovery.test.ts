import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_FILE } from "../shared/constants.js";

const originalDataDir = process.env.CPK_DATA_DIR;
let tempDir: string;

describe("daemon readiness and native recovery", () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cpk-daemon-recovery-"));
    process.env.CPK_DATA_DIR = tempDir;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) {
      process.env.CPK_DATA_DIR = undefined;
    } else {
      process.env.CPK_DATA_DIR = originalDataDir;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.unmock("node:child_process");
  });

  it("does not treat /health db.ready=false as ready", async () => {
    const execFileSync = vi.fn((command: string) => {
      if (command === "lsof") return "";
      if (command === "ps") return "";
      return "";
    });

    const fork = vi.fn(() => ({
      pid: 42101,
      unref: vi.fn(),
      disconnect: vi.fn(),
    }));

    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        execFileSync,
        fork,
      };
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            uptime_seconds: 1,
            db: { ready: false, checked: true },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            uptime_seconds: 2,
            db: { ready: true, checked: true },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { ensureLocalDaemonReady } = await import("./daemon.js");
    const ready = await ensureLocalDaemonReady({
      baseUrl: "http://localhost:41920",
      dataDir: tempDir,
      port: 41920,
      startupTimeoutMs: 200,
    });

    expect(ready.pid).toBe(42101);
    expect(fork).toHaveBeenCalledTimes(1);
  });

  it("restarts a healthy dist-backed listener from source when the repo is present", async () => {
    let listenerAlive = true;
    const execFileSync = vi.fn((command: string) => {
      if (command === "lsof") return listenerAlive ? "95311\n" : "";
      if (command === "ps") {
        return listenerAlive
          ? "/usr/local/bin/node /Users/developer/Developing/codepakt/dist/server/start.js\n"
          : "";
      }
      return "";
    });

    const fork = vi.fn(() => ({
      pid: 42102,
      unref: vi.fn(),
      disconnect: vi.fn(),
    }));

    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        execFileSync,
        fork,
      };
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            uptime_seconds: 1,
            db: { ready: true, checked: true },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            uptime_seconds: 2,
            db: { ready: true, checked: true },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    vi.spyOn(process, "kill").mockImplementation(
      (pid: number, signal?: NodeJS.Signals | number) => {
        if (pid === 95311 && signal === "SIGTERM") {
          listenerAlive = false;
          return true;
        }
        if (pid === 95311 && signal === 0) {
          return listenerAlive;
        }
        throw new Error(`unexpected kill ${String(pid)} ${String(signal)}`);
      },
    );

    const { ensureLocalDaemonReady } = await import("./daemon.js");
    const ready = await ensureLocalDaemonReady({
      baseUrl: "http://localhost:41920",
      dataDir: tempDir,
      port: 41920,
      startupTimeoutMs: 200,
    });

    expect(ready.pid).toBe(42102);
    expect(fork).toHaveBeenCalledTimes(1);
    expect(fork).toHaveBeenCalledWith(
      expect.stringContaining("/src/server/start.ts"),
      [],
      expect.objectContaining({
        execArgv: ["--import", "tsx"],
      }),
    );
  });

  it("rebuilds better-sqlite3 once and retries when native mismatch is detected", async () => {
    const commands: string[] = [];
    const execFileSync = vi.fn((command: string) => {
      commands.push(command);
      if (command === "lsof") return "";
      if (command === "ps") return "";
      if (command === "pnpm") return "rebuild complete";
      return "";
    });

    let nextPid = 50000;
    const fork = vi.fn(() => ({
      pid: ++nextPid,
      unref: vi.fn(),
      disconnect: vi.fn(),
    }));

    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        execFileSync,
        fork,
      };
    });

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.4",
            uptime_seconds: 3,
            db: { ready: true, checked: true },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    writeFileSync(
      join(tempDir, LOG_FILE),
      `${JSON.stringify({
        error: "native_module_mismatch",
        message: "better-sqlite3 was built for x86_64, runtime needs arm64",
        details: {
          addon_arch: "x86_64",
          required_arch: "arm64",
          addon_path: "/tmp/better_sqlite3.node",
          runtime_arch: "arm64",
          runtime_exec_path: "/opt/homebrew/bin/node",
          runtime_platform: "darwin",
        },
      })}\n`,
      "utf-8",
    );

    const { ensureLocalDaemonReady } = await import("./daemon.js");
    const ready = await ensureLocalDaemonReady({
      baseUrl: "http://localhost:41920",
      dataDir: tempDir,
      port: 41920,
      startupTimeoutMs: 10,
    });

    expect(ready.pid).toBe(50002);
    expect(fork).toHaveBeenCalledTimes(2);
    expect(commands.filter((command) => command === "pnpm")).toHaveLength(1);
  });
});
