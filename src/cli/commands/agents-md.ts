import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Agent, Project } from "../../shared/types.js";
import { createClient, handleError, requireProjectId } from "../helpers.js";

/**
 * Generate the AGENTS.md content from project + agent data.
 */
function generateAgentsMd(project: Project, agents: Agent[]): string {
  const lines: string[] = [];

  lines.push("# AGENTS.md");
  lines.push("");
  lines.push(`## Project: ${project.name}`);
  if (project.description) {
    lines.push(project.description);
  }
  lines.push("");

  lines.push("## Setup");
  lines.push("This project uses [Codepakt](https://codepakt.com) for task coordination.");
  lines.push("- Install: `npm i -g codepakt`");
  lines.push("- Server: `cpk server start`");
  lines.push("- Config: `.codepakt/config.json`");
  lines.push("");

  lines.push("## Agent Protocol");
  lines.push('1. `export CPK_AGENT=<your-name>`');
  lines.push("2. `cpk task mine` — check existing work");
  lines.push("3. `cpk task pickup` — claim next available task matching your capabilities");
  lines.push("4. Read task.context_refs for relevant docs: `cpk docs read <id>`");
  lines.push("5. Do the work");
  lines.push('6. `cpk task done <id> --notes "what you did"`');
  lines.push('7. If blocked: `cpk task block <id> --reason "why"`');
  lines.push('8. If you learned something: `cpk docs write --type learning --title "..." --body "..."`');
  lines.push("9. Repeat from step 2");

  for (const agent of agents) {
    lines.push("");
    lines.push(`## ${agent.name}`);
    if (agent.role) {
      lines.push(`**Role:** ${agent.role}`);
    }
    if (agent.provider) {
      lines.push(`**Provider:** ${agent.provider}`);
    }
    if (agent.capabilities.length > 0) {
      lines.push(`**Capabilities:** ${agent.capabilities.join(", ")}`);
    }
    if (agent.owns.length > 0) {
      lines.push(`**Owns:** ${agent.owns.join(", ")}`);
    }
    if (agent.cannot.length > 0) {
      lines.push(`**Cannot:** ${agent.cannot.join(", ")}`);
    }
  }

  // Trailing newline
  lines.push("");

  return lines.join("\n");
}

export const agentsMdCommand = new Command("agents-md").description(
  "Generate AGENTS.md for agent onboarding",
);

agentsMdCommand
  .command("generate")
  .description("Generate an AGENTS.md file from project and agent data")
  .option("-o, --output <path>", "Output file path", "./AGENTS.md")
  .action(async (opts: { output: string }) => {
    try {
      const projectId = requireProjectId();
      const client = createClient();

      const [projects, agents] = await Promise.all([
        client.listProjects(),
        client.listAgents(),
      ]);

      if (projects.length === 0) {
        console.error("No projects found. Run `cpk init` first.");
        process.exit(1);
      }

      // Use the configured project if it matches, otherwise fall back to first
      const project = projects.find((p) => p.id === projectId) ?? projects[0];
      if (!project) {
        console.error("No projects found. Run `cpk init` first.");
        process.exit(1);
      }

      const content = generateAgentsMd(project, agents);
      const outputPath = resolve(opts.output);
      writeFileSync(outputPath, content, "utf-8");

      console.log(`AGENTS.md written to ${outputPath}`);
    } catch (err) {
      handleError(err);
    }
  });
