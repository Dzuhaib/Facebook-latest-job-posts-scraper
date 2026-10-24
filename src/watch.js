#!/usr/bin/env node
import { loadConfig, loadToken, assertSources } from "./config.js";
import { parseArgs, HELP } from "./cli.js";
import { runOnce } from "./run.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.dryRun) {
    throw new Error("--dry-run cannot be combined with watch mode. Use `npm run dry-run` instead.");
  }

  const config = loadConfig({ argv: args });
  assertSources(config);
  const token = loadToken();
  const maxDisplay = args.maxDisplay ? Number.parseInt(args.maxDisplay, 10) : 20;
  const intervalMs = config.watchIntervalMinutes * 60 * 1000;

  let stopped = false;
  let timer = null;
  let wake = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    console.log("\nStopping watch loop...");
    if (wake) wake();
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const sleepOrStop = (ms) =>
    new Promise((resolve) => {
      timer = setTimeout(() => {
        timer = null;
        resolve();
      }, ms);
      wake = () => {
        timer = null;
        resolve();
      };
    });

  console.log(
    `Watching every ${config.watchIntervalMinutes} min (window ${config.windowMinutes} min). Press Ctrl+C to stop.`
  );

  while (!stopped) {
    try {
      const cycleConfig = loadConfig({ argv: args });
      await runOnce({ config: cycleConfig, token, maxDisplay });
    } catch (error) {
      console.error(`\nRun failed: ${error.message}`);
    }

    if (stopped) break;

    const nextAt = new Date(Date.now() + intervalMs);
    console.log(`\nNext run at ${nextAt.toLocaleString()}`);
    await sleepOrStop(intervalMs);
  }

  console.log("Watch stopped.");
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
