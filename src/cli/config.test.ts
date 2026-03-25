import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveConfig } from "./config.js";

describe("cli config", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cpk-config-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock("./helpers.js");
    vi.unmock("./commands/generate.js");
  });

  it("persists db_dir in config files", () => {
    saveConfig({ url: "http://localhost:41920", project_id: "proj-123", db_dir: "~/remote-db" });

    expect(loadConfig()).toEqual({
      url: "http://localhost:41920",
      project_id: "proj-123",
      db_dir: "~/remote-db",
    });
  });

  it("config set db_dir updates config.json", async () => {
    saveConfig({ url: "http://localhost:41920", project_id: "proj-123" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("./helpers.js", () => ({
      createClientReady: () => ({
        updateProject: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    const { configCommand } = await import("./commands/config-cmd.js");
    await configCommand.parseAsync(["set", "db_dir", "/tmp/cpk-db"], { from: "user" });

    expect(loadConfig()?.db_dir).toBe("/tmp/cpk-db");
    expect(logSpy).toHaveBeenCalledWith("Set db_dir = /tmp/cpk-db");
  });

  it("config set db_dir updates hosted storage for the current project", async () => {
    saveConfig({ url: "http://localhost:41920", project_id: "proj-123" });

    const updateProject = vi.fn().mockResolvedValue({ id: "proj-123" });
    vi.doMock("./helpers.js", () => ({
      createClientReady: () => ({
        updateProject,
      }),
    }));

    const { configCommand } = await import("./commands/config-cmd.js");
    await configCommand.parseAsync(["set", "db_dir", "/tmp/cpk-db"], { from: "user" });

    expect(updateProject).toHaveBeenCalledWith("proj-123", { db_dir: "/tmp/cpk-db" });
  });

  it("init --db-dir writes db_dir exactly as provided", async () => {
    const createProject = vi.fn().mockResolvedValue({ id: "proj-123", name: "demo" });

    vi.doMock("./helpers.js", () => ({
      createClientReady: () => ({
        createProject,
        getBaseUrl: () => "http://localhost:41920",
        setProjectId: vi.fn(),
        createDoc: vi.fn(),
      }),
      handleError: (err: unknown) => {
        throw err;
      },
    }));
    vi.doMock("./commands/generate.js", () => ({
      runGenerate: vi.fn().mockResolvedValue(undefined),
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { initCommand } = await import("./commands/init.js");
    await initCommand.parseAsync(["--name", "demo", "--db-dir", "~/remote-db"], { from: "user" });

    const raw = JSON.parse(readFileSync(join(tempDir, ".codepakt", "config.json"), "utf-8")) as {
      db_dir?: string;
    };

    expect(createProject).toHaveBeenCalledWith({ name: "demo", db_dir: "~/remote-db" });
    expect(raw.db_dir).toBe("~/remote-db");
    expect(logSpy).toHaveBeenCalled();
  });

  it("init uses bootstrap-ready client path instead of legacy direct client creation", async () => {
    const createProject = vi.fn().mockResolvedValue({ id: "proj-123", name: "demo" });
    const createClientReady = vi.fn().mockResolvedValue({
      createProject,
      getBaseUrl: () => "http://localhost:41920",
      setProjectId: vi.fn(),
      createDoc: vi.fn(),
    });

    vi.doMock("./helpers.js", () => ({
      createClient: () => {
        throw new Error("legacy createClient path used");
      },
      createClientReady,
      handleError: (err: unknown) => {
        throw err;
      },
    }));
    vi.doMock("./commands/generate.js", () => ({
      runGenerate: vi.fn().mockResolvedValue(undefined),
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { initCommand } = await import("./commands/init.js");
    await initCommand.parseAsync(["--name", "demo"], { from: "user" });

    expect(createClientReady).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledWith({ name: "demo" });
    expect(logSpy).toHaveBeenCalled();
  });

  it("init without --db-dir defaults to hosted storage payload", async () => {
    const createProject = vi.fn().mockResolvedValue({ id: "proj-123", name: "demo" });

    vi.doMock("./helpers.js", () => ({
      createClientReady: () => ({
        createProject,
        getBaseUrl: () => "http://localhost:41920",
        setProjectId: vi.fn(),
        createDoc: vi.fn(),
      }),
      handleError: (err: unknown) => {
        throw err;
      },
    }));
    vi.doMock("./commands/generate.js", () => ({
      runGenerate: vi.fn().mockResolvedValue(undefined),
    }));

    const { initCommand } = await import("./commands/init.js");
    await initCommand.parseAsync(["--name", "demo"], { from: "user" });

    const raw = JSON.parse(readFileSync(join(tempDir, ".codepakt", "config.json"), "utf-8")) as {
      db_dir?: string;
      url: string;
      project_id: string;
    };

    expect(createProject).toHaveBeenCalledWith({ name: "demo" });
    expect(raw).toEqual({
      project_id: "proj-123",
      url: "http://localhost:41920",
    });
    expect(raw.db_dir).toBeUndefined();
  });

  it("init uses configured db_dir when the flag is omitted", async () => {
    saveConfig({ url: "http://localhost:41920", project_id: "proj-legacy", db_dir: "~/remote-db" });

    const createProject = vi.fn().mockResolvedValue({ id: "proj-123", name: "demo" });

    vi.doMock("./helpers.js", () => ({
      createClientReady: () => ({
        createProject,
        getBaseUrl: () => "http://localhost:41920",
        setProjectId: vi.fn(),
        createDoc: vi.fn(),
      }),
      handleError: (err: unknown) => {
        throw err;
      },
    }));
    vi.doMock("./commands/generate.js", () => ({
      runGenerate: vi.fn().mockResolvedValue(undefined),
    }));

    const { initCommand } = await import("./commands/init.js");
    await initCommand.parseAsync(["--name", "demo"], { from: "user" });

    expect(createProject).toHaveBeenCalledWith({ name: "demo", db_dir: "~/remote-db" });
  });
});
