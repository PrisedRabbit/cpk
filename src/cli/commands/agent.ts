import { Command } from "commander";
import type { AgentCreateInput } from "../../shared/types.js";
import { createClient, handleError, output, requireProjectId } from "../helpers.js";

export const agentCommand = new Command("agent").description("Manage agents");

agentCommand
  .command("register")
  .description("Register an agent with capabilities and ownership rules")
  .requiredOption("-n, --name <name>", "Agent name (unique per project)")
  .option("-r, --role <role>", "Agent role (e.g. backend, frontend, infra)")
  .option("--capabilities <caps>", "Capabilities (comma-separated, e.g. code-write,test,review)")
  .option("--owns <paths>", "Owned paths/scopes (comma-separated, e.g. src/server,src/shared)")
  .option("--cannot <rules>", "Restrictions (comma-separated, e.g. deploy,modify-schema)")
  .option("--provider <provider>", "AI provider (e.g. claude, openai, gemini)")
  .option("--human", "Human-readable output")
  .action(async (opts) => {
    try {
      requireProjectId();
      const client = createClient();

      const input: AgentCreateInput = {
        name: opts.name,
        role: opts.role,
        capabilities: opts.capabilities ? opts.capabilities.split(",").map((s: string) => s.trim()) : [],
        owns: opts.owns ? opts.owns.split(",").map((s: string) => s.trim()) : [],
        cannot: opts.cannot ? opts.cannot.split(",").map((s: string) => s.trim()) : [],
        provider: opts.provider,
      };

      const agent = await client.createAgent(input);
      output(agent, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

agentCommand
  .command("list")
  .description("List all registered agents in the project")
  .option("--human", "Human-readable output")
  .action(async (opts) => {
    try {
      requireProjectId();
      const client = createClient();
      const agents = await client.listAgents();
      output(agents, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

agentCommand
  .command("status <name>")
  .description("Show status and details for a specific agent")
  .option("--human", "Human-readable output")
  .action(async (name: string, opts: { human?: boolean }) => {
    try {
      requireProjectId();
      const client = createClient();
      const agent = await client.getAgent(name);
      output(agent, opts.human);
    } catch (err) {
      handleError(err);
    }
  });
