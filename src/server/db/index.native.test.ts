import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("database native runtime preflight", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unmock("better-sqlite3");
  });

  it("classifies ERR_DLOPEN_FAILED into native_module_mismatch with arch details", async () => {
    const mismatch = Object.assign(
      new Error(
        "dlopen(/tmp/codepakt/node_modules/better-sqlite3/build/Release/better_sqlite3.node, 0x0001): tried: '/tmp/codepakt/node_modules/better-sqlite3/build/Release/better_sqlite3.node' (mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64'))",
      ),
      { code: "ERR_DLOPEN_FAILED" },
    );

    const DatabaseMock = vi.fn(() => {
      throw mismatch;
    });

    vi.doMock("better-sqlite3", () => ({ default: DatabaseMock }));

    const dbModule = await import("./index.js");

    expect(() => dbModule.preflightDatabaseRuntime()).toThrowError(
      dbModule.NativeModuleMismatchError,
    );

    try {
      dbModule.preflightDatabaseRuntime();
      throw new Error("Expected preflight to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(dbModule.NativeModuleMismatchError);
      const mismatchError = error as InstanceType<typeof dbModule.NativeModuleMismatchError>;
      expect(mismatchError.code).toBe("native_module_mismatch");
      expect(mismatchError.details.runtime_arch).toBe(process.arch);
      expect(mismatchError.details.addon_arch).toBe("x86_64");
      expect(mismatchError.details.required_arch).toBe("arm64");
      expect(mismatchError.details.addon_path).toContain("better_sqlite3.node");
    }

    expect(dbModule.getDatabaseReadiness()).toMatchObject({
      ready: false,
      checked: true,
      error_code: "native_module_mismatch",
    });
  });
});
