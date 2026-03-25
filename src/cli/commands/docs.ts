import { Command } from "commander";
import type { DocCreateInput } from "../../shared/types.js";
import { createClientReady, handleError, output, requireProjectId } from "../helpers.js";

export const docsCommand = new Command("docs").description("Knowledge base documents");

docsCommand
  .command("write")
  .description("Create a new knowledge base document")
  .requiredOption("--type <type>", "Doc type: operational, decision, reference, learning")
  .requiredOption("--title <title>", "Document title")
  .requiredOption("--body <body>", "Document body")
  .option("--section <section>", "Section/category")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--author <author>", "Author name")
  .option("--human", "Human-readable output")
  .action(async (opts) => {
    try {
      requireProjectId();
      const client = await createClientReady();

      const input: DocCreateInput = {
        type: opts.type,
        title: opts.title,
        body: opts.body,
        section: opts.section,
        tags: opts.tags ? opts.tags.split(",").map((s: string) => s.trim()) : [],
        author: opts.author,
      };

      const doc = await client.createDoc(input);
      output(doc, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

docsCommand
  .command("search <query>")
  .description("Search knowledge base documents")
  .option("--type <type>", "Filter by doc type")
  .option("--limit <n>", "Max results", "10")
  .option("--human", "Human-readable output")
  .action(async (query: string, opts: { type?: string; limit?: string; human?: boolean }) => {
    try {
      requireProjectId();
      const client = await createClientReady();
      const docs = await client.searchDocs(query, {
        type: opts.type,
        limit: opts.limit ? Number(opts.limit) : undefined,
      });
      output(docs, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

docsCommand
  .command("list")
  .description("List all knowledge base documents")
  .option("--type <type>", "Filter by doc type")
  .option("--human", "Human-readable output")
  .action(async (opts: { type?: string; human?: boolean }) => {
    try {
      requireProjectId();
      const client = await createClientReady();
      const docs = await client.listDocs({
        type: opts.type,
      });
      output(docs, opts.human);
    } catch (err) {
      handleError(err);
    }
  });

docsCommand
  .command("read <id>")
  .description("Read a single document by ID")
  .option("--human", "Human-readable output")
  .action(async (id: string, opts: { human?: boolean }) => {
    try {
      requireProjectId();
      const client = await createClientReady();
      const doc = await client.getDoc(id);
      output(doc, opts.human);
    } catch (err) {
      handleError(err);
    }
  });
