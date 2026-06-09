#!/usr/bin/env node
/**
 * per-page-report.js
 * One combined per-PAGE (per-wireframe) report joining all three measured/predicted
 * sources into a single table: estimated build time, measured active build time,
 * estimate-vs-actual variance, tokens spent, and estimated cost — per page.
 *
 * A "page/wireframe" is a routable story: a story whose workflow-state entry has a
 * non-null `route`. Infrastructure-only stories (no route — e.g. BFF route handlers,
 * shared providers) are reported separately so the per-page totals stay clean.
 *
 * This script READS the JSON summaries the other three scripts already write — it
 * does not re-parse the raw event logs. Run with `--refresh` to regenerate those
 * summaries first (it shells out to timing-report.js and token-report.js); without
 * it, the script uses whatever summaries are already on disk and notes any gaps.
 *
 * Sources (all under generated-docs/timing/, except state):
 *   build-estimates.json   estimates   (build-estimates.js)   — estimateMin, complexity, title, driver
 *   timing-summary.json    actuals     (timing-report.js)     — steps["BUILD · epic N · story M"] = active ms
 *   token-summary.json     tokens      (token-report.js)      — steps[...] = { totalTokens, costUsd, ... }
 *   ../context/workflow-state.json     page identity          — epics[N].stories[M].{ route, title, isInfrastructureOnly }
 *
 * Output:
 *   generated-docs/timing/per-page-report.md
 *
 * Usage:
 *   node .claude/scripts/per-page-report.js            # build from existing summaries
 *   node .claude/scripts/per-page-report.js --refresh  # regenerate timing + token summaries first
 *   node .claude/scripts/per-page-report.js --print    # also print the markdown to stdout
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = process.cwd();
const TIMING_DIR = path.join(PROJECT_ROOT, 'generated-docs', 'timing');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, '.claude', 'scripts');
const ESTIMATES_FILE = path.join(TIMING_DIR, 'build-estimates.json');
const TIMING_SUMMARY = path.join(TIMING_DIR, 'timing-summary.json');
const TOKEN_SUMMARY = path.join(TIMING_DIR, 'token-summary.json');
const STATE_FILE = path.join(PROJECT_ROOT, 'generated-docs', 'context', 'workflow-state.json');
const REPORT_MD = path.join(TIMING_DIR, 'per-page-report.md');

const STEP_RE = /^BUILD · epic (\d+) · story (\d+)$/;

// ---- formatting helpers ----
function fmtMin(min) {
  if (min == null || min < 0) return '—';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

function fmtVariance(estMin, actMin) {
  if (actMin == null || estMin == null) return '—';
  const diff = Math.round(actMin - estMin);
  const sign = diff > 0 ? '+' : '';
  const pct = estMin > 0 ? ` (${sign}${Math.round((diff / estMin) * 100)}%)` : '';
  return `${sign}${diff}m${pct}`;
}

function fmtTokens(n) {
  if (!n) return '—';
  return n.toLocaleString('en-US');
}

function fmtCost(usd) {
  if (!usd) return '—';
  return '$' + Number(usd).toFixed(2);
}

function esc(s) {
  return String(s || '').replace(/\|/g, '\\|');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ---- load + merge ----
function refreshSummaries() {
  for (const script of ['timing-report.js', 'token-report.js']) {
    try {
      execFileSync('node', [path.join(SCRIPTS_DIR, script)], { stdio: 'ignore' });
    } catch {
      // Source log may not exist yet (nothing built) — non-fatal; the gap is reported.
    }
  }
}

/** Pull story page-identity (route, title, isInfrastructureOnly) from workflow-state. */
function loadPageIdentity() {
  const state = readJson(STATE_FILE);
  const map = {}; // "epic:story" -> { route, title, isInfra }
  if (!state || !state.epics) return { map, available: false };
  for (const epic of Object.values(state.epics)) {
    const stories = epic.stories || {};
    for (const st of Object.values(stories)) {
      if (st.index == null && st.story == null) continue;
      const storyNo = st.index != null ? st.index : st.story;
      map[`${epic.index}:${storyNo}`] = {
        route: st.route != null ? st.route : null,
        title: st.title || '',
        isInfra: st.isInfrastructureOnly === true,
      };
    }
  }
  return { map, available: true };
}

