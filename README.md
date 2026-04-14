# Knowit

Persistent memory for AI coding agents.

[![npm version](https://img.shields.io/npm/v/knowit)](https://www.npmjs.com/package/knowit)
[![license](https://img.shields.io/github/license/ismaelkedir/knowit)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ismaelkedir/knowit?style=social)](https://github.com/ismaelkedir/knowit)

Knowit is an MCP server and CLI that gives Claude Code, Codex, and other MCP-compatible agents a durable, queryable memory layer for your project.

Instead of re-explaining architecture rules, naming conventions, and past decisions every session, you store them once and let your agent retrieve them when needed.

## Why Knowit

- Keep durable engineering memory out of scattered repo markdown files.
- Give every agent session the same project context before it starts changing code.
- Share conventions and decisions across teammates with one local or shared SQLite database.
- Store structured knowledge: rules, architecture, patterns, decisions, conventions, and notes.

## Install

```bash
npm install -g knowit
```

Requires Node.js 20+.

## Quick Start

### 1. Install Knowit into a project

```bash
knowit install
```

`knowit install` is the main setup flow. It can:

- initialize the local database
- register the Knowit MCP server with supported clients
- update agent instruction files
- connect a preferred source
- optionally migrate architecture or ADR-style markdown into Knowit

### 2. Tell your agent to use it

If you are not using the installer-managed instructions, add this to `AGENTS.md` or `CLAUDE.md`:

```md
## Memory

This project uses Knowit for persistent memory.

- Before planning or implementing, call `resolve_context` with the task description and repo name.
- After finishing a task, call `capture_session_learnings` to store durable rules, decisions, and patterns.
```

### 3. Start storing and retrieving context

```bash
knowit add rule "No direct DB access from controllers" \
  "All database access goes through repository classes." \
  --scope repo --repo api-gateway --tags architecture,layers

knowit resolve "implement user authentication" --repo api-gateway --domain auth
```

## How It Works

Agents interact with Knowit through MCP tools:

1. Before work, the agent calls `resolve_context`.
2. During work, it can search or store targeted knowledge.
3. After work, it calls `capture_session_learnings`.

That keeps source code in the repo and long-lived project memory in Knowit.

## Common Use Cases

- Store coding rules that agents must follow.
- Preserve architecture decisions and tradeoffs.
- Capture reusable implementation patterns.
- Replace repo-local memory sprawl such as extra `ARCHITECTURE.md`, ADR, and process notes.
- Share team conventions through one shared SQLite database path.

## CLI

```bash
# Setup
knowit install
knowit init

# Add and search knowledge
knowit add rule "Use repository classes" "No direct DB access from controllers."
knowit search "repository pattern"
knowit resolve "add webhook retry handling" --repo api-gateway --domain billing

# Browse entries
knowit list --repo api-gateway
knowit show <entry-id>
knowit stats

# Sources
knowit source list
knowit source connect notion
knowit source show notion

# Import existing markdown knowledge
knowit import-md --yes
```

## MCP Tools

| Tool | Purpose |
|---|---|
| `resolve_context` | Retrieve relevant knowledge before planning a task |
| `store_knowledge` | Store one knowledge entry |
| `capture_session_learnings` | Batch-store session learnings with deduplication |
| `search_knowledge` | Search across one or more sources |
| `resolve_source_action` | Decide whether to use Knowit directly or route to another provider |
| `connect_source` | Connect a known provider such as `local` or `notion` |
| `list_sources` | List configured sources |

## Knowledge Model

### Entry types

| Type | Use for |
|---|---|
| `rule` | Hard constraints the codebase should enforce |
| `architecture` | System structure and rationale |
| `pattern` | Reusable implementation approaches |
| `decision` | Decision records and tradeoffs |
| `convention` | Naming, formatting, and style agreements |
| `note` | Observations, caveats, and open questions |

### Scopes

| Scope | Use for |
|---|---|
| `global` | Applies everywhere |
| `team` | Applies across multiple repos |
| `repo` | Specific to one repository |
| `domain` | Specific to a bounded area in one repo |

Entries also support tags, optional URLs, metadata, and confidence scores.

## Shared Team Memory

Knowit is local-first, but it can still be shared across a team by pointing everyone at the same SQLite database path.

```bash
KNOWIT_DB_PATH=/shared/team/knowit.db knowit install --scope global --client claude
```

That gives every developer and every agent the same durable memory source without adding a hosted dependency.

## Semantic Search

If you set `OPENAI_API_KEY`, Knowit adds embeddings-backed semantic search. Without it, Knowit still works with text and tag matching.

```bash
export OPENAI_API_KEY=sk-...
knowit search "how do we handle payment retries"
```

## Notion Integration

Knowit can connect to Notion as an external source and route agents to the right MCP flow when durable docs belong there.

```bash
knowit source connect notion
```

## Configuration

| Variable | Description |
|---|---|
| `KNOWIT_DB_PATH` | Path to the SQLite database |
| `KNOWIT_STORAGE_SCOPE` | `project`, `global`, or `custom` |
| `OPENAI_API_KEY` | Enables semantic search via embeddings |
| `KNOWIT_LOG_LEVEL` | `debug`, `info`, `warn`, or `error` |

### Default database locations

| Scope | Path |
|---|---|
| `project` | `.knowit/knowit.db` inside the current repo |
| `global` | `~/.knowit/knowit.db` |
| `custom` | Value of `KNOWIT_DB_PATH` |

## Public Launch Note

The current public release is focused on the open-source, local-first workflow. Hosted cloud plans are not publicly enabled right now.

## Contributing

Issues, README improvements, bug reports, feature requests, and pull requests are welcome.

- Repo: [github.com/ismaelkedir/knowit](https://github.com/ismaelkedir/knowit)
- Issues: [github.com/ismaelkedir/knowit/issues](https://github.com/ismaelkedir/knowit/issues)
- Discussions: [github.com/ismaelkedir/knowit/discussions](https://github.com/ismaelkedir/knowit/discussions)

If you are trying Knowit in a real project, feedback about agent workflows, missing MCP tools, and setup friction is especially useful.

## License

MIT. See [LICENSE](LICENSE).
