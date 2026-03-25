import { beforeEach, describe, expect, it, vi } from "vitest";

const createTask = vi.fn();
const createTasksBatch = vi.fn();
const getMyTasks = vi.fn();
const getTask = vi.fn();
const listTasks = vi.fn();
const pickupTask = vi.fn();
const updateTask = vi.fn();
const completeTask = vi.fn();
const blockTask = vi.fn();
const unblockTask = vi.fn();

vi.mock("../helpers.js", () => ({
  createClientReady: () => ({
    createTask,
    createTasksBatch,
    getMyTasks,
    getTask,
    listTasks,
    pickupTask,
    updateTask,
    completeTask,
    blockTask,
    unblockTask,
  }),
  handleError: (err: unknown) => {
    throw err;
  },
  output: vi.fn(),
  requireAgentName: (name?: string) => name ?? "dev",
  requireProjectId: () => "proj-1",
}));

describe("task command", () => {
  beforeEach(() => {
    createTask.mockReset();
    createTasksBatch.mockReset();
    getMyTasks.mockReset();
    getTask.mockReset();
    listTasks.mockReset();
    pickupTask.mockReset();
    updateTask.mockReset();
    completeTask.mockReset();
    blockTask.mockReset();
    unblockTask.mockReset();
    vi.resetModules();
  });

  it("shows tags help for add and update", async () => {
    const { taskCommand } = await import("./task.js");
    const add = taskCommand.commands.find((command) => command.name() === "add");
    const update = taskCommand.commands.find((command) => command.name() === "update");

    expect(add?.helpInformation()).toContain("--tags");
    expect(update?.helpInformation()).toContain("--tags");
  });

  it("parses tags for add", async () => {
    createTask.mockResolvedValue({ id: "task-1", tags: ["alpha", "beta"] });
    const { taskCommand } = await import("./task.js");

    await taskCommand.parseAsync(["add", "--title", "Tagged task", "--tags", "alpha,beta"], {
      from: "user",
    });

    expect(createTask).toHaveBeenCalledWith({
      title: "Tagged task",
      description: undefined,
      priority: "P1",
      epic: undefined,
      capabilities: [],
      depends_on: [],
      verify: undefined,
      acceptance_criteria: [],
      context_refs: [],
      status: "open",
      tags: ["alpha", "beta"],
    });
  });

  it("parses tags for update", async () => {
    updateTask.mockResolvedValue({ id: "task-1", tags: ["release", "ops"] });
    const { taskCommand } = await import("./task.js");

    await taskCommand.parseAsync(["update", "T-001", "--tags", "release,ops"], { from: "user" });

    expect(updateTask).toHaveBeenCalledWith("T-001", { tags: ["release", "ops"] });
  });
});
