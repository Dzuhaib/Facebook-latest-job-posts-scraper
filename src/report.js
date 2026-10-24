import fs from "node:fs";
import path from "node:path";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(leads) {
  const header = [
    "posted_at",
    "age_minutes",
    "score",
    "services",
    "author",
    "source",
    "post_url",
    "likes",
    "comments",
    "shares",
    "text"
  ];
  const rows = leads.map((lead) =>
    [
      lead.postedAt,
      lead.ageMinutes,
      lead.score,
      lead.services.join("|"),
      lead.author,
      lead.sourceName,
      lead.postUrl,
      lead.engagement.likes,
      lead.engagement.comments,
      lead.engagement.shares,
      lead.text
    ]
      .map(csvCell)
      .join(",")
  );
  return `\uFEFF${header.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

function formatAge(minutes) {
  if (minutes === null || minutes === undefined) return "unknown";
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s ago`;
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m ago` : `${hours}h ago`;
}

function serviceCounts(leads) {
  const counts = {};
  for (const lead of leads) {
    for (const service of lead.services) {
      counts[service] = (counts[service] ?? 0) + 1;
    }
  }
  return counts;
}

function toMarkdown({ leads, stats, config, generatedAt }) {
  const counts = serviceCounts(leads);
  const lines = [
    `# Facebook fresh leads`,
    "",
    `Generated: ${generatedAt}`,
    `Window: last ${config.windowMinutes} minutes`,
    `Sources: ${config.sources.groups.length} group(s), ${config.sources.pages.length} page(s)`,
    `Leads: ${leads.length} (examined ${stats.examined}, outside window ${stats.outsideWindow}, duplicates ${stats.duplicate}, irrelevant ${stats.irrelevant})`,
    "",
    "## By service",
    ""
  ];

  if (Object.keys(counts).length === 0) {
    lines.push("- none");
  } else {
    for (const [service, count] of Object.entries(counts)) {
      lines.push(`- ${service}: ${count}`);
    }
  }

  lines.push("", "## Leads", "");

  if (leads.length === 0) {
    lines.push("_No matching posts in this window._");
  }

  leads.forEach((lead, index) => {
    const engagement = `likes ${lead.engagement.likes}, comments ${lead.engagement.comments}, shares ${lead.engagement.shares}`;
    lines.push(
      `### ${index + 1}. [score ${lead.score}] ${formatAge(lead.ageMinutes)} - ${lead.services.join(", ")}`,
      "",
      `**${lead.author}** | ${lead.sourceName} | ${engagement}`,
      "",
      lead.text.replace(/\r/g, "").trim(),
      "",
      `[Open post](${lead.postUrl})`,
      ""
    );
  });

  return `${lines.join("\n")}\n`;
}

export function writeReports({ config, leads, stats, generatedAt = new Date() }) {
  const outDir = config.output.dir;
  fs.mkdirSync(outDir, { recursive: true });

  const id = stamp(generatedAt);
  const payload = {
    generatedAt: generatedAt.toISOString(),
    windowMinutes: config.windowMinutes,
    minScore: config.minScore,
    sources: config.sources,
    stats,
    leads
  };

  const jsonPath = path.join(outDir, `leads-${id}.json`);
  const csvPath = path.join(outDir, `leads-${id}.csv`);
  const mdPath = path.join(outDir, `leads-${id}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(csvPath, toCsv(leads), "utf8");
  fs.writeFileSync(mdPath, toMarkdown({ leads, stats, config, generatedAt: payload.generatedAt }), "utf8");

  const latestJson = path.join(outDir, "latest.json");
  const latestCsv = path.join(outDir, "latest.csv");
  const latestMd = path.join(outDir, "latest.md");
  fs.copyFileSync(jsonPath, latestJson);
  fs.copyFileSync(csvPath, latestCsv);
  fs.copyFileSync(mdPath, latestMd);

  let jsonlPath = null;
  if (config.output.keepJsonl && leads.length > 0) {
    jsonlPath = path.join(outDir, "leads.jsonl");
    const rows = leads.map((lead) => JSON.stringify(lead)).join("\n");
    fs.appendFileSync(jsonlPath, `${rows}\n`, "utf8");
  }

  return { outDir, jsonPath, csvPath, mdPath, latestJson, latestCsv, latestMd, jsonlPath };
}

export function printLeads(leads, { max = 20, log = console.log } = {}) {
  if (leads.length === 0) {
    log("No matching fresh leads in this window.");
    return;
  }

  leads.slice(0, max).forEach((lead, index) => {
    const engagement = `likes ${lead.engagement.likes} / comments ${lead.engagement.comments}`;
    const snippet =
      lead.text.length > 320 ? `${lead.text.slice(0, 317).trimEnd()}...` : lead.text;
    log("");
    log(
      `${index + 1}. [score ${lead.score}] ${formatAge(lead.ageMinutes)} | ${lead.services.join(", ")} | ${lead.author} (${lead.sourceName})`
    );
    log(`   ${snippet.replace(/\s+/g, " ")}`);
    log(`   ${lead.postUrl} | ${engagement}`);
  });

  if (leads.length > max) {
    log(`\n...and ${leads.length - max} more lead(s) in the output files.`);
  }
}

export { formatAge };