function buildRows() {
  const estimates = readJson(ESTIMATES_FILE);
  const timing = readJson(TIMING_SUMMARY);
  const tokens = readJson(TOKEN_SUMMARY);
  const { map: pageMap, available: stateAvailable } = loadPageIdentity();

  const rows = {}; // "epic:story" -> merged row

  const ensure = (epic, story) => {
    const key = `${epic}:${story}`;
    if (!rows[key]) {
      rows[key] = {
        epic, story,
        title: '', complexity: '', driver: '',
        estimateMin: null, actualMin: null,
        tokens: null, costUsd: null,
        route: undefined, isInfra: undefined,
      };
    }
    return rows[key];
  };

  // Estimates.
  if (estimates && Array.isArray(estimates.stories)) {
    for (const s of estimates.stories) {
      const r = ensure(Number(s.epic), Number(s.story));
      r.title = s.title || r.title;
      r.complexity = s.complexity || '';
      r.driver = s.driver || '';
      r.estimateMin = Number(s.estimateMin) || 0;
    }
  }

  // Actual active time (ms -> min).
  if (timing && timing.steps) {
    for (const [k, ms] of Object.entries(timing.steps)) {
      const m = STEP_RE.exec(k);
      if (!m) continue;
      ensure(Number(m[1]), Number(m[2])).actualMin = ms / 60000;
    }
  }

  // Tokens + cost.
  if (tokens && tokens.steps) {
    for (const [k, b] of Object.entries(tokens.steps)) {
      const m = STEP_RE.exec(k);
      if (!m) continue;
      const r = ensure(Number(m[1]), Number(m[2]));
      r.tokens = b.totalTokens || 0;
      r.costUsd = b.costUsd || 0;
    }
  }

  // Page identity from state (also fills title where estimates lacked it).
  for (const [key, ident] of Object.entries(pageMap)) {
    const [epic, story] = key.split(':').map(Number);
    const r = ensure(epic, story);
    r.route = ident.route;
    r.isInfra = ident.isInfra;
    if (!r.title) r.title = ident.title;
  }

  return {
    rows: Object.values(rows).sort((a, b) => a.epic - b.epic || a.story - b.story),
    sources: {
      estimates: !!estimates,
      timing: !!timing,
      tokens: !!tokens,
      state: stateAvailable,
    },
  };
}

// ---- render ----
function isPage(r) {
  // Page = routable story. If state told us, trust it; otherwise treat unknown as a
  // page (so rows aren't silently dropped) but flag the ambiguity in the notes.
  if (r.isInfra === true) return false;
  if (r.route !== undefined) return r.route !== null;
  return true;
}

function tableRows(rows, lines) {
  let est = 0, act = 0, actKnown = false, tok = 0, cost = 0;
  for (const r of rows) {
    const label = r.title || `Epic ${r.epic} · Story ${r.story}`;
    const route = r.route ? `\`${esc(r.route)}\`` : (r.route === null ? '— (infra)' : '?');
    if (r.estimateMin != null) est += r.estimateMin;
    if (r.actualMin != null) { act += r.actualMin; actKnown = true; }
    if (r.tokens != null) tok += r.tokens;
    if (r.costUsd != null) cost += r.costUsd;
    lines.push(
      `| ${r.epic}.${r.story} | ${esc(label)} | ${route} | ${r.complexity || '—'} | ` +
      `${fmtMin(r.estimateMin)} | ${r.actualMin != null ? fmtMin(r.actualMin) : '—'} | ` +
      `${fmtVariance(r.estimateMin, r.actualMin)} | ${fmtTokens(r.tokens)} | ${fmtCost(r.costUsd)} |`
    );
  }
  return { est, act, actKnown, tok, cost };
}

function header(lines, firstCol) {
  lines.push(`| ${firstCol} | Page | Route | Cx | Estimate | Actual | Variance | Tokens | Est. cost |`);
  lines.push('| --- | --- | --- | :---: | --- | --- | --- | --- | --- |');
}

