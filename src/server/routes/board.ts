import { Hono } from "hono";
import * as db from "../db/queries.js";
import { BadRequestError } from "../middleware/error.js";

const board = new Hono();

board.get("/board/status", (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) throw new BadRequestError("project_id query param required");

  const status = db.getBoardStatus(projectId);
  return c.json({ data: status });
});

export default board;
