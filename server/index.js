#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const port = Number.parseInt(process.env.UI_PORT ?? "3000", 10);
const host = process.env.UI_HOST ?? "127.0.0.1";
const { app } = createApp({ cwd });

const server = app.listen(port, host, () => {
  console.log(`FB Fresh Leads UI: http://${host}:${port}`);
  console.log("Press Ctrl+C to stop.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Set UI_PORT=3001 and try again.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
});
