import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeAllDbs } from "../db/index.js";
import { createApp } from "../index.js";

describe("dashboard route", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    closeAllDbs();
  });

  it("renders editable task controls in the dashboard HTML", async () => {
    const response = await app.request(new Request("http://localhost/"));

    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toContain("detail-form");
    expect(html).toContain("saveTaskEdit(event, \\'");
    expect(html).toContain("task-title-");
    expect(html).toContain("task-description-");
    expect(html).toContain("task-priority-");
    expect(html).toContain("task-status-");
    expect(html).toContain("task-epic-");
    expect(html).toContain("task-depends-");
    expect(html).toContain("task-error-");
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
    expect(html).toContain("delete-project-btn");
    expect(html).toContain("delete-project-modal");
    expect(html).toContain("project-delete-status");
    expect(html).toContain("This removes the dashboard entry and Codepakt data only");
  });
});
