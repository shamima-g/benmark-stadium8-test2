#!/usr/bin/env node
/**
 * token-report.js
 * Builds a token-usage report from the event log written by token-tracker.ps1.
 *
 * Source : generated-docs/timing/token-usage.jsonl  (one line per assistant message)
 * Output : generated-docs/timing/token-report.md     (and a JSON summary alongside)
 *
 * Model:
 *   - Each line is one Claude API response's usage (input / output / cache-create /
 *     cache-read tokens), deduped by message.id at write time, tagged with the
 *     phase/epic/story active when the turn ended and with the agent that spent it
 *     (main loop or a specific subagent type).
 *   - This report aggregates that log three ways: macro totals, per-phase, and
 *     granular (per BUILD epic/story, and per agent type).
 *   - Cost is estimated from a per-model price table (USD per million tokens).
 *     Cache writes bill at ~1.25x input (5-minute TTL); cache reads at ~0.1x.
 *     We use the 5-minute write rate as the default since Claude Code's prompt
 *     cache is 5-minute TTL. Unknown models are summed but contribute no cost
 *     (flagged in the report).
 *
 * Usage:
 *   node .claude/scripts/token-report.js          # write the report
 *   node .claude/scripts/token-report.js --print  # also print the markdown to stdout
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const TIMING_DIR = path.join(PROJECT_ROOT, 'generated-docs', 'timing');
const LOG_FILE = path.join(TIMING_DIR, 'token-usage.jsonl');
const REPORT_MD = path.join(TIMING_DIR, 'token-report.md');
const REPORT_JSON = path.join(TIMING_DIR, 'token-summary.json');

const PHASE_ORDER = ['INTAKE', 'PLAN', 'BUILD', 'COMPLETE'];

// USD per 1,000,000 tokens. input/output are billed rates; cacheWrite is the
// 5-minute-TTL rate (1.25x input); cacheRead is the cached-read rate (0.1x input).
// Edit here if Anthropic pricing changes. Keys match the model id prefix.
const PRICES = {
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

function priceFor(model) {
  if (!model) return null;
  // Match by prefix so dated/suffixed variants (e.g. -20251001) still resolve.
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key)) return PRICES[key];
  }
  return null;
}

function fmtTokens(n) {
  if (!n) return '0';
  return n.toLocaleString('en-US');
}

function fmtCost(usd) {
  if (!usd) return '$0.00';
  return '$' + usd.toFixed(2);
}

function isoToLocal(iso) {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

function loadEvents() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`No token log found at ${path.relative(PROJECT_ROOT, LOG_FILE)}.`);
    console.error('Token usage is recorded automatically once a workflow is active (after /start).');
    process.exit(1);
  }
  const events = [];
  const seen = new Set();
  for (const raw of fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      if (!e.msgId || seen.has(e.msgId)) continue; // defensive dedupe
      seen.add(e.msgId);
      events.push(e);
    } catch {
      /* skip malformed line */
    }
  }
  events.sort((a, b) => (a.epochMs || 0) - (b.epochMs || 0));
  return events;
}

function emptyBucket() {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, cost: 0, messages: 0 };
}

function addUsage(bucket, e, cost) {
  bucket.input += e.input || 0;
  bucket.output += e.output || 0;
  bucket.cacheCreate += e.cacheCreate || 0;
  bucket.cacheRead += e.cacheRead || 0;
  bucket.cost += cost;
  bucket.messages += 1;
}

function bucketTotal(b) {
  return b.input + b.output + b.cacheCreate + b.cacheRead;
}

function phaseKey(e) {
  return e.phase || 'UNKNOWN';
}

function stepKey(e) {
  // Within BUILD, break down by epic/story for granular reporting.
  if (e.phase === 'BUILD' && e.epic) {
    return e.story ? `BUILD · epic ${e.epic} · story ${e.story}` : `BUILD · epic ${e.epic}`;
  }
  return e.phase || 'UNKNOWN';
}

function analyze(events) {
  const total = emptyBucket();
  const phases = {};
  const steps = {};
  const agents = {};
  const models = new Set();
  let costedMessages = 0;
  let uncostedMessages = 0;

  for (const e of events) {
    const price = priceFor(e.model);
    let cost = 0;
    if (price) {
      cost =
        ((e.input || 0) * price.input +
          (e.output || 0) * price.output +
          (e.cacheCreate || 0) * price.cacheWrite +
          (e.cacheRead || 0) * price.cacheRead) /
        1_000_000;
      costedMessages += 1;
    } else {
      uncostedMessages += 1;
    }
    if (e.model) models.add(e.model);

    addUsage(total, e, cost);

    const pk = phaseKey(e);
    if (!phases[pk]) phases[pk] = emptyBucket();
    addUsage(phases[pk], e, cost);

    const sk = stepKey(e);
    if (sk.startsWith('BUILD ·')) {
      if (!steps[sk]) steps[sk] = emptyBucket();
      addUsage(steps[sk], e, cost);
    }

    const ak = e.agent || (e.kind === 'subagent' ? 'subagent' : 'main');
    if (!agents[ak]) agents[ak] = emptyBucket();
    addUsage(agents[ak], e, cost);
  }

  const first = events[0];
  const last = events[events.length - 1];

  return {
    total, phases, steps, agents,
    models: [...models],
    costedMessages, uncostedMessages,
    firstTs: first ? first.ts : null,
    lastTs: last ? last.ts : null,
  };
}

