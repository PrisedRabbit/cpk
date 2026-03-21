import { Command } from "commander";
import { createClient, handleError, output, requireProjectId } from "../helpers.js";

export const boardCommand = new Command("board").description("Board overview and status");

boardCommand
  .command("status")
  .description("Show board health: task counts, blocked tasks, agent activity")
  .option("--human", "Human-readable output")
  .action(async (opts: { human?: boolean }) => {
    try {
      requireProjectId();
      const client = createClient();
      const status = await client.getBoardStatus();
      output(status, opts.human);
    } catch (err) {
      handleError(err);
    }
  });
