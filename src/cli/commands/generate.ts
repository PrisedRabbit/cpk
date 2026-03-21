import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_CONFIG_DIR } from "../../shared/constants.js";
import type { Agent, Project } from "../../shared/types.js";
import { createClient, handleError, requireProjectId } from "../helpers.js";

/**
 * Generate .codepakt/AGENTS.md content from project + agent data.
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
  lines.push("- Dashboard: `http://localhost:41920`");
  lines.push("- Config: `.codepakt/config.json`");
  lines.push("");

  lines.push("## Agent Protocol");
  lines.push("1. Use `--agent <your-name>` on commands (or `export CPK_AGENT=<your-name>`)");
  lines.push("2. `cpk task mine` — check existing work");
  lines.push("3. `cpk task pickup` — claim next available task");
  lines.push("4. Read task.context_refs for relevant docs: `cpk docs read <id>`");
  lines.push("5. Do the work");
  lines.push('6. `cpk task done <id> --notes "what you did"`');
  lines.push('7. If blocked: `cpk task block <id> --reason "why"`');
  lines.push('8. If you learned something: `cpk docs write --type learning --title "..." --body "..."`');
  lines.push("9. Repeat from step 2");

  if (agents.length > 0) {
    lines.push("");
    lines.push("## Active Agents");
    for (const agent of agents) {
      const taskInfo = agent.current_task_id ? `working on ${agent.current_task_id}` : "idle";
      lines.push(`- **${agent.name}** (${taskInfo})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Generate .codepakt/CLAUDE.md content with coordination instructions.
 */
