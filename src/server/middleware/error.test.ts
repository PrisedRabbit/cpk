import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { NativeModuleMismatchError } from "../db/index.js";
import { handleError } from "./error.js";

describe("error middleware", () => {
  it("surfaces native module mismatch as actionable API error", async () => {
    const app = new Hono();
    app.onError(handleError);
    app.get("/boom", () => {
      throw new NativeModuleMismatchError({
        addon_arch: "x86_64",
        addon_path: "/tmp/better_sqlite3.node",
        required_arch: "arm64",
        runtime_arch: "arm64",
        runtime_exec_path: "/opt/homebrew/bin/node",
        runtime_platform: process.platform,
      });
    });

    const res = await app.request("http://localhost/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: string;
      details: {
        addon_arch: string;
        required_arch: string;
      };
    };
    expect(body.error).toBe("native_module_mismatch");
    expect(body.details.addon_arch).toBe("x86_64");
    expect(body.details.required_arch).toBe("arm64");
  });
});
