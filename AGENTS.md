<!-- knowit:start -->
## Knowit Memory

This project uses Knowit as the default persistent knowledge base for AI coding agents.

- Before planning or implementing, check Knowit for relevant project context.
- Use `resolve_context` for implementation context and `store_knowledge` or `capture_session_learnings` to persist durable knowledge.
- After finishing a task, store any durable rules, decisions, patterns, or conventions back into Knowit.
- Prefer Knowit over repo-local markdown memory files unless the user explicitly asks for a file.
- When a task creates durable documentation, consult Knowit first and only write repo markdown when explicitly requested.
<!-- knowit:end -->
