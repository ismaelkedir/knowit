# Knowit

**Persistent memory for AI coding agents — shared across your whole team.**

[![npm](https://img.shields.io/npm/v/knowit)](https://www.npmjs.com/package/knowit)
[![license](https://img.shields.io/github/license/ismaelkedir/knowit)](LICENSE)

---

Your AI agent has no memory. Every session starts from zero — re-explaining the same conventions, violating the same rules, forgetting the decisions you made last week.

Knowit fixes that. It's an MCP server that gives Claude Code, Codex, and any MCP-compatible agent a persistent, queryable knowledge base for your project. Store architecture decisions, coding rules, patterns, and context once. Every agent session — and every developer on your team — starts informed.

```bash
npm install -g knowit
```

---

## How it works

Agents interact with Knowit through MCP tools. Before planning a task, an agent calls `resolve_context` and gets back the relevant rules, decisions, and patterns for that work. After a session, it calls `capture_session_learnings` to persist what it discovered. Knowledge accumulates. Nothing is forgotten.

For teams, every developer points their agent at the same database. One developer's agent stores a convention — every other agent on the repo can find it immediately.

---

## Quickstart

### 1. Install and initialize

```bash
npm install -g knowit
knowit init
```

### 2. Run the interactive installer

```bash
knowit install
```

The installer can:
- register the Knowit MCP with Claude Code, Codex, or both
- add or update client instruction files
- connect a preferred source such as `local` or `notion`
- import common knowledge markdown files like `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md`, and ADR-style docs into Knowit

### 3. Register manually if you prefer

**Claude Code:**
```bash
claude mcp add -s user \
  -e KNOWIT_DB_PATH="$HOME/.knowit/knowit.db" \
  knowit -- knowit serve
```

**Codex:**
```bash
codex mcp add knowit \
  --env KNOWIT_DB_PATH="$HOME/.knowit/knowit.db" \
  -- knowit serve
```

### 4. Tell your agent to use it

Add this to your `CLAUDE.md` or `AGENTS.md`:

```markdown
## Memory

This project uses Knowit for persistent memory.

- Before planning any task, call `resolve_context` with the task description and repo name.
- After completing a task, call `capture_session_learnings` with decisions, patterns, or conventions you discovered.
```

That's it. Your agent now has memory.

---

## Team shared memory

The real power of Knowit is at the team level. Point every developer's agent at the same database and knowledge becomes a shared team asset — not a per-user artifact.

```bash
# Initialize a shared database (on a shared volume, or commit the path convention to your repo)
KNOWIT_DB_PATH=/shared/team/knowit.db knowit init

# Each developer registers against the same path
claude mcp add -s user \
  -e KNOWIT_DB_PATH=/shared/team/knowit.db \
  knowit -- knowit serve
```

From this point, any rule, decision, or pattern stored by any developer's agent is immediately available to everyone else's.

---

## MCP tools

| Tool | What it does |
|---|---|
| `resolve_context` | Retrieve relevant knowledge before planning a task |
| `store_knowledge` | Store a single knowledge entry |
| `capture_session_learnings` | Batch-store everything discovered this session — deduplicates automatically |
| `search_knowledge` | Search across one or more knowledge sources |
| `resolve_source_action` | Determine whether to use Knowit directly or route to an external source (Notion, etc.) |
| `connect_source` | Connect a first-class provider (local, Notion) |
| `list_sources` | List configured sources |

---

## CLI

```bash
# Interactive client setup
knowit install
knowit install --client both --scope project --source notion --migrate-md

# Store knowledge manually
knowit add rule "No direct DB access from controllers" \
  "All database access goes through repository classes." \
  --scope repo --repo api-gateway --tags architecture,layers

# Search
knowit search "database access pattern"

# Resolve context for a task
knowit resolve "implement user authentication" --repo api-gateway --domain auth

# Browse the knowledge base
knowit list --repo api-gateway
knowit show <entry-id>
knowit stats

# Source management
knowit source list
knowit source connect notion
knowit source show notion
```

---

## Knowledge model

Knowit stores structured entries, not flat text.

**Types** — what kind of knowledge it is:

| Type | Use for |
|---|---|
| `rule` | Hard constraints the codebase must enforce |
| `architecture` | How the system is structured and why |
| `pattern` | Reusable implementation approaches |
| `decision` | Past decisions with rationale (ADRs) |
| `convention` | Naming, formatting, and style agreements |
| `note` | Observations, open questions, incident context |

**Scopes** — who it applies to:

| Scope | Use for |
|---|---|
| `global` | Applies everywhere |
| `team` | Applies across all repos in the team |
| `repo` | Specific to one repository |
| `domain` | Specific to a bounded domain within a repo |

Entries also carry a **confidence score** (0–1), so agents can distinguish authoritative decisions from provisional notes.

---

## Semantic search

If you set `OPENAI_API_KEY`, Knowit uses embeddings for semantic search — relevant results even when your query doesn't match exact keywords. Without it, Knowit falls back to text and tag matching. Both work.

```bash
export OPENAI_API_KEY=sk-...
knowit search "how do we handle payment retries"
# returns entries about retry logic, idempotency, and payment state — even if none say "retry" verbatim
```

---

## Notion integration

Connect Notion as a knowledge source and Knowit will route read/write operations to the right place, surfacing relevant context alongside routing guidance.

```bash
knowit source connect notion
```

When an agent calls `resolve_source_action` for a Notion-backed artifact, Knowit tells it exactly which MCP tool to call next and what to store back in Knowit afterward.

---

## Configuration

| Variable | Description |
|---|---|
| `KNOWIT_DB_PATH` | Path to the SQLite database (use this for shared team databases) |
| `KNOWIT_STORAGE_SCOPE` | `project` (default), `global`, or `custom` |
| `OPENAI_API_KEY` | Enables semantic search via embeddings (optional) |
| `KNOWIT_LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error` |

**Default database locations:**

| Scope | Path |
|---|---|
| `project` | `.knowit/knowit.db` inside the current repo |
| `global` | `~/.knowit/knowit.db` |
| `custom` | Value of `KNOWIT_DB_PATH` |

---

## License

MIT — see [LICENSE](LICENSE).
