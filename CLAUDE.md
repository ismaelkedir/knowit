<!-- knowit:start -->
## Knowit Memory

This project uses Knowit as its persistent memory layer.

- Before planning or implementing, check Knowit for relevant context.
- Use `resolve_context` for implementation context and `store_knowledge` or `capture_session_learnings` to persist durable knowledge.
- After finishing a task, store any durable rules, decisions, patterns, or conventions back into Knowit.
- Prefer Knowit over repo-local markdown memory files unless the user explicitly asks for a file.
- When Knowit routes you to an external provider, use the returned MCP guidance instead of guessing the downstream tool.
<!-- knowit:end -->
