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

  const config = loadConfig({ argv: args });
  const maxDisplay = args.maxDisplay ? Number.parseInt(args.maxDisplay, 10) : 20;

  let token = null;
  if (!args.dryRun) {
    assertSources(config);
    token = loadToken();
  }

  await runOnce({
    config,
    token,
    dryRun: Boolean(args.dryRun),
    maxDisplay
  });
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
