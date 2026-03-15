# Knowit

Knowit is a unified memory layer for AI coding agents.

The idea is not just "store notes in SQLite." The real product is closer to "Obsidian or Notion for AI developer memory", but exposed through MCP so agents like Codex or Claude can read, search, and store knowledge programmatically.

Knowit does two jobs:

- It exposes a stable MCP interface for memory operations.
- It routes those operations to one or more configured memory sources.

That means an agent can be prompted with something like:

> Create a PRD for feature X and store it inside Knowit.

Knowit can then store that memory in:

- its built-in local SQLite source
- an external MCP-backed source

## Product model

Knowit is both:

- an MCP server for AI agents
- an MCP client to external knowledge systems

Architecture:

```text
AI agent
  |
  | MCP
  v
Knowit MCP
  |
  +--> local SQLite memory source
  |
  +--> external MCP source (for example Notion/Obsidian-style integrations)
```

This matters because external MCP servers do not share one universal tool contract. Knowit solves that with source registration and explicit tool mappings.

## What MCP is

MCP, the Model Context Protocol, is a standard way for an AI client to talk to tools and data providers.

At a practical level:

- an MCP server exposes tools, resources, and prompts
- an MCP client connects to that server over a transport like stdio or HTTP
- the AI host calls tools by name with JSON arguments
- the server returns structured or text results

For Knowit specifically:

- Codex or Claude acts as the MCP client
- Knowit acts as the MCP server
- Knowit exposes memory tools like `store_knowledge`, `search_knowledge`, and `resolve_context`
- when needed, Knowit itself becomes an MCP client to other MCP servers

So Knowit is a memory orchestration layer, not just a local database.

## How Knowit works

### Agent-facing side

Knowit exposes MCP tools for:

- listing configured sources
- registering external MCP sources
- storing knowledge
- searching knowledge
- resolving context for a task

### Source-facing side

Knowit supports source providers. In this MVP there are two provider kinds:

- `sqlite`: the built-in local source
- `mcp`: an external MCP-backed source launched over stdio

For external MCP sources, you register:

- the command to start the remote MCP server
- args/cwd/env
- which remote tool stores knowledge
- which remote tool searches knowledge
- which remote tool resolves context

This explicit mapping is important. If you skip it and pretend every MCP server is interchangeable, the abstraction leaks immediately.

## Features in this MVP

- Local SQLite-backed memory source
- Source registry stored in SQLite
- External MCP source registration with tool mapping
- Optional semantic ranking for the local source using OpenAI embeddings
- Task context resolution
- CLI for initialization, source management, storage, search, and resolution
- MCP server over stdio for agent integrations

## Quickstart

```bash
npm install
npm run build
node dist/cli/index.js init
```

This creates the local SQLite database and the default `local` source.

To verify the local setup:

```bash
node dist/cli/index.js source list
node dist/cli/index.js stats --source local
```

The default setup does not require any environment variables.

If you want semantic ranking for the local SQLite source, create a `.env` file from `.env.example` and set `OPENAI_API_KEY`. It is not required for storing knowledge.

## Build and run

```bash
npm run build
npm start
```

`npm start` launches the Knowit MCP server over stdio.

Server logs are written to stderr. You can control verbosity with `KNOWIT_LOG_LEVEL`:

```bash
KNOWIT_LOG_LEVEL=debug npm start
```

## Install Knowit In AI Clients

Build Knowit first:

```bash
cd /absolute/path/to/knowit
npm install
npm run build
```

When registering Knowit with an AI client, prefer absolute paths so the client can launch the server reliably from any working directory.

### Codex

Codex supports MCP registration from the CLI:

```bash
codex mcp add knowit \
  --env KNOWIT_DB_PATH=/absolute/path/to/knowit/.knowit/knowit.db \
  -- node /absolute/path/to/knowit/dist/server/mcpServer.js
```

Optional semantic ranking:

```bash
codex mcp add knowit \
  --env KNOWIT_DB_PATH=/absolute/path/to/knowit/.knowit/knowit.db \
  --env OPENAI_API_KEY=your_key \
  -- node /absolute/path/to/knowit/dist/server/mcpServer.js
```

Verify the registration:

```bash
codex mcp list
codex mcp get knowit
```

### Claude Code

Claude Code also supports MCP registration from the CLI:

```bash
claude mcp add -s user \
  -e KNOWIT_DB_PATH=/absolute/path/to/knowit/.knowit/knowit.db \
  knowit -- node /absolute/path/to/knowit/dist/server/mcpServer.js
```

Optional semantic ranking:

```bash
claude mcp add -s user \
  -e KNOWIT_DB_PATH=/absolute/path/to/knowit/.knowit/knowit.db \
  -e OPENAI_API_KEY=your_key \
  knowit -- node /absolute/path/to/knowit/dist/server/mcpServer.js
```

Verify the registration:

```bash
claude mcp list
claude mcp get knowit
```

### Claude Desktop And Other MCP Clients

