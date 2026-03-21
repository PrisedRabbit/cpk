#!/usr/bin/env node

import { Command } from "commander";
import { agentCommand } from "./commands/agent.js";
import { agentsMdCommand } from "./commands/agents-md.js";
import { boardCommand } from "./commands/board.js";
import { configCommand } from "./commands/config-cmd.js";
import { docsCommand } from "./commands/docs.js";
import { initCommand } from "./commands/init.js";
import { serverCommand } from "./commands/server.js";
import { taskCommand } from "./commands/task.js";

const program = new Command();

program
  .name("cpk")
  .description("Codepakt — CLI-first coordination layer for AI coding agents")
  .version("0.1.0");

program.addCommand(serverCommand);
program.addCommand(initCommand);
program.addCommand(taskCommand);
program.addCommand(boardCommand);
program.addCommand(configCommand);
program.addCommand(docsCommand);
program.addCommand(agentsMdCommand);
program.addCommand(agentCommand);

program.parse();
