import { Hono } from "hono";
import { DocCreateSchema, DocSearchSchema } from "../../shared/schemas.js";
import * as db from "../db/queries.js";
import { BadRequestError, NotFoundError } from "../middleware/error.js";

const docs = new Hono();

docs.post("/docs", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const body = await c.req.json();
  const input = DocCreateSchema.parse(body);
  const doc = db.createDoc(projectId, input);
  return c.json({ data: doc }, 201);
});

docs.get("/docs", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const type = c.req.query("type");
  const list = db.listDocs(projectId, type ? { type } : undefined);
  return c.json({ data: list });
});

docs.get("/docs/search", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const query = DocSearchSchema.parse({
    q: c.req.query("q"),
    type: c.req.query("type"),
    limit: c.req.query("limit"),
  });

  const results = db.searchDocs(projectId, query.q, {
    type: query.type,
    limit: query.limit,
  });
  return c.json({ data: results });
});

docs.get("/docs/:id", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const doc = db.getDoc(projectId, c.req.param("id"));
  if (!doc) throw new NotFoundError("Doc not found");
  return c.json({ data: doc });
});

export default docs;