function bucketRow(label, b, withCost) {
  const cells = [
    label,
    fmtTokens(bucketTotal(b)),
    fmtTokens(b.input),
    fmtTokens(b.output),
    fmtTokens(b.cacheCreate),
    fmtTokens(b.cacheRead),
  ];
  if (withCost) cells.push(fmtCost(b.cost));
  return `| ${cells.join(' | ')} |`;
}

function tableHeader(firstCol, withCost) {
  const cols = [firstCol, 'Total', 'Input', 'Output', 'Cache write', 'Cache read'];
  if (withCost) cols.push('Est. cost');
  const sep = cols.map(() => '---');
  return `| ${cols.join(' | ')} |\n| ${sep.join(' | ')} |`;
}

function buildMarkdown(a) {
  const withCost = a.costedMessages > 0;
  const lines = [];
  lines.push('# Build Token-Usage Report');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z_`);
  lines.push('');
  lines.push('Token usage recorded per Claude API response, deduped by message id,');
  lines.push('and attributed to the phase/epic/story active when each turn ended.');
  lines.push('Subagent usage (developer, test-generator, etc.) is tracked alongside');
  lines.push('the main loop. Cost is estimated from public per-model rates (cache writes');
  lines.push('at the 5-minute-TTL rate); treat it as a guide, not a billing figure.');
  lines.push('');

  // --- Macro summary ---
  lines.push('## Summary (macro)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| **Total tokens** | **${fmtTokens(bucketTotal(a.total))}** |`);
  if (withCost) lines.push(`| **Estimated cost** | **${fmtCost(a.total.cost)}** |`);
  lines.push(`| Input tokens | ${fmtTokens(a.total.input)} |`);
  lines.push(`| Output tokens | ${fmtTokens(a.total.output)} |`);
  lines.push(`| Cache-write tokens | ${fmtTokens(a.total.cacheCreate)} |`);
  lines.push(`| Cache-read tokens | ${fmtTokens(a.total.cacheRead)} |`);
  lines.push(`| API responses recorded | ${a.total.messages} |`);
  lines.push(`| Models | ${a.models.join(', ') || 'unknown'} |`);
  if (a.firstTs) lines.push(`| First recorded | ${isoToLocal(a.firstTs)} |`);
  if (a.lastTs) lines.push(`| Last recorded | ${isoToLocal(a.lastTs)} |`);
  if (a.uncostedMessages > 0) {
    lines.push(`| Note | ${a.uncostedMessages} response(s) had no price entry — excluded from cost. |`);
  }
  lines.push('');

  // --- Per-phase table ---
  lines.push('## Per-phase breakdown');
  lines.push('');
  lines.push(tableHeader('Phase', withCost));
  const orderedPhases = Object.keys(a.phases).sort((x, y) => {
    const ix = PHASE_ORDER.indexOf(x); const iy = PHASE_ORDER.indexOf(y);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });
  for (const p of orderedPhases) lines.push(bucketRow(p, a.phases[p], withCost));
  lines.push('');

  // --- Granular BUILD breakdown (by epic/story) ---
  const granular = Object.keys(a.steps).sort();
  if (granular.length) {
    lines.push('## BUILD detail (tokens per epic/story)');
    lines.push('');
    lines.push(tableHeader('Unit', withCost));
    for (const k of granular) lines.push(bucketRow(k, a.steps[k], withCost));
    lines.push('');
  }

  // --- Per-agent breakdown ---
  const agentKeys = Object.keys(a.agents).sort((x, y) => bucketTotal(a.agents[y]) - bucketTotal(a.agents[x]));
  if (agentKeys.length) {
    lines.push('## Per-agent breakdown');
    lines.push('');
    lines.push(tableHeader('Agent', withCost));
    for (const k of agentKeys) lines.push(bucketRow(k, a.agents[k], withCost));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Source: `generated-docs/timing/token-usage.jsonl` (append-only event log).');
  lines.push('Re-run `node .claude/scripts/token-report.js` anytime for an updated snapshot._');
  lines.push('');
  return lines.join('\n');
}

function summaryBucket(b) {
  return {
    totalTokens: bucketTotal(b),
    input: b.input,
    output: b.output,
    cacheCreate: b.cacheCreate,
    cacheRead: b.cacheRead,
    costUsd: Number(b.cost.toFixed(4)),
    messages: b.messages,
  };
}

function main() {
  const events = loadEvents();
  if (!events.length) {
    console.error('Token log is empty — no usage recorded yet.');
    process.exit(1);
  }
  const a = analyze(events);
  const md = buildMarkdown(a);

  if (!fs.existsSync(TIMING_DIR)) fs.mkdirSync(TIMING_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, md, 'utf8');

  const summary = {
    generatedAt: new Date().toISOString(),
    total: summaryBucket(a.total),
    models: a.models,
    uncostedMessages: a.uncostedMessages,
    phases: Object.fromEntries(Object.entries(a.phases).map(([k, v]) => [k, summaryBucket(v)])),
    steps: Object.fromEntries(Object.entries(a.steps).map(([k, v]) => [k, summaryBucket(v)])),
    agents: Object.fromEntries(Object.entries(a.agents).map(([k, v]) => [k, summaryBucket(v)])),
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Wrote ${path.relative(PROJECT_ROOT, REPORT_MD)}`);
  const costNote = a.costedMessages > 0 ? ` (est. cost: ${fmtCost(a.total.cost)})` : '';
  console.log(`Total tokens: ${fmtTokens(bucketTotal(a.total))}${costNote}`);
  if (process.argv.includes('--print')) {
    console.log('\n' + md);
  }
}

main();
