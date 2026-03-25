import { Hono } from "hono";
import { VERSION } from "../../shared/constants.js";
import { getDatabaseReadiness } from "../db/index.js";

const startTime = Date.now();

const health = new Hono();

health.get("/health", (c) => {
  const db = getDatabaseReadiness();
  const status = db.ready ? "ok" : "error";
  const statusCode = db.ready ? 200 : 503;

  return c.json(
    {
      status,
      version: VERSION,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      db,
    },
    statusCode as 200 | 503,
  );
});

export default health;
