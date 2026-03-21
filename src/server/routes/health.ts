import { Hono } from "hono";

const startTime = Date.now();

const health = new Hono();

health.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

export default health;
