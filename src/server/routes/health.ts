import { Hono } from "hono";
import { VERSION } from "../../shared/constants.js";

const startTime = Date.now();

const health = new Hono();

health.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: VERSION,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

export default health;
