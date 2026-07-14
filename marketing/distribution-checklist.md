# Distribution checklist

Standard listing metadata (copy-paste):

- **Name:** Knowit
- **One-liner:** Shared, structured memory for AI coding agents — MCP server + CLI.
- **Description:** Knowit gives Claude Code, Codex, Cursor, Windsurf, and every MCP client a persistent, queryable project memory. Store rules, architecture, decisions, and conventions once; agents retrieve only the relevant context per task via `resolve_context` and persist learnings with `capture_session_learnings`. Local-first (`.knowit/knowledge.jsonl`, git-friendly), team-shareable, MIT licensed. Includes a local memory browser (`npx knowit preview`).
- **Install:** `npx knowit install` · MCP server command: `npx -y knowit@latest serve`
- **Category:** Memory / Knowledge Base
- **Repo:** https://github.com/ismaelkedir/knowit
- **npm:** https://www.npmjs.com/package/knowit
- **Site/docs:** https://useknowit.dev · https://useknowit.dev/docs
- **License:** MIT

## Directories (do all — each is free discovery)

- [ ] **PulseMCP** — submit at pulsemcp.com (form; use metadata above)
- [ ] **Glama** — glama.ai/mcp/servers (auto-indexes GitHub; claim/submit via site, add `glama.json` if requested)
- [ ] **mcpservers.org** — GitHub PR to their repo (find "memory" section)
- [ ] **LobeHub MCP** — lobehub.com/mcp submit flow
- [ ] **Smithery** — smithery.ai (optional; requires smithery.yaml)
- [ ] **mcp.so** — submit form
- [ ] **awesome-mcp-servers** (punkpeye/awesome-mcp-servers) — PR under "Knowledge & Memory": `- [ismaelkedir/knowit](https://github.com/ismaelkedir/knowit) 📇 🏠 - Shared, structured memory for AI coding agents. Structured entries (rules, decisions, patterns) with scopes, retrieved per task via MCP. Local-first, git-friendly, team-shareable.`
- [ ] **Anthropic MCP registry** (registry.modelcontextprotocol.io) — publish server.json via mcp-publisher CLI

## GitHub repo settings (web UI, 5 min)

- [ ] Description: "Shared, structured memory for AI coding agents — MCP server + CLI. One memory layer for Claude Code, Codex, Cursor & every MCP client."
- [ ] Website: https://useknowit.dev
- [ ] Topics: `mcp`, `mcp-server`, `model-context-protocol`, `ai-agents`, `agent-memory`, `claude-code`, `cursor`, `memory`, `knowledge-base`, `developer-tools`
- [ ] Social preview image: upload og image (Settings → General → Social preview)

## Search indexing (after site deploy)

- [ ] Google Search Console: add property useknowit.dev (DNS verify), submit sitemap.xml
- [ ] Bing Webmaster Tools: import from GSC
- [ ] Request indexing for /, /docs, /blog post

## Launch sequence (suggested)

1. Deploy site (docs + blog + demo live), publish npm 0.4.0 with new README.
2. Directory submissions + awesome-list PRs (same day — backlinks help indexing).
3. X thread (with GIF) → day 1.
4. Show HN → day 2 or 3 (separate day from X so each gets attention).
5. dev.to cross-post of blog article → same week, canonical URL pointing at useknowit.dev/blog.
6. Reddit r/ClaudeAI + r/LocalLLaMA / r/ChatGPTCoding — genuine "I built this" posts, follow each sub's self-promo rules.
