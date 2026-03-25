/**
 * HTTP client for talking to the Codepakt server.
 * All CLI commands use this to call the API.
 */
import type {
  Agent,
  BoardStatus,
  Doc,
  DocCreateInput,
  Event,
  Project,
  ProjectUpdateInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "../shared/types.js";

interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

interface HealthResponse {
  status: string;
  version: string;
  uptime_seconds: number;
  db?: {
    ready?: boolean;
    checked?: boolean;
    error_code?: string | null;
    message?: string | null;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ApiClient {
  constructor(
    private baseUrl: string,
    private projectId?: string,
  ) {}

  private qs(): string {
    return this.projectId ? `project_id=${this.projectId}` : "";
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      const body = (await res.json()) as { data?: T } & ApiErrorResponse;

      if (!res.ok) {
        throw new ApiClientError(
          res.status,
          body.error ?? "unknown",
          body.message ?? `HTTP ${res.status}`,
          body.details,
        );
      }

      return body.data as T;
    } catch (err) {
      if (err instanceof ApiClientError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new ApiClientError(0, "timeout", "Request timed out after 10s");
      }
      throw new ApiClientError(
        0,
        "connection_error",
        `Cannot connect to server at ${this.baseUrl}. Is it running? Try: cpk server start`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setProjectId(id: string): void {
    this.projectId = id;
  }

  // --- Health ---

  async health(): Promise<HealthResponse> {
    // Health endpoint returns plain object (no { data: ... } wrapper)
    const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    const payload = (await res.json().catch(() => undefined)) as HealthResponse | undefined;
    if (!payload) {
      throw new ApiClientError(res.status, "health_check_failed", `HTTP ${res.status}`);
    }

    if (!res.ok || payload.status !== "ok" || payload.db?.ready === false) {
      const errorCode =
        payload.db?.error_code === "native_module_mismatch"
          ? "native_module_mismatch"
          : "health_check_failed";
      const message =
        payload.db?.message ??
        (errorCode === "native_module_mismatch"
          ? "Native module mismatch blocked database startup"
          : `HTTP ${res.status}`);
      throw new ApiClientError(res.status, errorCode, message, payload.db?.details);
    }

    return payload;
  }

  // --- Projects ---

  async createProject(input: {
    name: string;
    description?: string;
    path?: string;
    db_dir?: string;
  }): Promise<Project> {
    return this.request("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listProjects(): Promise<Project[]> {
    return this.request("/api/projects");
  }

  async getProject(id: string): Promise<Project> {
    return this.request(`/api/projects/${id}`);
  }

  async updateProject(id: string, input: ProjectUpdateInput): Promise<Project> {
    return this.request(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  // --- Tasks ---

  async createTask(input: TaskCreateInput): Promise<Task> {
    return this.request(`/api/tasks?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async createTasksBatch(inputs: TaskCreateInput[]): Promise<Task[]> {
    return this.request(`/api/tasks?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(inputs),
    });
  }

  async listTasks(filters?: {
    status?: string;
    assignee?: string;
    epic?: string;
    limit?: number;
  }): Promise<Task[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.status) params.set("status", filters.status);
    if (filters?.assignee) params.set("assignee", filters.assignee);
    if (filters?.epic) params.set("epic", filters.epic);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/tasks?${params.toString()}`);
  }

  async getTask(id: string): Promise<Task> {
    return this.request(`/api/tasks/${id}?${this.qs()}`);
  }

  async getMyTasks(agentName: string): Promise<Task[]> {
    return this.request(`/api/tasks/mine?${this.qs()}&agent=${encodeURIComponent(agentName)}`);
  }

  async pickupTask(agentName: string, taskId?: string): Promise<Task> {
    const params = new URLSearchParams(this.qs());
    if (taskId) params.set("task_id", taskId);
    return this.request(`/api/tasks/pickup?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ agent: agentName }),
    });
  }

  async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
    return this.request(`/api/tasks/${id}?${this.qs()}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async completeTask(id: string, agentName: string, notes?: string): Promise<Task> {
    return this.request(
      `/api/tasks/${id}/done?${this.qs()}&agent=${encodeURIComponent(agentName)}`,
      {
        method: "POST",
        body: JSON.stringify({ notes }),
      },
    );
  }

  async blockTask(id: string, reason: string, agentName?: string): Promise<Task> {
    const params = new URLSearchParams(this.qs());
    if (agentName) params.set("agent", agentName);
    return this.request(`/api/tasks/${id}/block?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async unblockTask(id: string): Promise<Task> {
    return this.request(`/api/tasks/${id}/unblock?${this.qs()}`, { method: "POST" });
  }

  // --- Board ---

  async getBoardStatus(): Promise<BoardStatus> {
    return this.request(`/api/board/status?${this.qs()}`);
  }

  // --- Agents ---

  async listAgents(): Promise<Agent[]> {
    return this.request(`/api/agents?${this.qs()}`);
  }

  // --- Events ---

  async listEvents(filters?: {
    task_id?: string;
    agent?: string;
    limit?: number;
  }): Promise<Event[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.task_id) params.set("task_id", filters.task_id);
    if (filters?.agent) params.set("agent", filters.agent);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/events?${params.toString()}`);
  }

  // --- Docs ---

  async createDoc(input: DocCreateInput): Promise<Doc> {
    return this.request(`/api/docs?${this.qs()}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async searchDocs(query: string, filters?: { type?: string; limit?: number }): Promise<Doc[]> {
    const params = new URLSearchParams(this.qs());
    params.set("q", query);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.limit) params.set("limit", String(filters.limit));
    return this.request(`/api/docs/search?${params.toString()}`);
  }

  async listDocs(filters?: { type?: string }): Promise<Doc[]> {
    const params = new URLSearchParams(this.qs());
    if (filters?.type) params.set("type", filters.type);
    return this.request(`/api/docs?${params.toString()}`);
  }

  async getDoc(id: string): Promise<Doc> {
    return this.request(`/api/docs/${id}?${this.qs()}`);
  }
}