Many MCP-compatible tools use a JSON config with an `mcpServers` section. For those clients, register Knowit like this:

```json
{
  "mcpServers": {
    "knowit": {
      "command": "node",
      "args": ["/absolute/path/to/knowit/dist/server/mcpServer.js"],
      "cwd": "/absolute/path/to/knowit",
      "env": {
        "KNOWIT_DB_PATH": "/absolute/path/to/knowit/.knowit/knowit.db"
      }
    }
  }
}
```

Optional semantic ranking:

```json
{
  "OPENAI_API_KEY": "your_key"
}
```

After registering the server, restart the AI client so it reloads the MCP configuration.

### Test The MCP Installation

Once the client is connected, try prompts like:

- `Store a note in Knowit saying "Knowit is the default memory layer for this project."`
- `Search Knowit for install flow decisions.`
- `Resolve context from Knowit before planning this feature.`

## CLI

### Initialize Knowit

```bash
knowit init
```

This creates the local SQLite database and ensures the default local source exists.

### List sources

```bash
knowit source list
```

### Register an external MCP source

```bash
knowit source add-mcp "notion-memory" "node" \
  --args dist/server.js \
  --search-tool search_knowledge \
  --store-tool store_knowledge \
  --resolve-tool resolve_context
```

This does not magically make every MCP server compatible. The remote server still needs tools that actually correspond to memory operations. Knowit makes integration explicit rather than pretending all MCPs share the same contract.

### Store knowledge

Store in the default source:

```bash
knowit add pattern "Stripe webhook idempotency" "Always use the event ID for idempotency"
```

This works without `OPENAI_API_KEY`. If embeddings are configured, Knowit stores them as an enhancement. If not, the entry is still stored normally.

Store in a specific source:

```bash
knowit add note "Search indexing bug" "Typesense documents were stale after backfill" --source local --tags search,incident
```

### Search knowledge

Search all sources:

```bash
knowit search "stripe retries"
```

Search one source only:

```bash
knowit search "payment retries" --source local
```

Local retrieval behavior:

- with embeddings configured: semantic ranking
- without embeddings configured: text, title, and tag matching fallback

### Inspect the local knowledge base

Summarize what is stored:

```bash
knowit stats --source local --repo knowit
```

List entries with metadata and content previews:

```bash
knowit list --source local --repo knowit
```

Show one full entry:

```bash
knowit show <entry-id> --source local
```

### Resolve context

```bash
knowit resolve "implement payment retry logic" --repo payments-api --domain billing
```

## MCP tools exposed by Knowit

- `list_sources`
- `register_mcp_source`
- `store_knowledge`
- `search_knowledge`
- `resolve_context`

## MCP resources exposed by Knowit

- `knowit://sources`
- `knowit://entries/local`
- `knowit://entries/local/{id}`

## MCP Connection Details

Generic MCP config:

```json
{
  "mcpServers": {
    "knowit": {
      "command": "node",
      "args": ["dist/server/mcpServer.js"],
      "cwd": "/absolute/path/to/knowit"
    }
  }
}
```

Optional env vars:

- `OPENAI_API_KEY`: enables semantic ranking for the local source
- `KNOWIT_STORAGE_SCOPE`: selects where the local SQLite database lives. Supported values: `project`, `global`, `custom`
- `KNOWIT_DB_PATH`: overrides the SQLite database path. If `KNOWIT_STORAGE_SCOPE=custom`, this is required
- `KNOWIT_LOG_LEVEL`: controls server log verbosity

Local storage defaults:

- `project` scope: `<repo>/.knowit/knowit.db`
- `global` scope: `~/.knowit/knowit.db`
- `custom` scope: the path provided in `KNOWIT_DB_PATH`

Storage examples:

```bash
# Default: project-local storage
knowit init

# Shared database across repositories
KNOWIT_STORAGE_SCOPE=global knowit init

# Custom database path
KNOWIT_STORAGE_SCOPE=custom KNOWIT_DB_PATH=/absolute/path/to/knowit.db knowit init
```

After that, an agent can ask Knowit to:

- persist implementation rules
- save PRDs or architecture decisions
- search for relevant past decisions
- resolve context before coding
- route memory operations to configured sources

## Important limitations

- Local storage does not depend on `OPENAI_API_KEY`
- Local retrieval falls back to text matching when embeddings are unavailable
- Repo-scoped and domain-scoped knowledge must include repo metadata, and domain-scoped knowledge must include a domain
- External MCP sources are only as capable as their mapped remote tools
- This MVP supports external MCP sources over stdio only
- There is no GUI yet
- There is no automatic schema translation for arbitrary third-party MCPs

## Why this architecture is the right MVP

If Knowit were only "SQLite + embeddings + MCP", it would prove storage but miss the real product thesis.

If Knowit tried to be a generic transparent wrapper over arbitrary MCP servers, it would be too vague and too leaky to be reliable.

This design is the middle ground:

- stable memory contract for agents
- pluggable sources
- one built-in source that works now
- a clean path to Notion- and Obsidian-style integrations
