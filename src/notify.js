const MAX_LEADS = 10;
const TIMEOUT_MS = 10000;

function brief(lead) {
  const text = String(lead.text ?? "").replace(/\s+/g, " ").trim();
  const snippet = text.length > 240 ? `${text.slice(0, 237)}...` : text;
  const services = Array.isArray(lead.services) ? lead.services.join(", ") : "";
  return {
    id: lead.id,
    score: lead.score,
    services,
    author: lead.author,
    source: lead.sourceName,
    postUrl: lead.postUrl,
    text: snippet
  };
}

function buildMessage(leads) {
  const lines = [`${leads.length} new Facebook lead${leads.length === 1 ? "" : "s"}`];
  for (const lead of leads.slice(0, MAX_LEADS)) {
    lines.push(
      "",
      `[${lead.score}] ${lead.services || "lead"} - ${lead.author || "Unknown"}`,
      String(lead.text ?? "").replace(/\s+/g, " ").slice(0, 220),
      lead.postUrl ?? ""
    );
  }
  if (leads.length > MAX_LEADS) {
    lines.push("", `...and ${leads.length - MAX_LEADS} more in the dashboard.`);
  }
  return lines.join("\n");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${detail.slice(0, 120)}`.trim());
  }
}

export async function notifyNewLeads(leads, { log = () => {} } = {}) {
  const safe = Array.isArray(leads) ? leads.filter((lead) => lead && !lead.demo) : [];
  if (safe.length === 0) return { sent: 0, skipped: true, errors: [] };

  const message = buildMessage(safe);
  const payload = {
    event: "new_leads",
    count: safe.length,
    leads: safe.slice(0, MAX_LEADS).map(brief)
  };

  const jobs = [];

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.TELEGRAM_CHAT_ID;
  if (telegramToken && telegramChat) {
    jobs.push(
      postJson(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        chat_id: telegramChat,
        text: message,
        disable_web_page_preview: true
      }).then(() => "telegram")
    );
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (discordUrl) {
    jobs.push(
      postJson(discordUrl, { content: message.slice(0, 1900) }).then(() => "discord")
    );
  }

  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
  if (webhookUrl) {
    jobs.push(postJson(webhookUrl, payload).then(() => "webhook"));
  }

  if (jobs.length === 0) return { sent: 0, skipped: true, errors: [] };

  const errors = [];
  let sent = 0;
  const settled = await Promise.allSettled(jobs);
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      sent += 1;
      log(`Notified via ${outcome.value}`);
    } else {
      errors.push(outcome.reason?.message ?? String(outcome.reason));
      log(`Notification failed: ${errors[errors.length - 1]}`);
    }
  }

  return { sent, skipped: false, errors };
}
