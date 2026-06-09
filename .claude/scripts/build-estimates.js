#!/usr/bin/env node
/**
 * build-estimates.js
 * Read-modify-write helper for the per-story build-time ESTIMATES doc
 * (`generated-docs/timing/build-estimates.json` + `.md`).
 *
 * This is the predicted counterpart to timing-report.js (which measures ACTUAL
 * active build time). Estimates are authored by the orchestrator at the per-epic
 * stories gate — when full story metadata (acceptance criteria, route, etc.) is
 * known — and reconciled against actuals at COMPLETE.
 *
 * Exists for the same reason as journal.js: `node .claude/scripts/*` is
 * auto-approved, so routing estimate I/O through this script (rather than an
 * inline `node -e` or hand-edited markdown) keeps the workflow prompt-free and
 * the doc structure deterministic.
 *
 * Files:
 *   Store  : generated-docs/timing/build-estimates.json   (canonical, orchestrator-authored)
 *   Report : generated-docs/timing/build-estimates.md      (rendered; estimate vs actual)
 *   Actuals: generated-docs/timing/timing-summary.json     (written by timing-report.js)
 *
 * Subcommands:
 *   upsert  Merge an epic's story estimates into the store, then re-render the report.
 *   render  Re-render the report from the store, joining ACTUALS from timing-summary.json.
 *
 * Usage:
 *   node .claude/scripts/build-estimates.js upsert --file <path.json> [--consume]
 *   node .claude/scripts/build-estimates.js render
 *
 * upsert --file JSON shape (write it with the Write tool, then invoke this):
 *   {
 *     "epic": 1,
 *     "stories": [
 *       { "story": 1, "title": "Sign-in page", "complexity": "M",
 *         "estimateMin": 30, "driver": "new BFF auth flow, 3 ACs, 1 route" }
 *     ]
 *   }
 *   Rows are keyed by (epic, story) — re-running upsert for the same story
 *   replaces its estimate (so a revised plan overwrites cleanly).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const TIMING_DIR = path.join(PROJECT_ROOT, 'generated-docs', 'timing');
const STORE_FILE = path.join(TIMING_DIR, 'build-estimates.json');
const REPORT_MD = path.join(TIMING_DIR, 'build-estimates.md');
const SUMMARY_FILE = path.join(TIMING_DIR, 'timing-summary.json');

const VALID_COMPLEXITY = new Set(['S', 'M', 'L']);

function fail(msg) {
  process.stderr.write(`build-estimates.js: ${msg}\n`);
  process.exit(1);
}

// --- arg parsing (--flag value) ---
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function fmtMin(min) {
  if (!min || min < 0) return '—';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

function fmtVariance(estMin, actMin) {
  if (actMin == null) return '—';
  const diff = Math.round(actMin - estMin);
  const sign = diff > 0 ? '+' : '';
  const pct = estMin > 0 ? Math.round((diff / estMin) * 100) : 0;
  const pctStr = estMin > 0 ? ` (${sign}${pct}%)` : '';
  return `${sign}${diff}m${pctStr}`;
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (!Array.isArray(parsed.stories)) parsed.stories = [];
    return parsed;
  } catch {
    return { stories: [] };
  }
}

/** Map "BUILD · epic N · story M" -> active minutes, from timing-summary.json. */
function loadActuals() {
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
  } catch {
    return { byStory: {}, available: false };
  }
  const byStory = {};
  for (const [k, ms] of Object.entries(summary.steps || {})) {
    const m = /^BUILD · epic (\d+) · story (\d+)$/.exec(k);
    if (m) byStory[`${m[1]}:${m[2]}`] = ms / 60000;
  }
  return { byStory, available: true };
}

