# Knowit

Structured memory for AI coding agents.

[![npm version](https://img.shields.io/npm/v/knowit)](https://www.npmjs.com/package/knowit)
[![license](https://img.shields.io/github/license/ismaelkedir/knowit)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ismaelkedir/knowit?style=social)](https://github.com/ismaelkedir/knowit)

Knowit is an MCP server and CLI that gives Claude Code, Codex, and other MCP-compatible agents a durable, queryable memory layer for your project.

It stores engineering knowledge as structured memory that agents can retrieve before they plan or edit code.

Instead of re-explaining architecture rules, naming conventions, and past decisions every session, you store them once and let your agent retrieve the relevant context when needed.

## Contents

- [Why Knowit](#why-knowit)
- [Why Structured Memory](#why-structured-memory)
- [Install](#install)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Common Use Cases](#common-use-cases)
- [CLI](#cli)
- [MCP Tools](#mcp-tools)
- [Knowledge Model](#knowledge-model)
- [Shared Team Memory](#shared-team-memory)
- [Semantic Search](#semantic-search)
- [Notion Integration](#notion-integration)
- [Configuration](#configuration)
- [Automatic Update Notifications](#automatic-update-notifications)
- [Public Launch Note](#public-launch-note)
- [Contributing](#contributing)
- [License](#license)

## Why Knowit

- Give every agent session the same project context before it starts changing code.
- Store engineering knowledge in a structured, queryable memory layer instead of scattered prompts and notes.
- Share conventions and decisions across teammates with one local or shared SQLite database.
- Work across Claude Code, Codex, and other MCP-compatible agents without tying memory to one tool.
- Store structured knowledge: rules, architecture, patterns, decisions, conventions, and notes.

## Why Structured Memory

Knowit is designed for operational engineering memory: the durable context agents need while doing code work.

That means memory is stored with structure such as:

- entry type: `rule`, `architecture`, `pattern`, `decision`, `convention`, `note`
- scope: `global`, `team`, `repo`, `domain`
- metadata: tags, URLs, confidence, and source information

This makes it easier for agents to retrieve only the context that matters for the current task, such as:

- repo-specific architecture rules before implementing a feature
- domain-specific conventions before refactoring a subsystem
- team-wide decisions before introducing a new pattern

The default local storage is SQLite, which gives Knowit a simple local-first setup while keeping memory queryable, shareable, and independent from any single model vendor or editor.

## Install

```bash
npm install -g knowit
```

Requires Node.js 20+.

Knowit's CLI also checks for newer published versions and shows a non-blocking update notice in interactive terminal sessions.

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

This repository intentionally keeps a checked-in `.mcp.json` so Knowit can use itself while developing Knowit. For normal consumer projects, prefer generating MCP config through `knowit install`.

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

In practice, Knowit is a layer for execution context:

- canonical source code stays in the repository
- durable engineering memory stays in Knowit
- external canonical docs can stay in tools like Notion, with Knowit routing agents to the right source when needed

## Common Use Cases

- Store coding rules that agents must follow.
- Preserve architecture decisions and tradeoffs.
- Capture reusable implementation patterns.
- Keep durable memory out of scattered prompts, session history, and ad hoc note files.
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

# Cloud account commands
knowit cloud login --token <token>
knowit cloud whoami
knowit cloud logout

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

## Automatic Update Notifications

Knowit's interactive CLI commands use [`update-notifier`](https://www.npmjs.com/package/update-notifier) to let users know when a newer npm release is available.

- Notifications are skipped for `knowit serve` so MCP stdio traffic stays clean.
- Notifications are also skipped in CI, tests, and non-interactive terminal sessions.
- Users can disable them with `NO_UPDATE_NOTIFIER=1` or by passing `--no-update-notifier`.

## Public Launch Note

The current public release is focused on the open-source, local-first workflow. Hosted cloud plans are not publicly enabled right now.

## Contributing

Issues, README improvements, bug reports, feature requests, and pull requests are welcome.

- Repo: [github.com/ismaelkedir/knowit](https://github.com/ismaelkedir/knowit)
- Issues: [github.com/ismaelkedir/knowit/issues](https://github.com/ismaelkedir/knowit/issues)
- Discussions: [github.com/ismaelkedir/knowit/discussions](https://github.com/ismaelkedir/knowit/discussions)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)

If you are trying Knowit in a real project, feedback about agent workflows, missing MCP tools, and setup friction is especially useful.

## License

MIT. See [LICENSE](LICENSE).
