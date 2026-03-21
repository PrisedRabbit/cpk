import { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";

export const configCommand = new Command("config").description("Manage Codepakt configuration");

configCommand
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    if (!config) {
      console.log("No project configured. Run `cpk init` first.");
      return;
    }
    console.log(JSON.stringify(config, null, 2));
  });

configCommand
  .command("set <key> <value>")
  .description("Set a configuration value (url, project_id, agent_name)")
  .action((key: string, value: string) => {
    const config = loadConfig() ?? { url: "", project_id: "" };
    const validKeys = ["url", "project_id", "agent_name"];

    if (!validKeys.includes(key)) {
      console.error(`Unknown key: ${key}. Valid keys: ${validKeys.join(", ")}`);
      process.exit(1);
    }

    (config as unknown as Record<string, string>)[key] = value;
    saveConfig(config);
    console.log(`Set ${key} = ${value}`);
  });
