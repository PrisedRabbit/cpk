import { Hono } from "hono";
import * as db from "../db/queries.js";
import { BadRequestError, NotFoundError } from "../middleware/error.js";

const agents = new Hono();

agents.get("/agents", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const list = db.listAgents(projectId);
  return c.json({ data: list });
});

agents.get("/agents/:name", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const agent = db.getAgent(projectId, c.req.param("name"));
  if (!agent) throw new NotFoundError("Agent not found");
  return c.json({ data: agent });
});

export default agents;
