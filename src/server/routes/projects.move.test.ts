import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const closeDb = vi.fn();
const getProjectEntry = vi.fn();
const listProjectEntries = vi.fn();
const openDatabase = vi.fn();
const registerProject = vi.fn();
const touchProject = vi.fn();
const updateProjectEntry = vi.fn();
const detectNativeModuleMismatch = vi.fn(() => undefined);
const isNativeModuleMismatchError = vi.fn(() => false);

vi.mock("../db/index.js", () => ({
  SCHEMA_VERSION: 3,
  closeDb,
  openDatabase,
  detectNativeModuleMismatch,
  isNativeModuleMismatchError,
}));

vi.mock("../db/project-index.js", () => ({
  getProjectEntry,
  listProjectEntries,
  registerProject,
  touchProject,
  updateProjectEntry,
}));

describe("projects route DB moves", () => {
  beforeEach(() => {
    closeDb.mockReset();
    getProjectEntry.mockReset();
    listProjectEntries.mockReset();
    openDatabase.mockReset();
    registerProject.mockReset();
    touchProject.mockReset();
    updateProjectEntry.mockReset();
    detectNativeModuleMismatch.mockReset();
    isNativeModuleMismatchError.mockReset();
    detectNativeModuleMismatch.mockReturnValue(undefined);
    isNativeModuleMismatchError.mockReturnValue(false);
    vi.resetModules();
  });

  it("fails before closing or moving the DB when WAL checkpointing fails", async () => {
    getProjectEntry.mockReturnValue({
      id: "proj-123",
      name: "Hosted",
      path: "/tmp/project",
      db_path: "/tmp/project/.codepakt/data.db",
      schema_version: 2,
      last_accessed: "2026-03-25T00:00:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
    });

    openDatabase.mockReturnValue({
      pragma: vi.fn(() => {
        throw new Error("database is locked");
      }),
    });

    const { default: projects } = await import("./projects.js");
    const response = await projects.request(
      new Request("http://localhost/projects/proj-123", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ db_dir: "~/hosted-dbs" }),
      }),
    );

    expect(response.status).toBe(500);
    expect(closeDb).not.toHaveBeenCalled();
    expect(updateProjectEntry).not.toHaveBeenCalled();
  });

  it("opens a single id-keyed database handle when creating a project", async () => {
    const metadataRun = vi.fn();
    openDatabase.mockReturnValue({
      prepare: vi.fn(() => ({ run: metadataRun })),
    });

    const { default: projects } = await import("./projects.js");
    const response = await projects.request(
      new Request("http://localhost/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Hosted" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(openDatabase).toHaveBeenCalledTimes(1);
    expect(openDatabase.mock.calls[0]).toEqual([
      expect.stringMatching(/\.codepakt\/projects\/.+\/data\.db$/),
      expect.any(String),
    ]);
    expect(metadataRun).toHaveBeenCalledTimes(1);
  });

  it("rejects empty PATCH bodies instead of moving hosted storage implicitly", async () => {
    getProjectEntry.mockReturnValue({
      id: "proj-123",
      name: "Hosted",
      path: null,
      db_path: "/tmp/hosted/proj-123/data.db",
      schema_version: 2,
      last_accessed: "2026-03-25T00:00:00.000Z",
      created_at: "2026-03-25T00:00:00.000Z",
    });

    const { default: projects } = await import("./projects.js");
    const { handleError } = await import("../middleware/error.js");
    const app = new Hono();
    app.onError(handleError);
    app.route("/", projects);

    const response = await app.request(
      new Request("http://localhost/projects/proj-123", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(openDatabase).not.toHaveBeenCalled();
    expect(closeDb).not.toHaveBeenCalled();
    expect(updateProjectEntry).not.toHaveBeenCalled();
  });
});
