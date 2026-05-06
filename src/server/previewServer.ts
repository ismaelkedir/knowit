import { spawn } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { getStoragePath, getStorageScope } from "../db/database.js";
import { MemoryService } from "../services/memoryService.js";
import { knowledgeTypeSchema, type KnowledgeEntry } from "../types/knowledge.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

export interface PreviewServerOptions {
  host?: string;
  port?: number;
  openBrowser?: boolean;
}

export interface RunningPreviewServer {
  close: () => Promise<void>;
  host: string;
  port: number;
  server: http.Server;
  url: string;
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Knowit Preview</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Knowit local memory</p>
          <h1>Preview</h1>
        </div>
        <div class="meta" id="meta" aria-label="Preview storage metadata"></div>
      </header>
      <section class="controls" aria-label="Filters">
        <label>
          <span>Query</span>
          <input id="query" type="search" placeholder="Titles, content, tags" autocomplete="off" />
        </label>
        <label>
          <span>Entry type</span>
          <select id="type">
            <option value="">All types</option>
            <option value="rule">Rule</option>
            <option value="architecture">Architecture</option>
            <option value="pattern">Pattern</option>
            <option value="decision">Decision</option>
            <option value="convention">Convention</option>
            <option value="note">Note</option>
          </select>
        </label>
        <label>
          <span>Repository</span>
          <input id="repo" placeholder="All repos" autocomplete="off" />
        </label>
        <label>
          <span>Domain</span>
          <input id="domain" placeholder="All domains" autocomplete="off" />
        </label>
        <label>
          <span>Tag</span>
          <input id="tag" placeholder="All tags" autocomplete="off" />
        </label>
      </section>
      <section class="layout">
        <aside class="list" id="entries" aria-label="Knowledge entries"></aside>
        <article class="detail" id="detail"></article>
      </section>
    </main>
    <script src="/app.js" defer></script>
  </body>
</html>`;

const css = `:root {
  color-scheme: light dark;

  /*
    Token system notes:
    - OKLCH keeps perceptual steps consistent (better cross-theme tuning).
    - light-dark() allows automatic theming via prefers-color-scheme.
  */
  --paper: light-dark(oklch(0.985 0.010 85), oklch(0.195 0.010 85));
  --panel: light-dark(oklch(0.935 0.020 85), oklch(0.255 0.018 85));
  --surface: light-dark(oklch(0.995 0.008 85), oklch(0.225 0.012 85));
  --ink: light-dark(oklch(0.220 0.020 85), oklch(0.945 0.015 85));
  --muted: light-dark(oklch(0.480 0.020 85), oklch(0.760 0.018 85));
  --line: light-dark(oklch(0.860 0.020 85), oklch(0.350 0.015 85));

  /* Brand / wayfinding */
  --accent: light-dark(oklch(0.520 0.090 175), oklch(0.720 0.090 175));
  --accent-ink: light-dark(oklch(0.210 0.045 175), oklch(0.935 0.035 175));
  --mark: light-dark(oklch(0.560 0.160 35), oklch(0.700 0.150 35));

  /* Semantic */
  --rule: light-dark(oklch(0.520 0.120 250), oklch(0.700 0.100 250));
  --architecture: light-dark(oklch(0.520 0.090 175), oklch(0.720 0.090 175));
  --pattern: light-dark(oklch(0.560 0.120 145), oklch(0.720 0.120 145));
  --decision: light-dark(oklch(0.600 0.140 35), oklch(0.740 0.140 35));
  --convention: light-dark(oklch(0.600 0.110 90), oklch(0.760 0.110 90));
  --note: light-dark(oklch(0.560 0.060 300), oklch(0.720 0.060 300));

  /* Interaction */
  --focus: color-mix(in srgb, var(--accent), transparent 70%);
  --selected: color-mix(in srgb, var(--accent), transparent 88%);
  --hover: color-mix(in srgb, var(--accent), transparent 92%);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.shell { width: min(1440px, 100%); margin: 0 auto; padding: 28px; }
.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  border-bottom: 1px solid var(--line);
  padding-bottom: 20px;
}
.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
h1 { margin: 0; font-size: clamp(34px, 5vw, 74px); line-height: .9; letter-spacing: 0; }
.meta {
  color: var(--muted);
  font-size: 13px;
  text-align: right;
  max-width: 620px;
  display: grid;
  gap: 10px;
  justify-items: end;
}
.meta-grid {
  display: grid;
  gap: 8px;
  justify-items: end;
}
.meta-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  justify-items: end;
  width: min(620px, 100%);
}
.meta-label { text-transform: uppercase; letter-spacing: .06em; font-weight: 750; font-size: 11px; color: color-mix(in srgb, var(--muted), var(--ink) 10%); }
.meta-value {
  min-width: 0;
  max-width: 52ch;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  color: var(--ink);
  background: color-mix(in srgb, var(--panel), transparent 55%);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 10px;
}
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
}
.copy:hover { background: var(--hover); color: var(--ink); border-color: color-mix(in srgb, var(--line), var(--ink) 10%); }
.copy:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
.copy[data-copied="true"] { color: var(--accent-ink); border-color: color-mix(in srgb, var(--accent), var(--line) 60%); background: color-mix(in srgb, var(--accent), transparent 92%); }
.controls {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) minmax(130px, .7fr) repeat(3, minmax(130px, 1fr));
  gap: 12px;
  margin: 18px 0;
}
label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
input, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  min-height: 42px;
  padding: 9px 10px;
  outline: none;
}
input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus); }
.layout { display: grid; grid-template-columns: minmax(280px, 420px) minmax(0, 1fr); gap: 18px; min-height: 62vh; }
.list { border-right: 1px solid var(--line); padding-right: 18px; overflow: auto; max-height: calc(100vh - 190px); }
.entry {
  width: 100%;
  display: grid;
  gap: 8px;
  text-align: left;
  position: relative;
  border: 1px solid transparent;
  border-bottom-color: var(--line);
  background: transparent;
  color: inherit;
  padding: 14px 10px 14px 16px;
  cursor: pointer;
}
.entry:hover { background: var(--hover); border-color: var(--line); border-radius: 6px; }
.entry.active { background: var(--selected); border-color: var(--line); border-radius: 6px; box-shadow: inset 3px 0 0 0 var(--accent); }
.entry.active::before {
  content: "";
  position: absolute;
  inset-block-start: 20px;
  inset-inline-start: 9px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--accent);
}
.entry:focus-visible { outline: none; border-color: var(--accent); border-radius: 6px; box-shadow: 0 0 0 3px var(--focus); }
.entry:active { background: var(--selected); }
.entry-title { font-weight: 750; font-size: 15px; }
.entry-preview { color: var(--muted); font-size: 13px; line-height: 1.4; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badge {
  --badge: var(--accent);
  color: color-mix(in srgb, var(--badge), var(--ink) 20%);
  background: color-mix(in srgb, var(--badge), transparent 88%);
  border-radius: 999px;
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 750;
}
.badge--rule { --badge: var(--rule); }
.badge--architecture { --badge: var(--architecture); }
.badge--pattern { --badge: var(--pattern); }
.badge--decision { --badge: var(--decision); }
.badge--convention { --badge: var(--convention); }
.badge--note { --badge: var(--note); }
.detail {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: clamp(18px, 3vw, 34px);
  overflow-wrap: anywhere;
}
.detail h2 { margin: 0 0 8px; font-size: clamp(24px, 3vw, 42px); line-height: 1.05; letter-spacing: 0; }
.detail-meta { color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 13px; margin-bottom: 24px; }
.body { display: grid; gap: 14px; font-size: 15px; line-height: 1.65; }
.body h3, .body h4 { margin: 12px 0 0; line-height: 1.2; }
.body p, .body blockquote, .body pre, .body ul, .body ol { margin: 0; }
.body a {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}
.body a:hover {
  color: color-mix(in srgb, var(--accent), var(--ink) 20%);
}
.body a:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus);
  border-radius: 4px;
}
.body blockquote { border-left: 3px solid var(--mark); padding-left: 12px; color: var(--muted); }
.body pre { white-space: pre-wrap; background: var(--panel); border-radius: 6px; padding: 12px; overflow: auto; }
.callout { border: 1px solid var(--line); border-radius: 6px; padding: 12px; background: var(--panel); }
.empty { color: var(--muted); padding: 20px 0; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
@media (max-width: 900px) {
  .shell { padding: 18px; }
  .topbar, .layout, .controls { grid-template-columns: 1fr; }
  .meta { text-align: left; justify-items: start; }
  .meta-grid, .meta-item { justify-items: start; }
  .list { max-height: none; border-right: 0; padding-right: 0; }
}`;

const js = `const state = { entries: [], selectedId: null };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const params = () => {
  const search = new URLSearchParams();
  for (const [id, key] of [["query", "q"], ["type", "type"], ["repo", "repo"], ["domain", "domain"], ["tag", "tag"]]) {
    const value = $(id).value.trim();
    if (value) search.set(key, value);
  }
  search.set("limit", "200");
  return search;
};
const badgeClass = (text) => {
  const value = String(text ?? "").toLowerCase();
  if (["rule","architecture","pattern","decision","convention","note"].includes(value)) return "badge--" + value;
  return "";
};
const badge = (text) => '<span class="badge ' + badgeClass(text) + '">' + escapeHtml(text) + '</span>';
const renderBlock = (block) => {
  if (block.type === "heading") return '<h' + block.level + '>' + escapeHtml(block.text) + '</h' + block.level + '>';
  if (block.type === "paragraph") return '<p>' + escapeHtml(block.text) + '</p>';
  if (block.type === "quote") return '<blockquote>' + escapeHtml(block.text) + '</blockquote>';
  if (block.type === "code") return '<pre><code>' + escapeHtml(block.text) + '</code></pre>';
  if (block.type === "callout") return '<div class="callout"><strong>' + escapeHtml(block.title || block.tone || "Note") + '</strong><p>' + escapeHtml(block.text) + '</p></div>';
  if (block.type === "list") {
    const tag = block.style === "ordered" ? "ol" : "ul";
    return '<' + tag + '>' + block.items.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</' + tag + '>';
  }
  if (block.type === "link_list") return '<ul>' + block.links.map((link) => '<li><a href="' + escapeHtml(link.url) + '">' + escapeHtml(link.label) + '</a></li>').join("") + '</ul>';
  return "";
};
async function loadMeta() {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  const container = $("meta");
  container.innerHTML =
    '<div class="meta-grid">' +
      '<div class="meta-item">' +
        '<span class="meta-label">Storage</span>' +
        '<span class="meta-value">' + escapeHtml(meta.storageScope) + '</span>' +
        '<button class="copy" type="button" data-copy="' + escapeHtml(meta.storageScope) + '" aria-label="Copy storage scope">Copy</button>' +
      '</div>' +
      '<div class="meta-item">' +
        '<span class="meta-label">Source</span>' +
        '<span class="meta-value">' + escapeHtml(meta.sourceName) + '</span>' +
        '<button class="copy" type="button" data-copy="' + escapeHtml(meta.sourceName) + '" aria-label="Copy source name">Copy</button>' +
      '</div>' +
      '<div class="meta-item">' +
        '<span class="meta-label">Path</span>' +
        '<span class="meta-value truncate" title="' + escapeHtml(meta.storagePath) + '">' + escapeHtml(meta.storagePath) + '</span>' +
        '<button class="copy" type="button" data-copy="' + escapeHtml(meta.storagePath) + '" aria-label="Copy storage path">Copy</button>' +
      '</div>' +
    '</div>';

  const copyValue = async (value) => {
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  };

  for (const button of container.querySelectorAll(".copy")) {
    button.addEventListener("click", async () => {
      const ok = await copyValue(button.dataset.copy || "");
      button.dataset.copied = ok ? "true" : "false";
      button.textContent = ok ? "Copied" : "Copy";
      setTimeout(() => {
        button.dataset.copied = "false";
        button.textContent = "Copy";
      }, 900);
    });
  }
}
async function loadEntries() {
  const response = await fetch("/api/entries?" + params().toString());
  state.entries = await response.json();
  if (!state.entries.some((entry) => entry.id === state.selectedId)) state.selectedId = state.entries[0]?.id ?? null;
  renderEntries();
  await renderDetail();
}
function focusSelected() {
  const selected = document.querySelector('.entry[data-id="' + CSS.escape(state.selectedId || "") + '"]');
  if (selected && document.activeElement && document.activeElement.classList.contains("entry")) selected.focus();
}
function renderEntries() {
  $("entries").innerHTML = state.entries.length
    ? state.entries.map((entry, index) => '<button class="entry ' + (entry.id === state.selectedId ? "active" : "") + '" data-id="' + escapeHtml(entry.id) + '" data-index="' + index + '" tabindex="' + (entry.id === state.selectedId ? "0" : "-1") + '" aria-current="' + (entry.id === state.selectedId ? "true" : "false") + '"><span class="entry-title">' + escapeHtml(entry.title) + '</span><span class="badges">' + [entry.type, entry.scope, ...(entry.tags || []).slice(0, 3)].map(badge).join("") + '</span><span class="entry-preview">' + escapeHtml(entry.content.slice(0, 150)) + '</span></button>').join("")
    : '<p class="empty">No matching entries.</p>';
  const items = Array.from(document.querySelectorAll(".entry"));
  for (const item of items) {
    item.addEventListener("click", () => {
      state.selectedId = item.dataset.id;
      renderEntries();
      renderDetail();
      focusSelected();
    });
    item.addEventListener("keydown", (event) => {
      const key = event.key;
      if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) return;
      if (!state.entries.length) return;
      event.preventDefault();

      const currentIndex = Number(item.dataset.index || "0");
      let nextIndex = currentIndex;
      if (key === "ArrowDown") nextIndex = Math.min(state.entries.length - 1, currentIndex + 1);
      if (key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
      if (key === "Home") nextIndex = 0;
      if (key === "End") nextIndex = state.entries.length - 1;
      if (key === "Enter" || key === " ") nextIndex = currentIndex;

      const next = state.entries[nextIndex];
      if (!next) return;
      state.selectedId = next.id;
      renderEntries();
      renderDetail();
      const nextButton = document.querySelector('.entry[data-id="' + CSS.escape(next.id) + '"]');
      if (nextButton) nextButton.focus();
    });
  }
}
async function renderDetail() {
  if (!state.selectedId) {
    $("detail").innerHTML = '<p class="empty">Select an entry to inspect its structured body.</p>';
    return;
  }
  const response = await fetch("/api/entries/" + encodeURIComponent(state.selectedId));
  if (!response.ok) {
    $("detail").innerHTML = '<p class="empty">Entry not found.</p>';
    return;
  }
  const entry = await response.json();
  $("detail").innerHTML = '<h2>' + escapeHtml(entry.title) + '</h2><div class="detail-meta"><span>' + escapeHtml(entry.type) + '</span><span>' + escapeHtml(entry.scope) + '</span><span>repo ' + escapeHtml(entry.repo || "-") + '</span><span>domain ' + escapeHtml(entry.domain || "-") + '</span><span>confidence ' + Math.round(entry.confidence * 100) + '%</span><span>updated ' + escapeHtml(new Date(entry.updatedAt).toLocaleString()) + '</span></div><div class="badges">' + (entry.tags || []).map(badge).join("") + '</div><div class="body">' + (entry.body || []).map(renderBlock).join("") + '</div>';
}
let timer = null;
for (const id of ["query", "type", "repo", "domain", "tag"]) {
  $(id).addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadEntries, 120);
  });
}
loadMeta().catch(console.error);
loadEntries().catch(console.error);`;

const send = (
  response: http.ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
): void => {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
};

const sendJson = (response: http.ServerResponse, statusCode: number, value: unknown): void => {
  send(response, statusCode, JSON.stringify(value), "application/json; charset=utf-8");
};

const sendNoContent = (response: http.ServerResponse): void => {
  response.writeHead(204, {
    "Cache-Control": "no-store",
  });
  response.end();
};

const parseLimit = (value: string | null): number => {
  const limit = value ? Number(value) : 100;
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
};

const tagMatches = (entry: Pick<KnowledgeEntry, "tags">, tag: string | null): boolean =>
  !tag || entry.tags.some((item) => item.toLowerCase() === tag.toLowerCase());

const getLocalSourceMeta = (service: MemoryService) => {
  const localSource = service.listSources().find((source) => source.id === "local");
  if (!localSource) {
    throw new Error("Local Knowit source is not configured.");
  }

  return localSource;
};

const handleApiRequest = async (
  requestUrl: URL,
  response: http.ServerResponse,
): Promise<void> => {
  const service = new MemoryService();
  const localSource = getLocalSourceMeta(service);

  if (requestUrl.pathname === "/api/meta") {
    sendJson(response, 200, {
      packageVersion: packageJson.version,
      sourceId: localSource.id,
      sourceKind: localSource.kind,
      sourceName: localSource.name,
      storagePath: getStoragePath(),
      storageScope: getStorageScope(),
    });
    return;
  }

  if (requestUrl.pathname === "/api/stats") {
    const stats = await service.getKnowledgeStats({
      source: "local",
      repo: requestUrl.searchParams.get("repo") ?? undefined,
      domain: requestUrl.searchParams.get("domain") ?? undefined,
      limit: parseLimit(requestUrl.searchParams.get("limit")),
    });
    sendJson(response, 200, stats);
    return;
  }

  if (requestUrl.pathname === "/api/entries") {
    const typeInput = requestUrl.searchParams.get("type") ?? undefined;
    const type = typeInput ? knowledgeTypeSchema.parse(typeInput) : undefined;
    const query = requestUrl.searchParams.get("q")?.trim();
    const tag = requestUrl.searchParams.get("tag")?.trim() || null;
    const filters = {
      source: "local",
      type,
      repo: requestUrl.searchParams.get("repo") ?? undefined,
      domain: requestUrl.searchParams.get("domain") ?? undefined,
      limit: parseLimit(requestUrl.searchParams.get("limit")),
    };
    const entries = query
      ? await service.searchKnowledge({
          query,
          source: "local",
          repo: filters.repo,
          domain: filters.domain,
          limit: Math.min(filters.limit, 50),
        })
      : await service.listKnowledge(filters);
    sendJson(response, 200, entries.filter((entry) => (!type || entry.type === type) && tagMatches(entry, tag)));
    return;
  }

  const entryMatch = requestUrl.pathname.match(/^\/api\/entries\/([^/]+)$/);
  if (entryMatch) {
    const entry = await service.getKnowledgeEntry({
      id: decodeURIComponent(entryMatch[1]!),
      source: "local",
    });
    if (!entry) {
      sendJson(response, 404, { error: "Entry not found" });
      return;
    }
    sendJson(response, 200, entry);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
};

const handleRequest = (request: http.IncomingMessage, response: http.ServerResponse): void => {
  void (async () => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Knowit preview is read-only." });
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApiRequest(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      send(response, 200, html, "text/html; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/styles.css") {
      send(response, 200, css, "text/css; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/app.js") {
      send(response, 200, js, "text/javascript; charset=utf-8");
      return;
    }

    if (requestUrl.pathname === "/favicon.ico") {
      sendNoContent(response);
      return;
    }

    send(response, 404, "Not found", "text/plain; charset=utf-8");
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown preview server error";
    sendJson(response, 500, { error: message });
  });
};

const listen = (server: http.Server, host: string, port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

const openBrowser = (url: string): void => {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
};

export const startPreviewServer = async (
  options: PreviewServerOptions = {},
): Promise<RunningPreviewServer> => {
  const host = options.host ?? "127.0.0.1";
  const initialPort = options.port ?? 4077;
  let port = initialPort;
  let server = http.createServer(handleRequest);

  while (true) {
    try {
      const boundPort = await listen(server, host, port);
      const url = `http://${host}:${boundPort}`;
      if (options.openBrowser) {
        openBrowser(url);
      }

      return {
        close: () =>
          new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
        host,
        port: boundPort,
        server,
        url,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" || initialPort === 0) {
        throw error;
      }
      port += 1;
      server = http.createServer(handleRequest);
    }
  }
};
