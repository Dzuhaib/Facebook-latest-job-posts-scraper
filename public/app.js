const state = {
  page: 1,
  pageSize: 20,
  status: "all",
  services: [],
  sort: "newest",
  q: "",
  maxAgeMinutes: 0,
  skills: [],
  serviceCounts: {},
  total: 0,
  totalPages: 1,
  scanning: false,
  scanTimer: null,
  abort: null,
  lastFinish: null,
  issuesHidden: false,
  settings: null
};

const $ = (selector) => document.querySelector(selector);

const nodes = {
  scanBtn: $("#scanBtn"),
  scanBtnText: $("#scanBtnText"),
  scanSpinner: $("#scanSpinner"),
  scanBadge: $("#scanBadge"),
  scanWindowValue: $("#scanWindowValue"),
  scanWindowUnit: $("#scanWindowUnit"),
  removeDemoBtn: $("#removeDemoBtn"),
  removeDuplicatesBtn: $("#removeDuplicatesBtn"),
  settingsBtn: $("#settingsBtn"),
  lastScan: $("#lastScan"),
  statTotal: $("#statTotal"),
  statNew: $("#statNew"),
  statContacted: $("#statContacted"),
  statLastScan: $("#statLastScan"),
  sourceIssues: $("#sourceIssues"),
  sourceIssuesTitle: $("#sourceIssuesTitle"),
  sourceIssuesList: $("#sourceIssuesList"),
  dismissIssues: $("#dismissIssues"),
  statusTabs: $("#statusTabs"),
  searchInput: $("#searchInput"),
  serviceFilter: $("#serviceFilter"),
  serviceFilterBtn: $("#serviceFilterBtn"),
  serviceFilterLabel: $("#serviceFilterLabel"),
  serviceFilterMenu: $("#serviceFilterMenu"),
  recencyFilter: $("#recencyFilter"),
  sortFilter: $("#sortFilter"),
  pageSize: $("#pageSize"),
  leadTable: $("#leadTable"),
  leadRows: $("#leadRows"),
  emptyState: $("#emptyState"),
  emptyTitle: $("#emptyTitle"),
  emptyText: $("#emptyText"),
  emptyDemo: $("#emptyDemo"),
  emptyClear: $("#emptyClear"),
  pageInfo: $("#pageInfo"),
  pageNumbers: $("#pageNumbers"),
  firstPage: $("#firstPage"),
  prevPage: $("#prevPage"),
  nextPage: $("#nextPage"),
  lastPage: $("#lastPage"),
  settingsDialog: $("#settingsDialog"),
  settingsForm: $("#settingsForm"),
  closeSettings: $("#closeSettings"),
  cancelSettings: $("#cancelSettings"),
  tokenInput: $("#tokenInput"),
  tokenHint: $("#tokenHint"),
  minScoreInput: $("#minScoreInput"),
  limitInput: $("#limitInput"),
  groupsInput: $("#groupsInput"),
  pagesInput: $("#pagesInput"),
  skillsInput: $("#skillsInput"),
  testTokenBtn: $("#testTokenBtn"),
  saveSettingsBtn: $("#saveSettingsBtn"),
  toast: $("#toast")
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers ?? {}) };
  if (options.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
}

function timeAgo(ms) {
  if (!Number.isFinite(ms)) return "unknown";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const options = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleString(undefined, options);
}

function safeUrl(value, fallback = "#") {
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    /* ignore */
  }
  return fallback;
}

function initialsOf(name) {
  return (
    String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "?"
  );
}

function scoreClass(score) {
  if (score >= 10) return "high";
  if (score >= 6) return "mid";
  return "low";
}

function toast(message, type = "info") {
  nodes.toast.textContent = message;
  nodes.toast.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    nodes.toast.className = "toast";
  }, 4000);
}

function updateBadge(text, kind) {
  nodes.scanBadge.textContent = text;
  nodes.scanBadge.className = `badge ${kind}`;
}

function setScanning(value) {
  state.scanning = value;
  nodes.scanBtn.disabled = value;
  nodes.emptyDemo.disabled = value;
  nodes.removeDuplicatesBtn.disabled = value;
  nodes.scanSpinner.classList.toggle("hidden", !value);
  nodes.scanBtnText.textContent = value ? "Scanning..." : "Scan now";
}

