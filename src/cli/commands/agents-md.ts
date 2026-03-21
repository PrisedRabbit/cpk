import { Command } from "commander";
import { handleError } from "../helpers.js";
import { runGenerate } from "./generate.js";

/**
 * Backward-compatible alias for `cpk generate`.
 * `cpk agents-md generate` now generates both AGENTS.md and CLAUDE.md.
 */
export const agentsMdCommand = new Command("agents-md").description(
  "Generate coordination files (alias for `cpk generate`)",
);

agentsMdCommand
  .command("generate")
  .description("Generate .codepakt/AGENTS.md and .codepakt/CLAUDE.md")
  .action(async () => {
    try {
      console.log("Generating coordination files...");
      await runGenerate();
    } catch (err) {
      handleError(err);
    }
  });
