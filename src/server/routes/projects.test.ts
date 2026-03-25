import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeAllDbs } from "../db/index.js";
import { getProjectEntry, listProjectEntries } from "../db/project-index.js";
import { createApp } from "../index.js";

describe("projects routes", () => {
  const originalHome = process.env.HOME;
  const originalDataDir = process.env.CPK_DATA_DIR;
  let tempHome: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "cpk-project-routes-"));
    process.env.HOME = tempHome;
    process.env.CPK_DATA_DIR = undefined;
    app = createApp();
  });

  afterEach(() => {
    closeAllDbs();
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

  it("creates hosted projects in the default server storage when path is omitted", async () => {
    const res = await app.request(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "remote-project" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const entry = getProjectEntry(body.data.id);

    expect(entry?.path).toBeNull();
    expect(entry?.db_path).toBe(join(tempHome, ".codepakt", "projects", body.data.id, "data.db"));
    expect(existsSync(entry?.db_path)).toBe(true);
  });

  it("uses custom db_dir for hosted projects", async () => {
    const res = await app.request(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "remote-project", db_dir: "~/custom-cpk-db" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    const entry = getProjectEntry(body.data.id);

    expect(entry?.path).toBeNull();
    expect(entry?.db_path).toBe(join(tempHome, "custom-cpk-db", body.data.id, "data.db"));
    expect(existsSync(entry?.db_path)).toBe(true);
  });

  it("keeps local project storage when path is provided without db_dir", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cpk-local-project-"));

    try {
      const res = await app.request(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "local-project", path: projectDir }),
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { id: string } };
      const entry = getProjectEntry(body.data.id);

      expect(entry?.path).toBe(projectDir);
      expect(entry?.db_path).toBe(join(projectDir, ".codepakt", "data.db"));
      expect(existsSync(entry?.db_path)).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns board status for hosted projects without a checkout path", async () => {
    const createRes = await app.request(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "remote-project" }),
      }),
    );
    const created = (await createRes.json()) as { data: { id: string } };

    const statusRes = await app.request(
      new Request(`http://localhost/api/board/status?project_id=${created.data.id}`),
    );

    expect(statusRes.status).toBe(200);
    const body = (await statusRes.json()) as { data: { coordination: Record<string, unknown> } };
    expect(body.data.coordination).toBeDefined();
  });

  it("moves an existing project DB into hosted storage when db_dir is updated", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cpk-local-project-"));

    try {
      const createRes = await app.request(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "local-project", path: projectDir }),
        }),
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { data: { id: string } };
      const oldDbPath = join(projectDir, ".codepakt", "data.db");

      const updateRes = await app.request(
        new Request(`http://localhost/api/projects/${created.data.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ db_dir: "~/hosted-dbs" }),
        }),
      );

      expect(updateRes.status).toBe(200);
      const entry = getProjectEntry(created.data.id);

      expect(entry?.path).toBeNull();
      expect(entry?.db_path).toBe(join(tempHome, "hosted-dbs", created.data.id, "data.db"));
      expect(existsSync(entry?.db_path)).toBe(true);
      expect(existsSync(oldDbPath)).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("fails db move when source database file is missing", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cpk-local-project-"));

    try {
      const createRes = await app.request(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "local-project", path: projectDir }),
        }),
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { data: { id: string } };
      const projectId = created.data.id;
      const oldDbPath = join(projectDir, ".codepakt", "data.db");
      const nextDbPath = join(tempHome, "hosted-dbs", projectId, "data.db");

      closeAllDbs();
      rmSync(oldDbPath, { force: true });
      rmSync(`${oldDbPath}-wal`, { force: true });
      rmSync(`${oldDbPath}-shm`, { force: true });

      const updateRes = await app.request(
        new Request(`http://localhost/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ db_dir: "~/hosted-dbs" }),
        }),
      );

      expect(updateRes.status).toBe(500);
      const entry = getProjectEntry(projectId);
      expect(entry?.path).toBe(projectDir);
      expect(entry?.db_path).toBe(oldDbPath);
      expect(existsSync(nextDbPath)).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("deletes a hosted project and moves db to trash", async () => {
    const createRes = await app.request(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "remote-project" }),
      }),
    );
    const created = (await createRes.json()) as { data: { id: string } };
    const entry = getProjectEntry(created.data.id)!;

    const deleteRes = await app.request(
      new Request(`http://localhost/api/projects/${created.data.id}`, {
        method: "DELETE",
      }),
    );

    expect(deleteRes.status).toBe(200);
    const body = (await deleteRes.json()) as { data: { id: string; trash_path: string } };
    expect(body.data.id).toBe(created.data.id);
    expect(listProjectEntries().find((p) => p.id === created.data.id)).toBeUndefined();
    expect(existsSync(entry.db_path)).toBe(false);
    expect(existsSync(body.data.trash_path)).toBe(true);
    expect(existsSync(join(body.data.trash_path, "data.db"))).toBe(true);
  });

  it("deletes a local project without removing checkout", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cpk-local-project-"));

    try {
      const createRes = await app.request(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "local-project", path: projectDir }),
        }),
      );
      const created = (await createRes.json()) as { data: { id: string } };
      const entry = getProjectEntry(created.data.id)!;

      const deleteRes = await app.request(
        new Request(`http://localhost/api/projects/${created.data.id}`, { method: "DELETE" }),
      );

      expect(deleteRes.status).toBe(200);
      const body = (await deleteRes.json()) as { data: { trash_path: string } };
      expect(listProjectEntries().find((p) => p.id === created.data.id)).toBeUndefined();
      expect(existsSync(entry.db_path)).toBe(false);
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(body.data.trash_path)).toBe(true);
      expect(existsSync(join(body.data.trash_path, "data.db"))).toBe(true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns 404 when deleting an unknown project", async () => {
    const res = await app.request(new Request("http://localhost/api/projects/does-not-exist", { method: "DELETE" }));
    expect(res.status).toBe(404);
  });

  it("fails delete when database file is missing and keeps index entry", async () => {
    const createRes = await app.request(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "remote-project" }),
      }),
    );
    const created = (await createRes.json()) as { data: { id: string } };
    const entry = getProjectEntry(created.data.id)!;

    closeAllDbs();
    rmSync(entry.db_path, { force: true });
    rmSync(`${entry.db_path}-wal`, { force: true });
    rmSync(`${entry.db_path}-shm`, { force: true });

    const res = await app.request(
      new Request(`http://localhost/api/projects/${created.data.id}`, { method: "DELETE" }),
    );

    expect(res.status).toBe(500);
    expect(getProjectEntry(created.data.id)).toBeDefined();
    const trashRoot = join(tempHome, ".codepakt", "trash");
    expect(existsSync(trashRoot)).toBe(false);
  });
});
