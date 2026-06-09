#!/usr/bin/env node
/**
 * timing-report.js
 * Builds a build-duration report from the event log written by timing-tracker.ps1.
 *
 * Source : generated-docs/timing/build-timing.jsonl  (resume / yield events)
 * Output : generated-docs/timing/timing-report.md    (and a JSON summary alongside)
 *
 * Model:
 *   - Each turn produces a `resume` (you re-engaged -> active work starts) followed
 *     by a `yield` (Claude went idle -> active work ends).
 *   - ACTIVE work time  = sum of resume->yield spans, attributed to the phase/epic/story
 *     recorded on the `resume` event.
 *   - EXCLUDED wait time = yield->resume gaps (your decisions, manual verification,
 *     breaks, /clear gaps, time between sessions). Never counted as active.
 *
 * Usage:
 *   node .claude/scripts/timing-report.js          # write the report
 *   node .claude/scripts/timing-report.js --print  # also print the markdown to stdout
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const TIMING_DIR = path.join(PROJECT_ROOT, 'generated-docs', 'timing');
const LOG_FILE = path.join(TIMING_DIR, 'build-timing.jsonl');
const REPORT_MD = path.join(TIMING_DIR, 'timing-report.md');
const REPORT_JSON = path.join(TIMING_DIR, 'timing-summary.json');

const PHASE_ORDER = ['INTAKE', 'PLAN', 'BUILD', 'COMPLETE'];

function fmt(ms) {
  if (!ms || ms < 0) return '0s';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || !parts.length) parts.push(`${sec}s`);
  return parts.join(' ');
}

function isoToLocal(iso) {
  return new Date(iso).toISOString().replace('T', ' ').replace('.000Z', 'Z').slice(0, 16) + 'Z';
}

function loadEvents() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`No timing log found at ${path.relative(PROJECT_ROOT, LOG_FILE)}.`);
    console.error('Timing is recorded automatically once a workflow is active (after /start).');
    process.exit(1);
  }
  const events = [];
  for (const raw of fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const e = JSON.parse(line);
      if (e.epochMs && e.event) events.push(e);
    } catch {
      /* skip malformed line */
    }
  }
  events.sort((a, b) => a.epochMs - b.epochMs);
  return events;
}

function phaseKey(e) {
  return e.phase || 'UNKNOWN';
}

function stepKey(e) {
  // Within BUILD, break work down by epic/story for granular reporting.
  if (e.phase === 'BUILD' && e.epic) {
    return e.story ? `BUILD · epic ${e.epic} · story ${e.story}` : `BUILD · epic ${e.epic}`;
  }
  return e.phase || 'UNKNOWN';
}

function analyze(events) {
  const phases = {};   // phase -> { active, firstTs, lastTs, segments }
  const steps = {};    // granular label -> active ms
  const sessions = new Set();
  let totalActive = 0;
  let totalWait = 0;
  let longestWait = { ms: 0, from: null, to: null };

  let lastResume = null; // pending resume event awaiting a yield
  let lastYield = null;  // last yield, to measure the following wait gap

  const bump = (e, ms) => {
    const pk = phaseKey(e);
    if (!phases[pk]) phases[pk] = { active: 0, firstTs: e.ts, lastTs: e.ts, segments: 0 };
    phases[pk].active += ms;
    phases[pk].segments += 1;
    phases[pk].firstTs = phases[pk].firstTs < e.ts ? phases[pk].firstTs : e.ts;
    phases[pk].lastTs = phases[pk].lastTs > e.ts ? phases[pk].lastTs : e.ts;
    steps[stepKey(e)] = (steps[stepKey(e)] || 0) + ms;
    totalActive += ms;
  };

  for (const e of events) {
    if (e.session) sessions.add(e.session);

    if (e.event === 'resume') {
      // Wait gap = time since the previous yield (excluded from active).
      if (lastYield) {
        const waitMs = e.epochMs - lastYield.epochMs;
        if (waitMs > 0) {
          totalWait += waitMs;
          if (waitMs > longestWait.ms) longestWait = { ms: waitMs, from: lastYield.ts, to: e.ts };
        }
        lastYield = null;
      }
      lastResume = e; // newest resume wins if two arrive without a yield between
    } else if (e.event === 'yield') {
      if (lastResume) {
        const activeMs = e.epochMs - lastResume.epochMs;
        if (activeMs > 0) bump(lastResume, activeMs); // attribute to phase at start of turn
        lastResume = null;
      }
      lastYield = e;
    }
  }

  const first = events[0];
  const last = events[events.length - 1];
  const wallClock = last.epochMs - first.epochMs;

  return {
    phases, steps, sessions, totalActive, totalWait, longestWait, wallClock,
    firstTs: first.ts, lastTs: last.ts,
    openSegment: !!lastResume, // a turn currently in progress (not yet yielded)
  };
}