function generateClaudeMd(project: Project, agents: Agent[]): string {
  const lines: string[] = [];

  lines.push("# Codepakt — Project Coordination");
  lines.push("");
  lines.push(`This project (**${project.name}**) uses [Codepakt](https://codepakt.com) for task coordination.`);
  lines.push("");

  lines.push("## Before Starting Work");
  lines.push("1. Check your assignments: `cpk task mine`");
  lines.push("2. If no assignments, pick up work: `cpk task pickup`");
  lines.push("3. Read task details: `cpk task show <id>`");
  lines.push("4. Read context_refs for relevant docs: `cpk docs read <id>`");
  lines.push("");

  lines.push("## While Working");
  lines.push('- If blocked: `cpk task block <id> --reason "why"`');
  lines.push('- If you learn something reusable: `cpk docs write --type learning --title "..." --body "..."`');
  lines.push('- Search KB when stuck: `cpk docs search "<topic>"`');
  lines.push("- Check board state: `cpk board status`");
  lines.push("");

  lines.push("## When Done");
  lines.push('1. `cpk task done <id> --notes "what you did, what changed"`');
  lines.push("2. Pick up more work: `cpk task pickup`");
  lines.push("");

  lines.push("## Board Overview");
  lines.push("- Dashboard: http://localhost:41920");
  lines.push("- CLI: `cpk board status`");
  lines.push("- Server logs: `cpk server logs -f`");
  lines.push("");

  lines.push("## CLI Quick Reference");
  lines.push("```bash");
  lines.push("cpk task mine                        # My assigned tasks");
  lines.push("cpk task pickup                      # Claim next available task");
  lines.push('cpk task done <id> --notes "..."     # Complete a task');
  lines.push('cpk task block <id> --reason "..."   # Mark blocked');
  lines.push("cpk task list                        # All tasks");
  lines.push('cpk task list --epic "Auth"           # Filter by epic');
  lines.push('cpk docs search "query"              # Search knowledge base');
  lines.push("cpk board status                     # Board health");
  lines.push("```");

  if (agents.length > 0) {
    lines.push("");
    lines.push("## Active Agents");
    for (const agent of agents) {
      const taskInfo = agent.current_task_id ? `working on ${agent.current_task_id}` : "idle";
      lines.push(`- **${agent.name}** (${taskInfo})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Write generated file to .codepakt/ and handle the root file.
 * - Always writes to .codepakt/<filename> (codepakt owns this)
 * - For root CLAUDE.md: creates if missing, or prepends @import if missing from existing
 * - For root AGENTS.md: creates if missing, never modifies existing
 */
function writeGeneratedFile(
  projectDir: string,
  filename: string,
  content: string,
  rootContent: string,
): { codepaktPath: string; rootCreated: boolean; rootExists: boolean; rootUpdated: boolean } {
  const codepaktDir = join(projectDir, PROJECT_CONFIG_DIR);
  const codepaktPath = join(codepaktDir, filename);
  const rootPath = join(projectDir, filename);

  // Always write to .codepakt/
  writeFileSync(codepaktPath, content, "utf-8");

  // Handle root file
  const rootExists = existsSync(rootPath);
  let rootCreated = false;
  let rootUpdated = false;

  if (!rootExists) {
    writeFileSync(rootPath, rootContent, "utf-8");
    rootCreated = true;
  } else if (filename === "CLAUDE.md") {
    // For CLAUDE.md: prepend @import if not already present
    const existing = readFileSync(rootPath, "utf-8");
    const importLine = `@import .codepakt/CLAUDE.md`;
    if (!existing.includes(importLine)) {
      writeFileSync(rootPath, `${importLine}\n\n${existing}`, "utf-8");
      rootUpdated = true;
    }
  }

  return { codepaktPath, rootCreated, rootExists, rootUpdated };
}

/**
 * Update .codepakt/.gitignore to only ignore config and DB files,
 * not the generated .md files.
 */
function updateGitignore(projectDir: string): void {
  const gitignorePath = join(projectDir, PROJECT_CONFIG_DIR, ".gitignore");
  const desired = `config.json\n*.db\n*.db-wal\n*.db-shm\n`;

  // Read existing content to check if it needs updating
  if (existsSync(gitignorePath)) {
    const current = readFileSync(gitignorePath, "utf-8");
    if (current === desired) return;
  }

  writeFileSync(gitignorePath, desired, "utf-8");
}

/**
 * Core generate logic — shared between `cpk generate` and `cpk init`.
 */
export async function runGenerate(projectDir?: string): Promise<void> {
  const projectId = requireProjectId();
  const client = createClient();
  const dir = projectDir ?? process.cwd();

  const [projects, agents] = await Promise.all([
    client.listProjects(),
    client.listAgents(),
  ]);

  if (projects.length === 0) {
    console.error("No projects found. Run `cpk init` first.");
    process.exit(1);
  }

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  if (!project) {
    console.error("No projects found. Run `cpk init` first.");
    process.exit(1);
  }

  // Update .gitignore before writing files
  updateGitignore(dir);

  // Generate and write AGENTS.md
  const agentsContent = generateAgentsMd(project, agents);
  const agentsRootContent = `<!-- This project uses Codepakt for task coordination. -->\n<!-- See .codepakt/AGENTS.md for the agent protocol and roster. -->\n`;
  const agentsResult = writeGeneratedFile(dir, "AGENTS.md", agentsContent, agentsRootContent);

  console.log(`  .codepakt/AGENTS.md written`);
  if (agentsResult.rootCreated) {
    console.log(`  AGENTS.md created (references .codepakt/AGENTS.md)`);
  } else if (agentsResult.rootExists) {
    console.log(`  AGENTS.md exists — not modified (codepakt manages .codepakt/AGENTS.md)`);
  }

  // Generate and write CLAUDE.md
  const claudeContent = generateClaudeMd(project, agents);
  const claudeRootContent = `@import .codepakt/CLAUDE.md\n`;
  const claudeResult = writeGeneratedFile(dir, "CLAUDE.md", claudeContent, claudeRootContent);

  console.log(`  .codepakt/CLAUDE.md written`);
  if (claudeResult.rootCreated) {
    console.log(`  CLAUDE.md created (imports .codepakt/CLAUDE.md)`);
  } else if (claudeResult.rootUpdated) {
    console.log(`  CLAUDE.md updated — prepended @import .codepakt/CLAUDE.md`);
  } else if (claudeResult.rootExists) {
    console.log(`  CLAUDE.md already imports .codepakt/CLAUDE.md`);
  }
}

export const generateCommand = new Command("generate")
  .description("Generate .codepakt/AGENTS.md and .codepakt/CLAUDE.md from project state")
  .action(async () => {
    try {
      console.log("Generating coordination files...");
      await runGenerate();
    } catch (err) {
      handleError(err);
    }
  });
