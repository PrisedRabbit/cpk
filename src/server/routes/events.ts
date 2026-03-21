import { Hono } from "hono";
import { EventListQuerySchema } from "../../shared/schemas.js";
import * as db from "../db/queries.js";
import { BadRequestError } from "../middleware/error.js";

const events = new Hono();

events.get("/events", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const query = EventListQuerySchema.parse({
    task_id: c.req.query("task_id"),
    agent: c.req.query("agent"),
    limit: c.req.query("limit"),
  });

  const list = db.listEvents(projectId, query);
  return c.json({ data: list });
});

export default events;
