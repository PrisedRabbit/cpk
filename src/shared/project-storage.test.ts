import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getHostedProjectDbPath,
  getLocalProjectDbPath,
  resolveProjectStorage,
} from "./project-storage.js";

const originalHome = process.env.HOME;
const originalDataDir = process.env.CPK_DATA_DIR;

afterEach(() => {
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

describe("project-storage", () => {
  it("uses CPK_DATA_DIR for hosted storage defaults when provided", () => {
    process.env.HOME = "/tmp/codepakt-home";
    process.env.CPK_DATA_DIR = "/tmp/custom-root";

    expect(getHostedProjectDbPath("proj-123")).toBe("/tmp/custom-root/projects/proj-123/data.db");
  });

  it("uses ~/.codepakt/projects/<id>/data.db for hosted storage by default", () => {
    process.env.HOME = "/tmp/codepakt-home";
    process.env.CPK_DATA_DIR = undefined;

    expect(getHostedProjectDbPath("proj-123")).toBe(
      "/tmp/codepakt-home/.codepakt/projects/proj-123/data.db",
    );
  });

  it("expands ~ and normalizes custom db_dir", () => {
    process.env.HOME = "/tmp/codepakt-home";

    expect(getHostedProjectDbPath("proj-123", "~/custom-cpk-db")).toBe(
      "/tmp/codepakt-home/custom-cpk-db/proj-123/data.db",
    );
  });

  it("keeps legacy project-local storage when path is present and db_dir is absent", () => {
    expect(getLocalProjectDbPath("/tmp/project")).toBe("/tmp/project/.codepakt/data.db");

    expect(resolveProjectStorage({ projectId: "proj-123", projectPath: "/tmp/project" })).toEqual({
      mode: "local",
      projectPath: "/tmp/project",
      dbPath: "/tmp/project/.codepakt/data.db",
    });
  });

  it("resolves relative custom db_dir from the project path", () => {
    process.env.HOME = "/tmp/codepakt-home";

    expect(
      resolveProjectStorage({
        projectId: "proj-123",
        projectPath: "/srv/worktree",
        dbDir: "../shared-dbs",
      }),
    ).toEqual({
      mode: "hosted",
      projectPath: null,
      dbPath: resolve("/srv/worktree", "../shared-dbs", "proj-123", "data.db"),
    });
  });

  it("resolves hosted relative db_dir from the configured data root", () => {
    process.env.HOME = "/tmp/codepakt-home";
    process.env.CPK_DATA_DIR = "~/.codepakt-server";

    expect(getHostedProjectDbPath("proj-123", "hosted-dbs")).toBe(
      "/tmp/codepakt-home/.codepakt-server/hosted-dbs/proj-123/data.db",
    );
  });
});
