# Knowit

Shared team memory for AI coding agents.

Knowit gives Claude Code, Codex, and other MCP-compatible agents a persistent, queryable memory layer for your project. Use it to store rules, architecture notes, decisions, patterns, and task context outside the repo instead of scattering `AGENTS.md`, `ARCHITECTURE.md`, and ad hoc notes across projects.

## The problem

AI coding agents are stateless by default. Every session, every developer's agent, starts from zero. You re-explain the same conventions, the agent violates the same rules, and context established in one session never reaches the next.

**Without Knowit:**
- Agent asks you how Stripe webhooks should be handled. You explain. Next session, same question.
- A new teammate's agent introduces a naming pattern you deprecated six months ago because it never knew the decision was made.
- Three agents working on the same codebase hold three inconsistent models of the architecture.

**With Knowit:**
- Agent calls `resolve_context` before planning. It finds the idempotency rule, the deprecated pattern warning, and the current architecture decision. It starts informed.
- A convention stored by any agent or developer is immediately searchable by every other agent on the team.
- At session end, the agent calls `capture_session_learnings` and persists everything it discovered.

## What makes Knowit different

Most memory tools for AI agents are single-user, single-store local databases with an MCP wrapper. Knowit is designed differently:

- **Team-scoped memory** — a shared database makes knowledge available across all developers and agents on a repo
- **Source orchestration** — Knowit is both an MCP server (for agents) and an MCP client (to external knowledge systems like Notion or Obsidian). External MCP servers do not share a universal tool contract; Knowit solves this with explicit source registration and tool mapping
- **Structured knowledge model** — types (`rule`, `architecture`, `pattern`, `decision`, `convention`, `note`), scopes (`global`, `team`, `repo`, `domain`), confidence scores, and tags — not flat markdown files
- **Deduplication** — storing an entry with the same title, type, scope, and routing metadata updates the existing entry rather than creating a duplicate
- **Graceful degradation** — semantic search via OpenAI embeddings is optional; text and tag matching works without any API key

## How it works

```text
Developer A's Claude Code      Developer B's Codex
        |                               |
        | MCP                           | MCP
        v                               v
           Knowit MCP server
                  |
    +-------------+------------------+
    |                                |
    v                                v
local SQLite source          external MCP source
(shared team database)       (Notion, Obsidian, etc.)
```

## Install

```bash
npm install -g knowit
```

Or run it without installing:

```bash
npx knowit --help
```

## Quickstart

### Solo developer

```bash
knowit init
```

Register with Claude Code:

```bash
claude mcp add -s user \
  -e KNOWIT_DB_PATH="$HOME/.knowit/knowit.db" \
  knowit -- knowit serve
```

Register with Codex:

```bash
codex mcp add knowit \
  --env KNOWIT_DB_PATH="$HOME/.knowit/knowit.db" \
  -- knowit serve
```

### Team shared memory

Pick a shared path accessible to all developers on the team (NFS mount, shared volume, or a path convention in your dev environment):

```bash
KNOWIT_DB_PATH=/shared/team/knowit.db knowit init
```

Each developer registers their AI client against the same database:

```bash
# Developer A
claude mcp add -s user \
  -e KNOWIT_DB_PATH=/shared/team/knowit.db \
  knowit -- knowit serve

# Developer B — same command, same path
claude mcp add -s user \
  -e KNOWIT_DB_PATH=/shared/team/knowit.db \
  knowit -- knowit serve
```

From this point, any knowledge stored by one developer's agent is immediately searchable by every other agent.

## Prompting agents to use Knowit

Add to your `CLAUDE.md` or `AGENTS.md`:

```markdown
## Memory

This project uses Knowit for persistent agent memory.

- Before planning any task, call `resolve_context` with the task description and current repo.
- After completing a task, call `capture_session_learnings` with any decisions, patterns, or conventions discovered.
- When you encounter a rule or architecture decision, store it with `store_knowledge` before the session ends.
```

## MCP tools

| Tool | Description |
|---|---|
| `resolve_context` | Retrieve relevant knowledge before planning a task |
| `store_knowledge` | Store a single knowledge entry |
| `capture_session_learnings` | Batch store multiple discoveries from this session (deduplicates automatically) |
| `search_knowledge` | Search knowledge across one or more sources |
| `list_sources` | List configured knowledge sources |
| `register_mcp_source` | Register an external MCP server as a source |

### `capture_session_learnings`

This is the primary auto-capture tool. Call it at session end with everything discovered:

