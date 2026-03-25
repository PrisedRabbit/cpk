import { afterEach, describe, expect, it } from "vitest";

const originalDataDir = process.env.CPK_DATA_DIR;
const originalHome = process.env.HOME;

afterEach(() => {
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
});

describe("daemon data dir", () => {
  it("ignores the literal undefined CPK_DATA_DIR value", async () => {
    process.env.CPK_DATA_DIR = "undefined";
    process.env.HOME = "/tmp/codepakt-home";

    const { getDaemonDataDir } = await import("./daemon.js");

    expect(getDaemonDataDir()).toBe("/tmp/codepakt-home/.codepakt");
  });
});
