---
name: knowit
description: Persistent, structured project memory for AI coding agents via the Knowit MCP server. Use before planning or editing code to load relevant rules, architecture, decisions, patterns, and conventions; use after finishing work to save durable learnings. Triggers on "remember this", "what are our conventions", "project rules", "architecture decision", "store this for next time", or any task in a repo that has a .knowit/ folder.
license: MIT
homepage: https://useknowit.dev
repository: https://github.com/ismaelkedir/knowit
---

# Knowit

Knowit gives coding agents a memory that lasts across sessions, teammates, and MCP clients.
Memory lives in `.knowit/knowledge.jsonl` inside the repo, so it is reviewed and shared through git.

## Setup

If the Knowit MCP tools (`resolve_context`, `store_knowledge`, ...) are not available, install them:

```bash
npx knowit install
```

The wizard configures MCP clients (Claude Code, Codex, Cursor, Windsurf, VS Code/Copilot, Gemini CLI, Kiro, Cline, Continue, Zed) and creates the local store.

Manual MCP config:

```json
{
  "mcpServers": {
    "knowit": { "command": "npx", "args": ["-y", "knowit@latest", "serve"] }
  }
}
```

Requires Node.js 20+. Set `OPENAI_API_KEY` to enable semantic search (optional; text and tag search works without it).

## Core workflow

Follow this loop on every coding task.

### 1. Before planning — load context

Call `resolve_context` with the task, and the repo/domain if known:

```json
{ "task": "add retry handling to billing webhooks", "repo": "api-gateway", "domain": "billing", "files": ["src/webhooks/billing.ts"] }
```

It returns titles and summaries only. Call `get_knowledge` with the IDs that look relevant to get full content:

```json
{ "ids": ["<id-1>", "<id-2>"] }
```

Treat returned `rule` entries as hard constraints. Follow `convention` and `pattern` entries unless the user says otherwise.

### 2. During work — look things up

Use `search_knowledge` for focused questions ("how do we handle auth tokens?"), then `get_knowledge` for full entries.

Use `store_knowledge` right away when the user states a durable rule or decision ("always use X", "we decided Y").

### 3. After finishing — save learnings

Call `capture_session_learnings` with up to 20 durable items found during the session.
Entries with the same title, type, scope, repo, and domain are updated, not duplicated.

```json
{
  "learnings": [
    {
      "title": "Webhook handlers must be idempotent",
      "type": "rule",
      "content": "Billing webhooks can be delivered more than once. Handlers must dedupe on event ID before side effects.",
      "scope": "repo",
      "repo": "api-gateway",
      "domain": "billing",
      "tags": ["webhooks", "billing"]
    }
  ]
}
```

## What to store

Store knowledge that will still be true next week and helps a future agent act correctly.

| Type | Use for |
|---|---|
| `rule` | Hard constraints the code must follow |
| `architecture` | System structure and why it is that way |
| `pattern` | Reusable ways to implement something |
| `decision` | Choices made and their tradeoffs |
| `convention` | Naming, formatting, and style agreements |
| `note` | Caveats, gotchas, open questions |

| Scope | Use for |
|---|---|
| `global` | Applies everywhere |
| `team` | Applies across several repos |
| `repo` | One repository (set `repo`) |
| `domain` | One area inside a repo (set `repo` and `domain`) |

Do **not** store:
- Secrets, tokens, credentials, or personal data.
- Things the code or git history already says plainly.
- Temporary task state, TODOs for this session, or debug output.
- Guesses. Lower `confidence` (0–1) when something is likely but not confirmed.

Write clear titles (a future search should hit them) and keep `content` short and specific.

## External sources

Knowit can route reads and writes to other providers such as Notion.

- `list_sources` — see configured sources.
- `connect_source` — connect a known provider (`local`, `notion`).
- `register_mcp_source` — register any other MCP server with explicit tool mappings.
- `resolve_source_action` — when the user says "save this to Knowit" for a doc, PRD, or plan, call this first. If it routes to an external provider, follow the returned MCP guidance instead of guessing the downstream tool.

## Tool reference

| Tool | Purpose |
|---|---|
| `resolve_context` | Relevant knowledge for a task (summaries) |
| `get_knowledge` | Full content for entry IDs |
| `search_knowledge` | Free-text search (summaries) |
| `store_knowledge` | Store one entry |
| `capture_session_learnings` | Batch store with dedupe |
| `resolve_source_action` | Decide Knowit vs. external provider |
| `list_sources` / `connect_source` / `register_mcp_source` | Manage sources |

## Tips

- Prefer Knowit over creating new repo markdown memory files (extra `ARCHITECTURE.md`, notes files) unless the user asks for a file.
- Users can browse what agents stored with `npx knowit preview` (local, read-only web UI).
- `.knowit/knowledge.jsonl` should be committed so teammates and their agents share the same memory.
