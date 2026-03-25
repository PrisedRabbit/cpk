import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.CPK_DATA_DIR;
const originalHome = process.env.HOME;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cpk-daemon-"));
  process.env.CPK_DATA_DIR = tempDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });

  if (originalDataDir === undefined) {
    process.env.CPK_DATA_DIR = undefined;
  } else {
    process.env.CPK_DATA_DIR = originalDataDir;
  }

  if (originalHome === undefined) {
    process.env.HOME = undefined;
  } else {
    process.env.HOME = originalHome;
  }

  vi.restoreAllMocks();
  vi.resetModules();
  vi.unmock("node:child_process");
});

describe("daemon data dir", () => {
  it("ignores the literal undefined CPK_DATA_DIR value", async () => {
    process.env.CPK_DATA_DIR = "undefined";
    process.env.HOME = "/tmp/codepakt-home";

    const { getDaemonDataDir } = await import("./daemon.js");

    expect(getDaemonDataDir()).toBe("/tmp/codepakt-home/.codepakt");
  });
});

describe("daemon liveness reconciliation", () => {
  it("treats a Codepakt listener without pid file as running and repairs pid ownership", async () => {
    const execFileSync = vi.fn((command: string, args?: string[]) => {
      if (command === "lsof") {
        expect(args).toContain("-iTCP:41920");
        return "95311\n";
      }
      if (command === "ps") {
        expect(args).toContain("95311");
        return "/usr/local/bin/node /Users/developer/Developing/codepakt/dist/server/start.js\n";
      }
      return "";
    });

    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        execFileSync,
      };
    });

    const { isDaemonRunning } = await import("./daemon.js");
    const status = isDaemonRunning();

    expect(status).toEqual({ running: true, pid: 95311 });
    expect(readFileSync(join(tempDir, "server.pid"), "utf-8").trim()).toBe("95311");
  });
});
