import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getProjectByPath,
  getProjectEntry,
  listProjectEntries,
  registerProject,
} from "./project-index.js";

describe("project-index", () => {
  const originalHome = process.env.HOME;
  const originalDataDir = process.env.CPK_DATA_DIR;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "cpk-project-index-"));
    process.env.HOME = tempHome;
    process.env.CPK_DATA_DIR = undefined;
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    if (originalHome === undefined) {
      process.env.HOME = undefined;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalDataDir === undefined) {
      process.env.CPK_DATA_DIR = undefined;
    } else {
      process.env.CPK_DATA_DIR = originalDataDir;
    }
  });

  it("stores nullable project paths for hosted projects", () => {
    const entry = registerProject(
      "proj-hosted",
      "Hosted",
      null,
      "/tmp/hosted/proj-hosted/data.db",
      2,
    );

    expect(entry.path).toBeNull();
    expect(entry.db_path).toBe("/tmp/hosted/proj-hosted/data.db");
    expect(getProjectEntry("proj-hosted")?.path).toBeNull();
    expect(listProjectEntries()[0]?.path).toBeNull();
  });

  it("still indexes project-local entries by path", () => {
    const entry = registerProject(
      "proj-local",
      "Local",
      "/tmp/project",
      "/tmp/project/.codepakt/data.db",
      2,
    );

    expect(entry.path).toBe("/tmp/project");
    expect(getProjectByPath("/tmp/project")?.id).toBe("proj-local");
  });
});
