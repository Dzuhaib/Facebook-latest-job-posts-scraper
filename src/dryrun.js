import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeItem } from "./normalize.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixtures", "sample-posts.json");
const FIXTURES = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

export const DEMO_POST_IDS = new Set(FIXTURES.map((entry) => String(entry.postId)));

export function loadDryRunPosts({ now = Date.now() } = {}) {
  return FIXTURES.map((entry) => {
    const { minutesAgo = 0, sourceKind = "groups", ...rest } = entry;
    return normalizeItem(
      {
        ...rest,
        timestamp: Math.floor((now - minutesAgo * 60000) / 1000)
      },
      sourceKind
    );
  }).filter((post) => post !== null);
}