function buildMarkdown(data) {
  const { rows, sources } = data;
  const pages = rows.filter(isPage);
  const infra = rows.filter((r) => !isPage(r));

  const lines = [];
  lines.push('# Per-Page Build Report');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z_`);
  lines.push('');
  lines.push('One row per **page (wireframe)** — a routable story — joining its planning');
  lines.push('**estimate**, measured **active build time**, estimate-vs-actual **variance**,');
  lines.push('and **tokens / cost**. Infrastructure-only stories (no page) are listed separately.');
  lines.push('Cx = complexity (S/M/L). Cost is an estimate from public model rates — a guide, not a bill.');
  lines.push('');

  // Source-availability banner.
  const missing = [];
  if (!sources.estimates) missing.push('estimates (`build-estimates.json`)');
  if (!sources.timing) missing.push('actual time (`timing-summary.json` — run `timing-report.js`)');
  if (!sources.tokens) missing.push('tokens (`token-summary.json` — run `token-report.js`)');
  if (!sources.state) missing.push('page identity (`workflow-state.json`)');
  if (missing.length) {
    lines.push('> **Partial data** — not yet available: ' + missing.join('; ') + '.');
    lines.push('> Columns for missing sources show `—`. Re-run after building (or with `--refresh`).');
    lines.push('');
  }

  if (!rows.length) {
    lines.push('_No per-story data yet. Estimates are authored at each epic\'s story gate;');
    lines.push('actuals and tokens accrue during BUILD._');
    lines.push('');
  } else {
    // Pages.
    lines.push('## Pages (wireframes)');
    lines.push('');
    if (pages.length) {
      header(lines, 'E.S');
      const t = tableRows(pages, lines);
      lines.push(
        `| **Total** | **${pages.length} page(s)** | | | **${fmtMin(t.est)}** | ` +
        `**${t.actKnown ? fmtMin(t.act) : '—'}** | ${t.actKnown ? fmtVariance(t.est, t.act) : '—'} | ` +
        `**${fmtTokens(t.tok)}** | **${fmtCost(t.cost)}** |`
      );
    } else {
      lines.push('_No routable pages recorded yet._');
    }
    lines.push('');

    // Infra.
    if (infra.length) {
      lines.push('## Infrastructure (non-page stories)');
      lines.push('');
      header(lines, 'E.S');
      const t = tableRows(infra, lines);
      lines.push(
        `| **Total** | **${infra.length} story(ies)** | | | **${fmtMin(t.est)}** | ` +
        `**${t.actKnown ? fmtMin(t.act) : '—'}** | ${t.actKnown ? fmtVariance(t.est, t.act) : '—'} | ` +
        `**${fmtTokens(t.tok)}** | **${fmtCost(t.cost)}** |`
      );
      lines.push('');
    }

    // Grand total.
    const all = tableRows(rows, []); // accumulate only
    lines.push('## Grand total (all stories)');
    lines.push('');
    lines.push('| | Estimate | Actual | Variance | Tokens | Est. cost |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    lines.push(
      `| **All ${rows.length} stories** | **${fmtMin(all.est)}** | ` +
      `**${all.actKnown ? fmtMin(all.act) : '—'}** | ${all.actKnown ? fmtVariance(all.est, all.act) : '—'} | ` +
      `**${fmtTokens(all.tok)}** | **${fmtCost(all.cost)}** |`
    );
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Sources: `build-estimates.json` (estimates), `timing-summary.json` (actual time),');
  lines.push('`token-summary.json` (tokens/cost), `workflow-state.json` (page identity).');
  lines.push('Re-run `node .claude/scripts/per-page-report.js --refresh` anytime for an updated view._');
  lines.push('');
  return lines.join('\n');
}

// ---- main ----
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--refresh')) refreshSummaries();

  const data = buildRows();
  const md = buildMarkdown(data);

  if (!fs.existsSync(TIMING_DIR)) fs.mkdirSync(TIMING_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, md, 'utf8');

  const pages = data.rows.filter(isPage).length;
  console.log(`Wrote ${path.relative(PROJECT_ROOT, REPORT_MD)} — ${pages} page(s), ${data.rows.length} story(ies) total.`);
  if (argv.includes('--print')) console.log('\n' + md);
}

main();
