import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
const createTasksBatch = vi.fn();
const getAgentTasks = vi.fn();
const getTask = vi.fn();
const listTasks = vi.fn();
const pickupSpecificTask = vi.fn();
const pickupTask = vi.fn();
const updateTask = vi.fn();
const completeTask = vi.fn();
const markTaskDone = vi.fn();
const blockTask = vi.fn();
const unblockTask = vi.fn();

vi.mock("../db/queries.js", () => ({
  createTask,
  createTasksBatch,
  getAgentTasks,
  getTask,
  listTasks,
  pickupSpecificTask,
  pickupTask,
  updateTask,
  completeTask,
  markTaskDone,
  blockTask,
  unblockTask,
}));

vi.mock("../db/index.js", () => ({
  detectNativeModuleMismatch: vi.fn(() => undefined),
  isNativeModuleMismatchError: vi.fn(() => false),
}));

describe("tasks routes", () => {
  beforeEach(() => {
    createTask.mockReset();
    createTasksBatch.mockReset();
    getAgentTasks.mockReset();
    getTask.mockReset();
    listTasks.mockReset();
    pickupSpecificTask.mockReset();
    pickupTask.mockReset();
    updateTask.mockReset();
    completeTask.mockReset();
    markTaskDone.mockReset();
    blockTask.mockReset();
    unblockTask.mockReset();
    vi.resetModules();
  });

  it("treats same-status task patches as a no-op", async () => {
    getTask.mockReturnValue({
      id: "task-1",
      status: "open",
      title: "Same status",
    });
    updateTask.mockImplementation((_projectId, _taskId, input) => ({
      id: "task-1",
      status: input.status ?? "open",
      title: "Same status",
    }));

    const { default: tasks } = await import("./tasks.js");
    const { handleError } = await import("../middleware/error.js");
    const app = new Hono();
    app.onError(handleError);
    app.route("/", tasks);

    const response = await app.request(
      new Request("http://localhost/tasks/task-1?project_id=proj-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string } };
    expect(body.data.status).toBe("open");
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("updates tags when status stays the same but other fields change", async () => {
    getTask.mockReturnValue({
      id: "task-1",
      status: "open",
      title: "Tagged task",
      tags: ["alpha"],
    });
    updateTask.mockImplementation((_projectId, _taskId, input) => ({
      id: "task-1",
      status: input.status ?? "open",
      title: "Tagged task",
      tags: (input.tags as string[]) ?? ["alpha"],
    }));

    const { default: tasks } = await import("./tasks.js");
    const { handleError } = await import("../middleware/error.js");
    const app = new Hono();
    app.onError(handleError);
    app.route("/", tasks);

    const response = await app.request(
      new Request("http://localhost/tasks/task-1?project_id=proj-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "open", tags: ["release", "ops"] }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { tags: string[] } };
    expect(body.data.tags).toEqual(["release", "ops"]);
    expect(updateTask).toHaveBeenCalledWith("proj-1", "task-1", {
      status: "open",
      tags: ["release", "ops"],
    });
  });
});
