# Demo video / GIF script

Mirrors the landing page simulation scenes (src/components/landing/demo-simulation/ in knowit-web). Two cuts:
- **GIF cut**: scenes 1–3 only, ≤30s, no audio, for X/README/HN.
- **Full cut**: all 4 scenes + outro, 60–75s, optional voiceover, for landing page / YouTube.

Record at 1920×1080, terminal font ≥16pt, dark theme matching the site (canvas #081514, teal prompt). Hide personal info from prompt/paths. Use a demo repo (e.g. "api-gateway") with a few pre-seeded entries so lists aren't empty.

---

## Scene 1 — Install (0:00–0:12)
**Frame:** clean terminal, full screen.
**Action:** type `npx knowit install` (natural typing speed, ~80ms/char).
**Beats:** wizard renders → select clients Claude Code, Codex, Cursor (checkboxes) → success ticks appear one by one → final line "memory initialized · .knowit/knowledge.jsonl".
**Caption:** "One command. Every agent."

## Scene 2 — Store (0:12–0:28)
**Frame:** Claude Code session (or the landing simulation styled as one).
**Action:** user asks: "Add a refund endpoint to the payments API."
**Beats:** agent plans → visible tool call `capture_session_learnings` → knowledge card appears and slides right into a "Knowit memory" panel:
> decision · repo:api-gateway — "Payments go through PaymentGateway service, never raw Stripe calls."
**Caption:** "Your agent stores what it learns."

## Scene 3 — Recall in a different agent (0:28–0:45)
**Frame:** switch window chrome to Cursor (new session, empty chat).
**Action:** user asks: "Refactor the checkout flow."
**Beats:** visible tool call `resolve_context` → the SAME card lights up in the memory panel (amber left-edge glow) and flies into the chat as retrieved context → agent replies referencing the rule ("Routing this through PaymentGateway per your decision…").
**Caption:** "Different agent. Same memory." ← this is the money shot; hold it 2s.

**GIF cut ends here** with end-card: "Knowit — npx knowit install" + GitHub URL.

## Scene 4 — Preview (0:45–1:00)
**Frame:** terminal, then browser.
**Action:** type `npx knowit preview` → browser opens the memory browser.
**Beats:** scroll entry list (type badges: rule/decision/pattern) → click the Scene-2 entry → detail pane renders body blocks → hover filter bar (search "payments").
**Caption:** "See everything your agents remember."

## Outro (1:00–1:10)
Dark end-card, site style:
- Wordmark: **Knowit** — shared, structured memory for AI coding agents
- `npx knowit install`
- github.com/ismaelkedir/knowit · useknowit.dev

**Voiceover (optional, full cut only):**
"Your coding agent forgets everything between sessions. Knowit gives it memory. One install, every agent — Claude Code, Cursor, Codex. It stores decisions and rules as structured knowledge, retrieves only what matters for each task, and shares it with your whole team through git. Knowit. Your agents already work hard — let them remember."