function buildMarkdown(a) {
  const lines = [];
  lines.push('# Build Timing Report');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z_`);
  lines.push('');
  lines.push('Active work time = time Claude spent actively working (resume → idle).');
  lines.push('Wait time (your decisions, manual verification, breaks, `/clear` gaps,');
  lines.push('time between sessions) is tracked separately and **excluded** from active totals.');
  lines.push('');

  // --- Macro summary ---
  lines.push('## Summary (macro)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| **Total active build time** | **${fmt(a.totalActive)}** |`);
  lines.push(`| Total wall-clock span | ${fmt(a.wallClock)} |`);
  lines.push(`| Excluded wait time | ${fmt(a.totalWait)} |`);
  lines.push(`| Sessions / \`/clear\`s | ${a.sessions.size} |`);
  lines.push(`| Longest single pause | ${fmt(a.longestWait.ms)} |`);
  lines.push(`| First event | ${isoToLocal(a.firstTs)} |`);
  lines.push(`| Last event | ${isoToLocal(a.lastTs)} |`);
  if (a.openSegment) lines.push('| Note | A turn is still in progress (not yet yielded). |');
  lines.push('');

  // --- Per-phase table ---
  lines.push('## Per-phase breakdown');
  lines.push('');
  lines.push('| Phase | Active work | Wall-clock span | Turns |');
  lines.push('| --- | --- | --- | --- |');
  const orderedPhases = Object.keys(a.phases).sort((x, y) => {
    const ix = PHASE_ORDER.indexOf(x); const iy = PHASE_ORDER.indexOf(y);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });
  for (const p of orderedPhases) {
    const ph = a.phases[p];
    const span = new Date(ph.lastTs).getTime() - new Date(ph.firstTs).getTime();
    lines.push(`| ${p} | ${fmt(ph.active)} | ${fmt(span)} | ${ph.segments} |`);
  }
  lines.push('');

  // --- Granular BUILD breakdown (by epic/story) ---
  const granular = Object.keys(a.steps).filter((k) => k.startsWith('BUILD ·')).sort();
  if (granular.length) {
    lines.push('## BUILD detail (active work per epic/story)');
    lines.push('');
    lines.push('| Unit | Active work |');
    lines.push('| --- | --- |');
    for (const k of granular) lines.push(`| ${k} | ${fmt(a.steps[k])} |`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('_Source: `generated-docs/timing/build-timing.jsonl` (append-only event log).');
  lines.push('Re-run `node .claude/scripts/timing-report.js` anytime for an updated snapshot._');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const events = loadEvents();
  if (!events.length) {
    console.error('Timing log is empty — no events recorded yet.');
    process.exit(1);
  }
  const a = analyze(events);
  const md = buildMarkdown(a);

  if (!fs.existsSync(TIMING_DIR)) fs.mkdirSync(TIMING_DIR, { recursive: true });
  fs.writeFileSync(REPORT_MD, md, 'utf8');

  const summary = {
    generatedAt: new Date().toISOString(),
    totalActiveMs: a.totalActive,
    totalWaitMs: a.totalWait,
    wallClockMs: a.wallClock,
    sessions: a.sessions.size,
    longestWaitMs: a.longestWait.ms,
    phases: Object.fromEntries(Object.entries(a.phases).map(([k, v]) => [k, { activeMs: v.active, turns: v.segments }])),
    steps: a.steps,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Wrote ${path.relative(PROJECT_ROOT, REPORT_MD)}`);
  console.log(`Total active build time: ${fmt(a.totalActive)} (excluded wait: ${fmt(a.totalWait)})`);
  if (process.argv.includes('--print')) {
    console.log('\n' + md);
  }
}

main();
