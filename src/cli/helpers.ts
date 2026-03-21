/**
 * Shared CLI helpers — output formatting, error handling, client creation.
 */
import { ApiClient, ApiClientError } from "./api-client.js";
import { getAgentName, getProjectId, getServerUrl } from "./config.js";

export function createClient(): ApiClient {
  const url = getServerUrl();
  const projectId = getProjectId();
  return new ApiClient(url, projectId);
}

export function requireProjectId(): string {
  const id = getProjectId();
  if (!id) {
    console.error("No project configured. Run `cpk init` first.");
    process.exit(1);
  }
  return id;
}

export function requireAgentName(): string {
  const name = getAgentName();
  if (!name) {
    console.error("No agent name set. Set CPK_AGENT env var or run `cpk config set agent_name <name>`.");
    process.exit(1);
  }
  return name;
}

export function output(data: unknown, human?: boolean): void {
  if (human) {
    // Human-readable output — simple for now, improved in Week 4
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Compact JSON for agent consumption
    console.log(JSON.stringify(data));
  }
}

export function handleError(err: unknown): never {
  if (err instanceof ApiClientError) {
    if (err.errorCode === "connection_error") {
      console.error(err.message);
    } else {
      console.error(JSON.stringify({ error: err.errorCode, message: err.message }));
    }
  } else if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error("Unknown error");
  }
  process.exit(1);
}
