import { Command } from "commander";
import { createClient, handleError, output, requireProjectId } from "../helpers.js";

export const agentCommand = new Command("agent").description("Manage agents");

agentCommand
  .command("list")
  .description("List all agents that have interacted with the project")
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
