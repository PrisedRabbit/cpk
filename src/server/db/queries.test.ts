import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initTestDatabase } from "./index.js";
import * as db from "./queries.js";

/**
 * Test helper: creates a project context.
 * In the hybrid model, each project has its own DB. In tests, we use an in-memory
 * DB and just generate a project ID + initialize the task counter.
 */
function setupTestProject(): string {
  const projectId = randomUUID();
  db.setMetadata(projectId, "next_task_number", "1");
  return projectId;
}

describe("queries", () => {
  beforeEach(() => {
    initTestDatabase();
  });

  afterEach(() => {
    closeDb();
  });

  describe("metadata", () => {
    it("stores and retrieves metadata", () => {
      const pid = setupTestProject();
      db.setMetadata(pid, "custom_key", "custom_value");
      expect(db.getMetadata(pid, "custom_key")).toBe("custom_value");
    });

    it("initializes task counter", () => {
      const pid = setupTestProject();
      expect(db.getMetadata(pid, "next_task_number")).toBe("1");
    });
  });

  describe("tasks", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = setupTestProject();
    });

    it("creates a task with auto-incrementing task_number", () => {
      const t1 = db.createTask(projectId, { title: "First task", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const t2 = db.createTask(projectId, { title: "Second task", priority: "P1", depends_on: [], acceptance_criteria: [], status: "open" });

      expect(t1.task_number).toBe("T-001");
      expect(t2.task_number).toBe("T-002");
    });

    it("sets status to open by default when no dependencies", () => {
      const task = db.createTask(projectId, { title: "No deps", priority: "P1", depends_on: [], acceptance_criteria: [], status: "open" });
      expect(task.status).toBe("open");
      expect(task.deps_met).toBe(true);
    });

    it("sets status to backlog when dependencies are unmet", () => {
      db.createTask(projectId, { title: "First", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const t2 = db.createTask(projectId, { title: "Second", priority: "P1", depends_on: ["T-001"], acceptance_criteria: [], status: "open" });

      expect(t2.status).toBe("backlog");
      expect(t2.deps_met).toBe(false);
    });

    it("returns JSON arrays correctly", () => {
      const task = db.createTask(projectId, {
        title: "With data",
        priority: "P0",
        depends_on: ["T-001", "T-002"],
        acceptance_criteria: ["must pass tests", "must handle errors"],
        verify: "pnpm test",
        status: "open",
      });

      expect(task.depends_on).toEqual(["T-001", "T-002"]);
      expect(task.acceptance_criteria).toEqual(["must pass tests", "must handle errors"]);
      expect(task.verify).toBe("pnpm test");
      expect(task.notes).toEqual([]);
    });

    it("lists tasks filtered by status", () => {
      db.createTask(projectId, { title: "Open task", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Backlog task", priority: "P1", depends_on: [], acceptance_criteria: [], status: "backlog" });

      const open = db.listTasks(projectId, { status: "open" });
      expect(open).toHaveLength(1);
      expect(open[0]?.title).toBe("Open task");
    });

    it("gets task by task_number", () => {
      db.createTask(projectId, { title: "My task", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const task = db.getTask(projectId, "T-001");
      expect(task).toBeDefined();
      expect(task?.title).toBe("My task");
    });
  });

  describe("atomic pickup", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = setupTestProject();
      db.createAgent(projectId, { name: "dev", capabilities: [], owns: [], cannot: [] });
    });

    it("picks up the highest priority task", () => {
      db.createTask(projectId, { title: "Low priority", priority: "P2", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "High priority", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });

      const task = db.pickupTask(projectId, "dev");
      expect(task).toBeDefined();
      expect(task?.title).toBe("High priority");
      expect(task?.status).toBe("in-progress");
      expect(task?.assignee).toBe("dev");
    });

    it("returns undefined when no tasks available", () => {
      const task = db.pickupTask(projectId, "dev");
      expect(task).toBeUndefined();
    });

    it("does not pick up tasks with unmet dependencies", () => {
      db.createTask(projectId, { title: "Prerequisite", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Dependent", priority: "P0", depends_on: ["T-001"], acceptance_criteria: [], status: "open" });

      const task = db.pickupTask(projectId, "dev");
      expect(task?.task_number).toBe("T-001");
    });

    it("picks up a specific task by number", () => {
      db.createTask(projectId, { title: "First", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Second", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });

      const result = db.pickupSpecificTask(projectId, "dev", "T-002");
      expect(result.task?.task_number).toBe("T-002");
      expect(result.task?.assignee).toBe("dev");
      expect(result.error).toBeUndefined();
    });
  });

  describe("dependency resolution", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = setupTestProject();
      db.createAgent(projectId, { name: "dev", capabilities: [], owns: [], cannot: [] });
    });

    it("transitions dependent task from backlog to open when deps are met", () => {
      db.createTask(projectId, { title: "Prerequisite", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const t2 = db.createTask(projectId, { title: "Dependent", priority: "P0", depends_on: ["T-001"], acceptance_criteria: [], status: "open" });

      expect(t2.status).toBe("backlog");
      expect(t2.deps_met).toBe(false);

      db.pickupTask(projectId, "dev");
      db.completeTask(projectId, db.getTask(projectId, "T-001")!.id, "dev");
      db.markTaskDone(projectId, db.getTask(projectId, "T-001")!.id);

      const updated = db.getTask(projectId, "T-002");
      expect(updated?.status).toBe("open");
      expect(updated?.deps_met).toBe(true);
    });

    it("does not transition if not all deps are met", () => {
      db.createTask(projectId, { title: "Dep A", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Dep B", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Dependent", priority: "P0", depends_on: ["T-001", "T-002"], acceptance_criteria: [], status: "open" });

      db.pickupTask(projectId, "dev");
      db.completeTask(projectId, db.getTask(projectId, "T-001")!.id, "dev");
      db.markTaskDone(projectId, db.getTask(projectId, "T-001")!.id);

      const t3 = db.getTask(projectId, "T-003");
      expect(t3?.status).toBe("backlog");
      expect(t3?.deps_met).toBe(false);
    });
  });

  describe("task lifecycle", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = setupTestProject();
      db.createAgent(projectId, { name: "dev", capabilities: [], owns: [], cannot: [] });
    });

    it("complete appends notes", () => {
      const t = db.createTask(projectId, { title: "Work", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.pickupTask(projectId, "dev");
      const completed = db.completeTask(projectId, t.id, "dev", "Implemented the feature");

      expect(completed?.status).toBe("review");
      expect(completed?.notes).toContain("Implemented the feature");
    });

    it("block sets reason and frees agent", () => {
      db.createTask(projectId, { title: "Work", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const picked = db.pickupTask(projectId, "dev")!;
      const blocked = db.blockTask(projectId, picked.id, "dev", "Missing Redis config");

      expect(blocked?.status).toBe("blocked");
      expect(blocked?.blocker_reason).toBe("Missing Redis config");

      const agent = db.getAgent(projectId, "dev");
      expect(agent?.status).toBe("idle");
    });

    it("unblock clears reason and sets to open", () => {
      db.createTask(projectId, { title: "Work", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      const picked = db.pickupTask(projectId, "dev")!;
      db.blockTask(projectId, picked.id, "dev", "Missing config");
      const unblocked = db.unblockTask(projectId, picked.id);

      expect(unblocked?.status).toBe("open");
      expect(unblocked?.blocker_reason).toBeNull();
      expect(unblocked?.assignee).toBeNull();
    });
  });

  describe("events", () => {
    it("logs events for task operations", () => {
      const projectId = setupTestProject();
      db.createAgent(projectId, { name: "dev", capabilities: [], owns: [], cannot: [] });
      db.createTask(projectId, { title: "Work", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });

      const events = db.listEvents(projectId);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.action === "task_created")).toBe(true);
    });
  });

  describe("board status", () => {
    it("returns aggregated counts", () => {
      const projectId = setupTestProject();
      db.createTask(projectId, { title: "Open", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Backlog", priority: "P1", depends_on: [], acceptance_criteria: [], status: "backlog" });

      const status = db.getBoardStatus(projectId);
      expect(status.total).toBe(2);
      expect(status.by_status["open"]).toBe(1);
      expect(status.by_status["backlog"]).toBe(1);
    });
  });

  describe("batch creation", () => {
    it("creates multiple tasks atomically", () => {
      const projectId = setupTestProject();
      const tasks = db.createTasksBatch(projectId, [
        { title: "Task A", priority: "P0", depends_on: [], acceptance_criteria: [], status: "open" },
        { title: "Task B", priority: "P1", depends_on: [], acceptance_criteria: [], status: "open" },
        { title: "Task C", priority: "P2", depends_on: ["T-001"], acceptance_criteria: [], status: "open" },
      ]);

      expect(tasks).toHaveLength(3);
      expect(tasks[0]?.task_number).toBe("T-001");
      expect(tasks[1]?.task_number).toBe("T-002");
      expect(tasks[2]?.task_number).toBe("T-003");
      expect(tasks[2]?.status).toBe("backlog");
    });
  });

  describe("epic and context_refs", () => {
    it("stores and retrieves epic and context_refs", () => {
      const projectId = setupTestProject();
      const task = db.createTask(projectId, {
        title: "Auth endpoint",
        priority: "P0",
        epic: "Authentication",
        capabilities: ["code-write", "test"],
        depends_on: [],
        acceptance_criteria: ["JWT works"],
        context_refs: ["docs/architecture#auth", "docs/decisions/jwt"],
        status: "open",
      });

      expect(task.epic).toBe("Authentication");
      expect(task.capabilities).toEqual(["code-write", "test"]);
      expect(task.context_refs).toEqual(["docs/architecture#auth", "docs/decisions/jwt"]);
    });

    it("filters tasks by epic", () => {
      const projectId = setupTestProject();
      db.createTask(projectId, { title: "Auth login", priority: "P0", epic: "Auth", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Auth signup", priority: "P1", epic: "Auth", depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Dashboard", priority: "P1", epic: "UI", depends_on: [], acceptance_criteria: [], status: "open" });

      const authTasks = db.listTasks(projectId, { epic: "Auth" });
      expect(authTasks).toHaveLength(2);
      expect(authTasks.every((t) => t.epic === "Auth")).toBe(true);
    });
  });

  describe("capability matching in pickup", () => {
    let projectId: string;

    beforeEach(() => {
      projectId = setupTestProject();
    });

    it("skips tasks that require capabilities the agent lacks", () => {
      db.createAgent(projectId, { name: "reviewer", capabilities: ["code-read", "test"], owns: [], cannot: [] });
      db.createTask(projectId, { title: "Write feature", priority: "P0", capabilities: ["code-write"], depends_on: [], acceptance_criteria: [], status: "open" });
      db.createTask(projectId, { title: "Review code", priority: "P1", capabilities: ["code-read"], depends_on: [], acceptance_criteria: [], status: "open" });

      const task = db.pickupTask(projectId, "reviewer");
      expect(task).toBeDefined();
      expect(task?.title).toBe("Review code");
    });

    it("picks up tasks with no capabilities (any agent can do them)", () => {
      db.createAgent(projectId, { name: "dev", capabilities: ["code-write"], owns: [], cannot: [] });
      db.createTask(projectId, { title: "Generic task", priority: "P0", capabilities: [], depends_on: [], acceptance_criteria: [], status: "open" });

      const task = db.pickupTask(projectId, "dev");
      expect(task).toBeDefined();
      expect(task?.title).toBe("Generic task");
    });

    it("returns undefined when agent lacks capabilities for all tasks", () => {
      db.createAgent(projectId, { name: "docs-only", capabilities: ["docs"], owns: [], cannot: [] });
      db.createTask(projectId, { title: "Write code", priority: "P0", capabilities: ["code-write"], depends_on: [], acceptance_criteria: [], status: "open" });

      const task = db.pickupTask(projectId, "docs-only");
      expect(task).toBeUndefined();
    });

    it("returns error for specific pickup with capability mismatch", () => {
      db.createAgent(projectId, { name: "reviewer", capabilities: ["code-read"], owns: [], cannot: [] });
      db.createTask(projectId, { title: "Write code", priority: "P0", capabilities: ["code-write"], depends_on: [], acceptance_criteria: [], status: "open" });

      const result = db.pickupSpecificTask(projectId, "reviewer", "T-001");
      expect(result.error).toBeDefined();
      expect(result.error).toContain("lacks capabilities");
      expect(result.task).toBeUndefined();
    });
  });

  describe("agent extended fields", () => {
    it("stores owns, cannot, and provider", () => {
      const projectId = setupTestProject();
      const agent = db.createAgent(projectId, {
        name: "claude-dev",
        role: "Backend implementation",
        capabilities: ["code-write", "test", "bash"],
        owns: ["src/api/", "src/db/"],
        cannot: ["merge without review", "change product scope"],
        provider: "claude-code",
      });

      expect(agent.owns).toEqual(["src/api/", "src/db/"]);
      expect(agent.cannot).toEqual(["merge without review", "change product scope"]);
      expect(agent.provider).toBe("claude-code");
    });
  });
});
