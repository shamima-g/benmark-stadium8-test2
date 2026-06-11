# Build Token-Usage Report

_Generated: 2026-06-11 06:39Z_

Token usage recorded per Claude API response, deduped by message id,
and attributed to the phase/epic/story active when each turn ended.
Subagent usage (developer, test-generator, etc.) is tracked alongside
the main loop. Cost is estimated from public per-model rates (cache writes
at the 5-minute-TTL rate); treat it as a guide, not a billing figure.

## Summary (macro)

| Metric | Value |
| --- | --- |
| **Total tokens** | **24,900,618** |
| **Estimated cost** | **$22.86** |
| Input tokens | 66,041 |
| Output tokens | 154,486 |
| Cache-write tokens | 1,263,949 |
| Cache-read tokens | 23,416,142 |
| API responses recorded | 340 |
| Models | claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001 |
| First recorded | 2026-06-09 10:29Z |
| Last recorded | 2026-06-09 11:37Z |

## Per-phase breakdown

| Phase | Total | Input | Output | Cache write | Cache read | Est. cost |
| --- | --- | --- | --- | --- | --- | --- |
| PLAN | 12,440,759 | 25,861 | 77,665 | 439,646 | 11,897,587 | $10.07 |
| BUILD | 12,459,859 | 40,180 | 76,821 | 824,303 | 11,518,555 | $12.79 |

## BUILD detail (tokens per epic/story)

| Unit | Total | Input | Output | Cache write | Cache read | Est. cost |
| --- | --- | --- | --- | --- | --- | --- |
| BUILD · epic 1 · story 2 | 12,459,859 | 40,180 | 76,821 | 824,303 | 11,518,555 | $12.79 |

## Per-agent breakdown

| Agent | Total | Input | Output | Cache write | Cache read | Est. cost |
| --- | --- | --- | --- | --- | --- | --- |
| main | 14,332,663 | 29,507 | 102,489 | 341,580 | 13,859,087 | $11.77 |
| developer | 4,610,361 | 770 | 12,209 | 246,878 | 4,350,504 | $4.03 |
| test-generator | 2,184,025 | 571 | 11,686 | 188,897 | 1,982,871 | $2.47 |
| code-reviewer | 1,444,075 | 23,996 | 7,144 | 173,970 | 1,238,965 | $2.01 |
| intake-agent | 837,441 | 17 | 1,347 | 70,897 | 765,180 | $0.52 |
| api-connectivity-agent | 762,303 | 5,441 | 3,716 | 68,599 | 684,547 | $0.53 |
| feature-planner | 620,855 | 5,695 | 14,529 | 136,213 | 464,418 | $1.48 |
| playwright-runner | 108,895 | 44 | 1,366 | 36,915 | 70,570 | $0.06 |

---

_Source: `generated-docs/timing/token-usage.jsonl` (append-only event log).
Re-run `node .claude/scripts/token-report.js` anytime for an updated snapshot._