function renderReport() {
  const store = loadStore();
  const { byStory, available } = loadActuals();
  const rows = [...store.stories].sort(
    (a, b) => a.epic - b.epic || a.story - b.story
  );

  const lines = [];
  lines.push('# Build Time Estimates');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z_`);
  lines.push('');
  lines.push('Predicted active build time per story, authored at the planning gate.');
  lines.push('Actuals are filled in from `timing-summary.json` once a story is built');
  lines.push('(run `node .claude/scripts/timing-report.js` first to refresh them).');
  lines.push('Complexity: **S** small · **M** medium · **L** large.');
  lines.push('');

  if (!rows.length) {
    lines.push('_No estimates recorded yet._');
    lines.push('');
  } else if (!available) {
    lines.push('> Actuals not yet available — `timing-summary.json` is written when');
    lines.push('> `timing-report.js` runs (at COMPLETE, or any mid-build snapshot).');
    lines.push('');
  }

  // Group by epic.
  const epics = [...new Set(rows.map((r) => r.epic))].sort((a, b) => a - b);
  let gEst = 0;
  let gAct = 0;
  let gActKnown = false;

  for (const epic of epics) {
    const epicRows = rows.filter((r) => r.epic === epic);
    lines.push(`## Epic ${epic}`);
    lines.push('');
    lines.push('| Story | Title | Complexity | Estimate | Actual | Variance | Driver |');
    lines.push('| --- | --- | :---: | --- | --- | --- | --- |');
    let eEst = 0;
    let eAct = 0;
    let eActKnown = false;
    for (const r of epicRows) {
      const est = Number(r.estimateMin) || 0;
      const act = byStory[`${r.epic}:${r.story}`];
      eEst += est;
      if (act != null) { eAct += act; eActKnown = true; }
      lines.push(
        `| ${r.story} | ${r.title || ''} | ${r.complexity || '—'} | ` +
        `${fmtMin(est)} | ${act != null ? fmtMin(act) : '—'} | ${fmtVariance(est, act)} | ` +
        `${(r.driver || '').replace(/\|/g, '\\|')} |`
      );
    }
    lines.push(
      `| **Subtotal** | | | **${fmtMin(eEst)}** | ` +
      `**${eActKnown ? fmtMin(eAct) : '—'}** | ${eActKnown ? fmtVariance(eEst, eAct) : '—'} | |`
    );
    lines.push('');
    gEst += eEst;
    if (eActKnown) { gAct += eAct; gActKnown = true; }
  }

  if (rows.length) {
    lines.push('## Total');
    lines.push('');
    lines.push('| | Estimate | Actual | Variance |');
    lines.push('| --- | --- | --- | --- |');
    lines.push(
      `| **All stories** | **${fmtMin(gEst)}** | ` +
      `**${gActKnown ? fmtMin(gAct) : '—'}** | ${gActKnown ? fmtVariance(gEst, gAct) : '—'} |`
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Source: `generated-docs/timing/build-estimates.json` (orchestrator-authored).');
  lines.push('Actuals join from `timing-summary.json`. Re-run');
  lines.push('`node .claude/scripts/build-estimates.js render` anytime for an updated view._');
  lines.push('');

  if (!fs.existsSync(TIMING_DIR)) fs.mkdirSync(TIMING_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');
  return { gEst, gAct, gActKnown, count: rows.length };
}

function upsert(args) {
  if (!args.file) fail('upsert requires --file <path.json>');
  let input;
  try {
    input = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  } catch (e) {
    fail(`could not read/parse --file: ${e.message}`);
  }
  if (input.epic === undefined || !Array.isArray(input.stories)) {
    fail('--file JSON must include "epic" (number) and "stories" (array)');
  }
  const epic = Number(input.epic);

  const store = loadStore();
  for (const s of input.stories) {
    if (s.story === undefined) fail('each story entry needs a "story" number');
    if (s.complexity && !VALID_COMPLEXITY.has(String(s.complexity).toUpperCase())) {
      fail(`invalid complexity "${s.complexity}" for story ${s.story} (expected S | M | L)`);
    }
    const row = {
      epic,
      story: Number(s.story),
      title: s.title || '',
      complexity: s.complexity ? String(s.complexity).toUpperCase() : '',
      estimateMin: Number(s.estimateMin) || 0,
      driver: s.driver || '',
    };
    const idx = store.stories.findIndex((r) => r.epic === row.epic && r.story === row.story);
    if (idx === -1) store.stories.push(row);
    else store.stories[idx] = row;
  }

  if (!fs.existsSync(TIMING_DIR)) fs.mkdirSync(TIMING_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');

  if (args.consume) { try { fs.unlinkSync(args.file); } catch {} }

  const r = renderReport();
  process.stdout.write(
    `build-estimates: upserted ${input.stories.length} story estimate(s) for Epic ${epic} ` +
    `(${r.count} total, est ${fmtMin(r.gEst)})\n`
  );
}

function render() {
  if (!fs.existsSync(STORE_FILE)) {
    // No estimates were ever recorded (e.g. legacy project) — nothing to reconcile.
    // Exit cleanly so the COMPLETE-phase command sequence isn't disrupted.
    process.stdout.write('build-estimates: no estimate store — nothing to render (skipping).\n');
    return;
  }
  const r = renderReport();
  process.stdout.write(
    `Wrote ${path.relative(PROJECT_ROOT, REPORT_MD)} — ` +
    `${r.count} stories, estimate ${fmtMin(r.gEst)}` +
    `${r.gActKnown ? `, actual ${fmtMin(r.gAct)}` : ' (actuals pending)'}\n`
  );
}

// --- main ---
const [, , sub, ...rest] = process.argv;
const args = parseArgs(rest);

switch (sub) {
  case 'upsert': upsert(args); break;
  case 'render': render(); break;
  default:
    fail(`unknown subcommand "${sub || ''}" (expected: upsert | render)`);
}