function paintContact(pill, contacted) {
  pill.textContent = contacted ? "Contacted" : "Mark";
  pill.classList.toggle("is-contacted", contacted);
  pill.setAttribute("aria-pressed", String(contacted));
  pill.title = contacted ? "Click to move back to new" : "Click to mark as contacted";
}

function buildAvatar(lead) {
  const wrap = el("div", "avatar");
  const initials = el("span", "avatar-initials", initialsOf(lead.author));
  const pic = lead.authorPic ? safeUrl(lead.authorPic, "") : "";

  if (!pic) {
    wrap.append(initials);
    return wrap;
  }

  const img = el("img");
  img.src = pic;
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => {
    img.remove();
    wrap.append(initials);
  });
  wrap.append(img);
  return wrap;
}

function serviceClass(service) {
  return ["automation", "web", "seo"].includes(service) ? `pill ${service}` : "pill custom";
}

function renderRow(lead) {
  const row = el("tr");
  row.dataset.id = lead.id;
  row.classList.toggle("is-contacted", lead.contacted);

  const contactCell = el("td", "col-contact");
  const pill = el("button", "contact-pill");
  pill.type = "button";
  paintContact(pill, lead.contacted);
  pill.addEventListener("click", () => toggleContacted(lead, pill, row));
  contactCell.append(pill);

  const leadCell = el("td", "col-lead");
  const top = el("div", "lead-top");
  const head = el("div", "lead-head");

  const nameRow = el("div", "lead-name");
  const author = el("a", "author", lead.author || "Unknown");
  author.href = safeUrl(lead.authorUrl || lead.postUrl);
  author.target = "_blank";
  author.rel = "noopener noreferrer";
  nameRow.append(author, el("span", `score ${scoreClass(lead.score)}`, String(lead.score)));
  if (lead.demo) {
    const demo = el("span", "pill demo", "Demo");
    demo.title = "Sample data from Load demo leads - not a real Facebook post";
    nameRow.append(demo);
  }

  head.append(nameRow, el("div", "lead-source", lead.sourceName || "Unknown source"));
  top.append(buildAvatar(lead), head);

  const snippet = el("p", "snippet", lead.text || "(no text)");
  snippet.title = lead.text || "";

  const links = el("div", "lead-links");
  const open = el("a", "post-link", "Open post");
  open.href = safeUrl(lead.postUrl);
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  links.append(open);

  if (lead.authorUrl) {
    const profile = el("a", "post-link", "Profile");
    profile.href = safeUrl(lead.authorUrl);
    profile.target = "_blank";
    profile.rel = "noopener noreferrer";
    links.append(profile);
  }

  leadCell.append(top, snippet, links);

  const servicesCell = el("td", "col-services");
  const services = el("div", "services");
  for (const service of lead.services) {
    const pill = el("span", serviceClass(service), service);
    pill.title = service;
    services.append(pill);
  }
  if (!lead.services.length) services.append(el("span", "lead-source", "-"));
  servicesCell.append(services);

  const postedCell = el("td", "col-posted");
  const posted = el("div", "posted");
  posted.dataset.postedMs = String(lead.postedAtMs);
  posted.title = new Date(lead.postedAtMs).toLocaleString();
  posted.append(
    el("strong", null, timeAgo(lead.postedAtMs)),
    el("span", null, formatDate(lead.postedAt))
  );
  postedCell.append(posted);

  const engagementCell = el("td", "col-engagement");
  const engagement = el("div", "engagement");
  engagement.append(
    metric("likes", lead.engagement.likes),
    metric("comments", lead.engagement.comments),
    metric("shares", lead.engagement.shares)
  );
  engagementCell.append(engagement);

  row.append(contactCell, leadCell, servicesCell, postedCell, engagementCell);
  return row;
}

function metric(label, value) {
  const span = el("span");
  span.append(el("b", null, String(value)), document.createTextNode(` ${label}`));
  return span;
}

