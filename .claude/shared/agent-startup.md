# Agent Startup (shared)

All workflow agents follow the same startup choreography. Referenced from individual agent files; the agent supplies only its own sub-task list.

## 1. Mark the phase started (first agent in the phase only)

The **first agent that runs in a phase** marks it as `in_progress` for accurate status reporting:

```bash
node .claude/scripts/transition-phase.js --mark-started
```

| Phase  | Typical first agent |
|--------|---------------------|
| INTAKE | `intake-agent` (produce mode) |
| PLAN   | `feature-planner` (mode `epics`) |
| BUILD  | `test-generator` (per story) — OR any on-demand BUILD agent (`design-api-agent`, `design-style-agent`, `mock-setup-agent`, `type-generator-agent`) when it fires before the first story's test-generator |

The rule is "first agent in the phase wins" — whichever agent fires first calls `--mark-started`. The table lists the typical first agent for orientation only. Subsequent agents in the same phase **skip** the call. Running it twice is idempotent but wasteful.

## 2. Initialize the progress display

```bash
node .claude/scripts/generate-todo-list.js
```

Parse the JSON output and call `TodoWrite` with the resulting array. Then append your agent sub-tasks **after** the item currently `status: "in_progress"`. Prefix each sub-task `content` (and `activeForm`) with `"    >> "` so they render as nested items under the workflow step.

## 3. Per-call sub-task rules

- Each agent defines a sub-task list per call (Call A / Call B / etc.) in its own file.
- Only add sub-tasks for **your current call**. Sub-tasks from a prior call should already be `"completed"`.
- Start your sub-tasks as `"pending"`. As you progress, mark the active one `"in_progress"` and completed ones `"completed"`.
- Re-run `generate-todo-list.js` before each `TodoWrite` to get the current base list, then merge in your updated sub-tasks.

## 4. On completion

After completing your work, call `generate-todo-list.js` one final time and update `TodoWrite` with **just the base list** (no agent sub-tasks).

---

**File operations:** Use `Read` / `Grep` / `Glob` / `Write` / `Edit` for file work — including inspecting installed packages under `node_modules/`. Reserve Bash for `node` *scripts* (not `node -e`), `git`, and `ls`. Do NOT use `find`, `sed`, `awk`, `cat`, `head`, `tail`, `wc`, `python3`, `perl`, `cut`, or `grep` via Bash, and never use an interpreter to read, modify, or inspect files or packages — `node -e` / `python3 -c` / `find -exec` / `perl -i` / `sed -i` (use `Edit`/`Write` to change a file — never `node -e "fs.writeFileSync(...)"` or `perl -i`/`sed -i`). Inline / in-place code execution is never auto-approved. Full policy: [`.claude/policies/file-operations.md`](../policies/file-operations.md).

**Running dev tools:** Run vitest/tsc/eslint/etc. via `npx <tool>`, `npm --prefix web run <script>`, or `node_modules/.bin/<tool>` — all auto-approved. To pass Node memory/V8 flags, prefix with `NODE_OPTIONS` (e.g. `NODE_OPTIONS='--max-old-space-size=256' npx vitest run`); a direct `node ./node_modules/<tool>/…` invocation is NOT auto-approved and will prompt.

**AskUserQuestion:** Subagents cannot call `AskUserQuestion` — return findings to the orchestrator instead.