```json
{
  "learnings": [
    {
      "title": "Stripe webhook idempotency",
      "type": "rule",
      "content": "Always use the Stripe event ID as the idempotency key. Never process the same event twice.",
      "scope": "repo",
      "repo": "payments-api",
      "tags": ["stripe", "webhooks", "idempotency"]
    },
    {
      "title": "Payment retry state check",
      "type": "pattern",
      "content": "Before retrying a payment, read server state. Client-side retry counters are not authoritative.",
      "scope": "repo",
      "repo": "payments-api",
      "tags": ["payments", "retry"]
    }
  ]
}
```

Entries with the same title, type, scope, repo, and domain are updated rather than duplicated. Safe to call repeatedly.

## CLI

```bash
# Initialize (creates database and default source)
knowit init

# Store knowledge
knowit add rule "No direct DB access from controllers" \
  "All database access goes through repository classes. Controllers call services." \
  --scope repo --repo api-gateway --tags architecture,layers

# Search
knowit search "database access pattern"

# Resolve context before a task
knowit resolve "implement user authentication" --repo api-gateway --domain auth

# Inspect the knowledge base
knowit stats --source local
knowit list --source local --repo api-gateway
knowit show <entry-id> --source local

# Source management
knowit source list
knowit source connect local
knowit source connect notion --mcp-server-name notion
knowit source show notion
knowit source add-mcp "notion-memory" "node" \
  --args notion-server.js \
  --store-tool store_page \
  --search-tool search_pages \
  --resolve-tool resolve_notes
```

Start the MCP server directly:

```bash
knowit serve
```

## Knowledge model

### Types

| Type | When to use |
|---|---|
| `rule` | Constraints the codebase enforces (validation rules, invariants) |
| `architecture` | Structural decisions about how the system is organized |
| `pattern` | Reusable implementation approaches the team has adopted |
| `decision` | Past decisions with rationale (ADRs, resolved debates) |
| `convention` | Naming, formatting, and style agreements |
| `note` | Everything else — observations, open questions, incident context |

### Scopes

| Scope | Requires | When to use |
|---|---|---|
| `global` | — | Applies everywhere |
| `team` | — | Applies to all repos in the team |
| `repo` | `repo` field | Specific to one repository |
| `domain` | `repo` + `domain` fields | Specific to a bounded domain within a repo |

### Confidence

The `confidence` field (0–1) lets you distinguish authoritative decisions from provisional notes. Agents and search results can weight high-confidence entries appropriately.

## Source connection model

Knowit now has two source-connection paths:

- first-class known providers such as `local` and `notion`
- advanced manual MCP registration for custom providers

Use `source connect` for product-facing providers:

```bash
knowit source connect local
knowit source connect notion --mcp-server-name notion
knowit source show notion
```

Provider behavior:

- `local`: first-party storage owned directly by Knowit
- `notion`: routed provider metadata and guidance; the canonical artifact may live in Notion and the agent should use the Notion MCP directly

## External MCP sources

`knowit source add-mcp` is the advanced escape hatch for custom MCP integrations. Use it when you are integrating an MCP server that Knowit does not recognize as a first-class provider.

Register a custom source:

```bash
knowit source add-mcp "notion-memory" "node" \
  --args notion-server.js \
  --store-tool store_knowledge \
  --search-tool search_knowledge \
  --resolve-tool resolve_context
```

Then target it explicitly:

```bash
knowit add note "Design sync notes" "Decided on card-based layout for mobile." \
  --source notion-memory
knowit search "mobile layout" --source notion-memory
```

## Configuration

| Variable | Description |
|---|---|
| `KNOWIT_DB_PATH` | Override the database path (enables team-shared databases) |
| `KNOWIT_STORAGE_SCOPE` | `project` (default), `global`, or `custom` |
| `OPENAI_API_KEY` | Enables semantic search via embeddings (optional) |
| `KNOWIT_LOG_LEVEL` | Server log verbosity (`debug`, `info`, `warn`, `error`) |

Storage defaults:

| Scope | Path |
|---|---|
| `project` | `<repo>/.knowit/knowit.db` |
| `global` | `~/.knowit/knowit.db` |
| `custom` | Value of `KNOWIT_DB_PATH` |

## MCP resources

| Resource | Description |
|---|---|
| `knowit://sources` | List of configured sources |
| `knowit://entries/local` | All entries in the local source |
| `knowit://entries/local/{id}` | A single entry by ID |

## Limitations

- External MCP sources are launched over stdio only (HTTP transport not yet supported)
- There is no automatic schema translation for arbitrary third-party MCP servers — tool mapping is explicit by design
- There is no GUI — all interaction is via CLI or MCP tools
- Repo-scoped and domain-scoped entries require the `repo` (and `domain`) fields to be set
- Local storage does not depend on `OPENAI_API_KEY`; embeddings are an optional enhancement