async function toggleContacted(lead, pill, row) {
  const next = !lead.contacted;
  lead.contacted = next;
  paintContact(pill, next);
  row.classList.toggle("is-contacted", next);

  try {
    const data = await api(`/api/leads/${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ contacted: next })
    });
    Object.assign(lead, data.lead);
    paintContact(pill, lead.contacted);
    row.classList.toggle("is-contacted", lead.contacted);
    toast(next ? "Marked as contacted" : "Moved back to new", "success");
    loadStats();
    if (state.status !== "all") loadLeads();
  } catch (error) {
    lead.contacted = !next;
    paintContact(pill, lead.contacted);
    row.classList.toggle("is-contacted", lead.contacted);
    toast(error.message, "error");
  }
}

function pageWindow(current, total, span = 2) {
  const pages = new Set([1, total]);
  for (let page = current - span; page <= current + span; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) out.push("...");
    out.push(page);
    previous = page;
  }
  return out;
}

function renderPager(data) {
  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const end = Math.min(data.total, data.page * data.pageSize);
  nodes.pageInfo.textContent =
    data.total === 0 ? "No leads" : `Showing ${start}-${end} of ${data.total}`;

  nodes.firstPage.disabled = !data.hasPrev;
  nodes.prevPage.disabled = !data.hasPrev;
  nodes.nextPage.disabled = !data.hasNext;
  nodes.lastPage.disabled = !data.hasNext;

  nodes.pageNumbers.replaceChildren();
  for (const item of pageWindow(data.page, data.totalPages)) {
    if (item === "...") {
      nodes.pageNumbers.append(el("span", "page-ellipsis", "..."));
      continue;
    }
    const button = el("button", `page-num${item === data.page ? " active" : ""}`, String(item));
    button.type = "button";
    button.dataset.page = String(item);
    button.disabled = item === data.page;
    nodes.pageNumbers.append(button);
  }
}

function renderEmpty(data) {
  const hasFilters =
    state.status !== "all" ||
    state.services.length > 0 ||
    state.maxAgeMinutes > 0 ||
    state.q !== "";

  nodes.emptyClear.classList.toggle("hidden", !hasFilters);

  if (data.total > 0) {
    nodes.leadTable.classList.remove("hidden");
    nodes.emptyState.classList.add("hidden");
    return;
  }

  nodes.leadTable.classList.add("hidden");
  nodes.emptyState.classList.remove("hidden");

  if (hasFilters) {
    nodes.emptyTitle.textContent = "No matching leads";
    nodes.emptyText.textContent = "Try a different search or clear the filters.";
  } else {
    nodes.emptyTitle.textContent = "No leads yet";
    nodes.emptyText.textContent = "Run a scan to fetch fresh Facebook posts, or load demo data.";
  }
}

async function loadLeads() {
  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;

  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    status: state.status,
    services: state.services.join(","),
    sort: state.sort,
    q: state.q,
    maxAgeMinutes: String(state.maxAgeMinutes)
  });

  try {
    const data = await api(`/api/leads?${params.toString()}`, {
      signal: controller.signal
    });
    if (state.abort !== controller) return;

    state.page = data.page;
    state.total = data.total;
    state.totalPages = data.totalPages;

    nodes.leadRows.replaceChildren();
    for (const lead of data.items) nodes.leadRows.append(renderRow(lead));
    renderPager(data);
    renderEmpty(data);
  } catch (error) {
    if (error.name === "AbortError") return;
    toast(error.message, "error");
  }
}

async function loadStats() {
  try {
    const data = await api("/api/stats");
    nodes.statTotal.textContent = String(data.total);
    nodes.statNew.textContent = String(data.new);
    nodes.statContacted.textContent = String(data.contacted);

    const demoCount = Number(data.demo) || 0;
    nodes.removeDemoBtn.dataset.count = String(demoCount);
    nodes.removeDemoBtn.textContent = demoCount ? `Remove demo (${demoCount})` : "Remove demo";
    nodes.removeDemoBtn.classList.toggle("hidden", demoCount === 0);

    const duplicateCount = Number(data.duplicates) || 0;
    nodes.removeDuplicatesBtn.dataset.count = String(duplicateCount);
    nodes.removeDuplicatesBtn.textContent = duplicateCount
      ? `Remove duplicates (${duplicateCount})`
      : "Remove duplicates";
    nodes.removeDuplicatesBtn.classList.toggle("hidden", duplicateCount === 0);

    const services = data.services ?? {};
    state.serviceCounts = services;
    state.skills = Array.isArray(data.skills) ? data.skills : [];
    syncServiceFilter(state.skills, services);
    renderSourceIssues(data.scan);

    if (data.lastScanAt) {
      const ago = timeAgo(Date.parse(data.lastScanAt));
      nodes.statLastScan.textContent = ago;
      nodes.lastScan.textContent = `Last scan ${ago}`;
    } else {
      nodes.statLastScan.textContent = "Never";
      nodes.lastScan.textContent = "No scans yet";
    }
  } catch {
    /* stats are non-critical */
  }
}

const SERVICE_LABELS = {
  automation: "Automation",
  web: "Web development",
  seo: "SEO"
};

function formatService(service) {
  return SERVICE_LABELS[service] ?? service;
}

function updateServiceFilterLabel() {
  if (state.services.length === 0) {
    nodes.serviceFilterLabel.textContent = "All services";
    nodes.serviceFilterBtn.title = "Filter by one or more services";
    return;
  }

  nodes.serviceFilterLabel.textContent =
    state.services.length === 1
      ? formatService(state.services[0])
      : `${state.services.length} services`;
  nodes.serviceFilterBtn.title = state.services.map(formatService).join(", ");
}

function setServiceMenu(open) {
  nodes.serviceFilterMenu.classList.toggle("hidden", !open);
  nodes.serviceFilterBtn.setAttribute("aria-expanded", String(open));
}

function syncServiceFilter(skills = [], services = {}) {
  const names = new Set(Object.keys(services));
  for (const skill of skills) names.add(skill);
  for (const builtin of Object.keys(SERVICE_LABELS)) names.add(builtin);

  const ordered = [
    ...Object.keys(SERVICE_LABELS),
    ...[...names].filter((name) => !SERVICE_LABELS[name]).sort((a, b) => a.localeCompare(b))
  ].filter((name) => names.has(name));

  state.services = state.services.filter((name) => names.has(name));

  const menu = nodes.serviceFilterMenu;
  menu.replaceChildren();

  const all = el("button", "multi-all", "All services");
  all.type = "button";
  all.dataset.service = "all";
  all.classList.toggle("active", state.services.length === 0);
  menu.append(all);

  for (const name of ordered) {
    const label = el("label", "multi-option");
    const input = el("input");
    input.type = "checkbox";
    input.value = name;
    input.dataset.service = name;
    input.checked = state.services.includes(name);
    label.append(input, el("span", null, formatService(name)));

    const count = services[name];
    if (Number.isFinite(count)) label.append(el("span", "count", String(count)));
    menu.append(label);
  }

  updateServiceFilterLabel();
}

function sourceLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown source";
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last ? `${url.hostname}/${last}` : url.hostname;
  } catch {
    return text.slice(0, 80);
  }
}

function renderSourceIssues(scan) {
  const issues = scan?.result?.sourceIssues ?? [];
  const visible = issues.length > 0 && !state.issuesHidden;
  nodes.sourceIssues.classList.toggle("hidden", !visible);
  if (!visible) return;

  nodes.sourceIssuesTitle.textContent = `${issues.length} source${
    issues.length === 1 ? "" : "s"
  } returned no posts`;
  nodes.sourceIssuesList.replaceChildren();

  for (const issue of issues) {
    const item = el("li");
    const label = el("strong", null, sourceLabel(issue.source));
    label.title = issue.source || "";
    item.append(label, el("span", null, issue.reason || "No posts returned"));
    nodes.sourceIssuesList.append(item);
  }
}

function paintWindowUnitLabels() {
  const value = Number(nodes.scanWindowValue.value);
  const singular = value === 1;
  for (const option of nodes.scanWindowUnit.options) {
    if (option.value === "hours") option.textContent = singular ? "hour" : "hours";
    else option.textContent = singular ? "minute" : "minutes";
  }
}

function syncWindowPicker(minutes) {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 1) return;
  if (value >= 60 && value % 60 === 0) {
    nodes.scanWindowValue.value = String(value / 60);
    nodes.scanWindowUnit.value = "hours";
  } else {
    nodes.scanWindowValue.value = String(value);
    nodes.scanWindowUnit.value = "minutes";
  }
  paintWindowUnitLabels();
}

function scanWindowMinutes() {
  const value = Number(nodes.scanWindowValue.value);
  const unit = nodes.scanWindowUnit.value;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Enter a whole number of minutes or hours");
  }
  const minutes = unit === "hours" ? value * 60 : value;
  if (minutes < 1 || minutes > 1440) {
    throw new Error("Scan window must be between 1 minute and 24 hours");
  }
  return minutes;
}

async function persistWindow() {
  try {
    const minutes = scanWindowMinutes();
    const settings = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ windowMinutes: minutes })
    });
    state.settings = settings;
    syncWindowPicker(settings.windowMinutes);
    toast("Scan window saved", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function goToPage(page) {
  const next = Math.min(Math.max(1, page), state.totalPages);
  if (next === state.page) return;
  state.page = next;
  loadLeads();
}

function clearFilters() {
  state.status = "all";
  state.services = [];
  state.q = "";
  state.sort = "newest";
  state.maxAgeMinutes = 0;
  state.page = 1;

  nodes.searchInput.value = "";
  nodes.recencyFilter.value = "";
  nodes.sortFilter.value = "newest";
  syncServiceFilter(state.skills, state.serviceCounts);
  for (const tab of nodes.statusTabs.querySelectorAll(".tab")) {
    tab.classList.toggle("active", tab.dataset.status === "all");
  }
  loadLeads();
}

async function removeDemo() {
  const count = Number(nodes.removeDemoBtn.dataset.count) || 0;
  if (count === 0) return;
  const ok = window.confirm(
    `Remove ${count} demo lead${count === 1 ? "" : "s"}? Real Facebook leads will be kept.`
  );
  if (!ok) return;

  nodes.removeDemoBtn.disabled = true;
  nodes.removeDemoBtn.textContent = "Removing...";

  try {
    const data = await api("/api/leads/demo", { method: "DELETE" });
    toast(`Removed ${data.removed} demo lead${data.removed === 1 ? "" : "s"}`, "success");
    state.page = 1;
    await Promise.allSettled([loadStats(), loadLeads()]);
  } catch (error) {
    toast(error.message, "error");
    await loadStats();
  } finally {
    nodes.removeDemoBtn.disabled = false;
  }
}

async function removeDuplicates() {
  const count = Number(nodes.removeDuplicatesBtn.dataset.count) || 0;
  if (count === 0) return;
  const ok = window.confirm(
    `Remove ${count} duplicate lead${count === 1 ? "" : "s"}? One copy of each repost will be kept.`
  );
  if (!ok) return;

  nodes.removeDuplicatesBtn.disabled = true;
  nodes.removeDuplicatesBtn.textContent = "Removing...";

  try {
    const data = await api("/api/leads/duplicates", { method: "DELETE" });
    toast(
      `Removed ${data.removed} duplicate lead${data.removed === 1 ? "" : "s"}`,
      "success"
    );
    state.page = 1;
    await Promise.allSettled([loadStats(), loadLeads()]);
  } catch (error) {
    toast(error.message, "error");
    await loadStats();
  } finally {
    nodes.removeDuplicatesBtn.disabled = false;
  }
}

function schedulePoll() {
  if (state.scanTimer) return;
  state.scanTimer = setInterval(async () => {
    try {
      const status = await api("/api/scan/status");
      handleScanStatus(status, { announce: true });
      if (!status.running) stopPoll();
    } catch {
      stopPoll();
    }
  }, 2000);
}

function stopPoll() {
  if (state.scanTimer) {
    clearInterval(state.scanTimer);
    state.scanTimer = null;
  }
}

function handleScanStatus(status, { announce = false } = {}) {
  if (!status) return;

  if (status.running) {
    setScanning(true);
    updateBadge(status.demo ? "Demo scan" : "Scanning", "scanning");
    schedulePoll();
    return;
  }

  setScanning(false);
  updateBadge(status.error ? "Error" : "Idle", status.error ? "error" : "idle");

  if (status.finishedAt) {
    const isNew = status.finishedAt !== state.lastFinish;
    state.lastFinish = status.finishedAt;
    if (announce && isNew) {
      state.issuesHidden = false;
      renderSourceIssues(status);
      if (status.error) {
        toast(status.error, "error");
      } else if (status.result) {
        const sourceErrors = status.result.sourceErrors ?? 0;
        const message = sourceErrors
          ? `Scan finished: ${status.result.added} new, ${status.result.updated} updated. ${sourceErrors} source(s) returned no posts (private or unavailable).`
          : `Scan complete: ${status.result.added} new, ${status.result.updated} updated`;
        toast(message, sourceErrors ? "error" : "success");
      }
      loadStats();
      loadLeads();
    }
  }
}

async function refreshScanStatus() {
  try {
    const status = await api("/api/scan/status");
    handleScanStatus(status, { announce: false });
  } catch {
    /* ignore */
  }
}

async function startScan(demo = false) {
  if (state.scanning) return;

  let windowMinutes;
  if (!demo) {
    try {
      windowMinutes = scanWindowMinutes();
    } catch (error) {
      toast(error.message, "error");
      return;
    }
  }

  state.issuesHidden = false;
  renderSourceIssues(null);
  setScanning(true);
  updateBadge(demo ? "Demo..." : "Starting...", "scanning");

  try {
    const data = await api(demo ? "/api/demo" : "/api/scan", {
      method: "POST",
      body: JSON.stringify(demo ? {} : { windowMinutes })
    });
    if (data.status) handleScanStatus(data.status, { announce: false });
    schedulePoll();
    toast(demo ? "Demo scan started" : `Scan started (last ${windowMinutes} min)`, "success");
  } catch (error) {
    setScanning(false);
    updateBadge("Idle", "idle");
    toast(error.message, "error");
    await refreshScanStatus();
  }
}

function splitLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadSettings() {
  try {
    const settings = await api("/api/settings");
    state.settings = settings;
    state.skills = Array.isArray(settings.skills) ? settings.skills : [];
    syncWindowPicker(settings.windowMinutes);
    syncServiceFilter(state.skills, state.serviceCounts);
  } catch {
    /* keep the default window if settings cannot be loaded */
  }
}

async function openSettings() {
  try {
    const settings = await api("/api/settings");
    state.settings = settings;

    nodes.minScoreInput.value = String(settings.minScore);
    nodes.limitInput.value = String(settings.maxResultsPerSource);
    nodes.groupsInput.value = settings.groups.join("\n");
    nodes.pagesInput.value = settings.pages.join("\n");
    nodes.skillsInput.value = (settings.skills ?? []).join("\n");

    nodes.tokenInput.value = "";
    nodes.tokenInput.placeholder = settings.tokenSet
      ? `Saved: ${settings.tokenPreview}`
      : "apify_api_...";
    nodes.tokenHint.textContent = settings.tokenSet
      ? "A token is saved. Leave blank to keep it."
      : "No token saved yet. Get one from Apify Console > Integrations.";
    nodes.tokenHint.className = "";

    if (!nodes.settingsDialog.open) nodes.settingsDialog.showModal();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function saveSettings(event) {
  event.preventDefault();

  const payload = {
    minScore: Number(nodes.minScoreInput.value),
    maxResultsPerSource: Number(nodes.limitInput.value),
    groups: splitLines(nodes.groupsInput.value),
    pages: splitLines(nodes.pagesInput.value),
    skills: splitLines(nodes.skillsInput.value)
  };

  const token = nodes.tokenInput.value.trim();
  if (token) payload.token = token;

  nodes.saveSettingsBtn.disabled = true;
  nodes.saveSettingsBtn.textContent = "Saving...";

  try {
    const settings = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    state.settings = settings;
    state.skills = Array.isArray(settings.skills) ? settings.skills : [];
    syncWindowPicker(settings.windowMinutes);
    syncServiceFilter(state.skills, state.serviceCounts);
    nodes.settingsDialog.close();
    toast("Settings saved", "success");
    loadStats();
    loadLeads();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    nodes.saveSettingsBtn.disabled = false;
    nodes.saveSettingsBtn.textContent = "Save settings";
  }
}

async function testToken() {
  const token = nodes.tokenInput.value.trim();

  nodes.testTokenBtn.disabled = true;
  nodes.testTokenBtn.textContent = "Testing...";
  nodes.tokenHint.className = "";

  try {
    const data = await api("/api/settings/test", {
      method: "POST",
      body: JSON.stringify(token ? { token } : {})
    });
    const plan = data.plan ? ` (${data.plan})` : "";
    nodes.tokenHint.textContent = `Connected as ${data.username}${plan}.`;
    nodes.tokenHint.className = "success";
    toast("Apify token works", "success");
  } catch (error) {
    nodes.tokenHint.textContent = error.message;
    nodes.tokenHint.className = "error";
    toast(error.message, "error");
  } finally {
    nodes.testTokenBtn.disabled = false;
    nodes.testTokenBtn.textContent = "Test token";
  }
}

function updateRelativeTimes() {
  for (const node of document.querySelectorAll(".posted[data-posted-ms]")) {
    const ms = Number(node.dataset.postedMs);
    const strong = node.querySelector("strong");
    if (strong && Number.isFinite(ms)) strong.textContent = timeAgo(ms);
  }
}

function bindEvents() {
  nodes.scanBtn.addEventListener("click", () => startScan(false));
  nodes.emptyDemo.addEventListener("click", () => startScan(true));
  nodes.emptyClear.addEventListener("click", clearFilters);
  nodes.scanWindowValue.addEventListener("input", paintWindowUnitLabels);
  nodes.scanWindowValue.addEventListener("change", persistWindow);
  nodes.scanWindowUnit.addEventListener("change", () => {
    paintWindowUnitLabels();
    persistWindow();
  });
  nodes.removeDemoBtn.addEventListener("click", removeDemo);
  nodes.removeDuplicatesBtn.addEventListener("click", removeDuplicates);

  nodes.settingsBtn.addEventListener("click", openSettings);
  nodes.closeSettings.addEventListener("click", () => nodes.settingsDialog.close());
  nodes.cancelSettings.addEventListener("click", () => nodes.settingsDialog.close());
  nodes.settingsForm.addEventListener("submit", saveSettings);
  nodes.testTokenBtn.addEventListener("click", testToken);
  nodes.settingsDialog.addEventListener("click", (event) => {
    if (event.target === nodes.settingsDialog) nodes.settingsDialog.close();
  });

  nodes.statusTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button || button.dataset.status === state.status) return;
    state.status = button.dataset.status;
    state.page = 1;
    for (const tab of nodes.statusTabs.querySelectorAll(".tab")) {
      tab.classList.toggle("active", tab === button);
    }
    loadLeads();
  });

  nodes.serviceFilterBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setServiceMenu(nodes.serviceFilterMenu.classList.contains("hidden"));
  });

  nodes.serviceFilterMenu.addEventListener("click", (event) => {
    if (!event.target.closest("[data-service='all']")) return;
    state.services = [];
    state.page = 1;
    syncServiceFilter(state.skills, state.serviceCounts);
    loadLeads();
  });

  nodes.serviceFilterMenu.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-service]");
    if (!input || input.dataset.service === "all") return;

    const name = input.dataset.service;
    if (input.checked) {
      if (!state.services.includes(name)) state.services.push(name);
    } else {
      state.services = state.services.filter((service) => service !== name);
    }

    state.page = 1;
    syncServiceFilter(state.skills, state.serviceCounts);
    loadLeads();
  });

  document.addEventListener("click", (event) => {
    if (!nodes.serviceFilter.contains(event.target)) setServiceMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setServiceMenu(false);
  });

  nodes.recencyFilter.addEventListener("change", () => {
    state.maxAgeMinutes = Number(nodes.recencyFilter.value) || 0;
    state.page = 1;
    loadLeads();
  });

  nodes.dismissIssues.addEventListener("click", () => {
    state.issuesHidden = true;
    nodes.sourceIssues.classList.add("hidden");
  });

  nodes.sortFilter.addEventListener("change", () => {
    state.sort = nodes.sortFilter.value;
    state.page = 1;
    loadLeads();
  });

  nodes.pageSize.addEventListener("change", () => {
    state.pageSize = Number(nodes.pageSize.value);
    state.page = 1;
    loadLeads();
  });

  let searchTimer;
  nodes.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = nodes.searchInput.value.trim();
      state.page = 1;
      loadLeads();
    }, 300);
  });

  nodes.firstPage.addEventListener("click", () => goToPage(1));
  nodes.prevPage.addEventListener("click", () => goToPage(state.page - 1));
  nodes.nextPage.addEventListener("click", () => goToPage(state.page + 1));
  nodes.lastPage.addEventListener("click", () => goToPage(state.totalPages));

  nodes.pageNumbers.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (button) goToPage(Number(button.dataset.page));
  });
}

async function init() {
  bindEvents();
  nodes.pageSize.value = String(state.pageSize);

  await Promise.allSettled([loadSettings(), loadStats(), loadLeads()]);
  await refreshScanStatus();

  setInterval(updateRelativeTimes, 30000);
}

init();
