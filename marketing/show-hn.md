# Show HN draft

**Title:**
Show HN: Knowit – open-source structured memory for AI coding agents (MCP)

**URL:** https://github.com/ismaelkedir/knowit

**First comment (post immediately after submitting):**

Hi HN, I built Knowit because I got tired of re-explaining my codebase to my coding agent every single session.

Claude Code, Cursor, Codex — they're all brilliant for one session and amnesiac the next. The common fixes have real problems: CLAUDE.md files grow into unstructured dumps that get pasted into every prompt whether relevant or not, and generic memory MCPs store blob notes with no structure, no scoping, and no way to share with teammates.

Knowit is an MCP server + CLI that stores engineering knowledge as structured entries — rules, architecture, decisions, patterns, conventions — each with a scope (global / team / repo / domain), tags, and confidence. Before planning a task, the agent calls `resolve_context` and gets back only the entries relevant to that task. After finishing, it calls `capture_session_learnings` to persist what it learned, with deduplication.

Design choices I care about:

- Local-first. Project memory lives in `.knowit/knowledge.jsonl` — line-delimited JSON that diffs cleanly, so your team's memory travels through git review like code does. No hosted dependency.
- Agent-agnostic. One memory store works across Claude Code, Codex, Cursor, Windsurf, VS Code/Copilot, Gemini CLI, Zed, and any other MCP client. Setup is `npx knowit install` — a wizard that writes the MCP config for each client.
- Auditable. `npx knowit preview` opens a local read-only browser so you can see exactly what your agents remember.
- Optional extras: OpenAI-embeddings semantic search if you set an API key, and Notion as an external knowledge source.

I've been dogfooding it across all my projects for months, including on Knowit's own codebase.

MIT licensed. Would love feedback on the knowledge model (are six entry types too many? too few?) and on what retrieval quality looks like in your projects.

Docs: https://useknowit.dev/docs

**Timing notes:** submit Tue–Thu, 8–10am US Eastern. Don't ask for upvotes. Reply to every comment fast for the first 3 hours.
