# X / Twitter launch thread draft

**Setup first:** create the account **@useknowit** (or use personal account + brand later). Bio: "Open-source memory for AI coding agents. One memory layer, every agent. npx knowit install". Link: useknowit.dev. Pin the launch thread.

Attach the demo GIF (see demo-video-script.md) to tweet 1. Post Tue–Thu morning US time.

---

**1/**
Your AI coding agent has amnesia.

Every session it forgets your architecture, your conventions, your past decisions — and you explain them again. And again.

I built Knowit to fix that: open-source, structured memory for AI coding agents.

[demo GIF]

**2/**
Knowit is an MCP server + CLI.

One command:

npx knowit install

It configures Claude Code, Codex, Cursor, Windsurf, VS Code, Zed — 11 clients — and creates a local memory store in your repo.

**3/**
Not blob notes. Structured memory:

• rules — "no direct DB access from controllers"
• decisions — why you chose X over Y
• patterns, conventions, architecture

Each scoped to global / team / repo / domain. Agents retrieve only what's relevant to the task at hand.

**4/**
The loop:

→ before work, agent calls resolve_context and gets your project's rules
→ after work, capture_session_learnings stores what it learned

You stop being your agent's external hard drive.

**5/**
It's team memory, not just yours.

Memory lives in .knowit/knowledge.jsonl — plain line-delimited JSON that diffs cleanly in git. Your teammate's agent knows what your agent learned last sprint. Code review works on memory too.

**6/**
Different agent, same memory.

Store a decision from Claude Code. Retrieve it in Cursor. Or Codex. Or Zed. One memory layer for every agent — that's the whole point of building on MCP.

**7/**
And you can see everything your agents remember:

npx knowit preview

opens a local, read-only memory browser. No cloud, no telemetry on your knowledge. Local-first, MIT licensed.

[preview screenshot]

**8/**
Free and open source. Took me months of dogfooding across all my projects — including using Knowit to build Knowit.

⭐ github.com/ismaelkedir/knowit
📚 useknowit.dev/docs

npx knowit install — 30 seconds and your agent stops forgetting.

---

**Follow-up content ideas (1 tweet each, spread over weeks):**
- Clip of scene 2/3 from the demo: "Different agent. Same memory."
- "What my agents remembered this week" — screenshot of preview with interesting entries
- Comparison thread: CLAUDE.md vs structured memory
- "How Knowit uses Knowit" dogfooding story
