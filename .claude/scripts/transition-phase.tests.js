#!/usr/bin/env node
/**
 * Tests for transition-phase.js --story-context
 *
 * Focused on the read-only --story-context command (Step B1 in /continue): the
 * orchestrator must be able to pull per-story BUILD context without reading the
 * full workflow-state.json or shelling out to an un-approved `node -e`/`jq`.
 *
 * Usage:
 *   node .claude/scripts/transition-phase.tests.js
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const scriptPath = path.join(__dirname, 'transition-phase.js');
const tmpDir = path.join(os.tmpdir(), 'transition-phase-tests-' + Date.now());
const contextDir = path.join(tmpDir, 'generated-docs', 'context');

let passed = 0;
let failed = 0;
const errors = [];

// =============================================================================
// FIXTURE
// =============================================================================

const STATE = {
  currentEpic: 2,
  currentStory: 1,
  currentPhase: 'BUILD',
  totalEpics: 2,
  epics: {
    1: { index: 1, name: 'Auth', slug: 'epic-1-auth', stories: {} },
    2: {
      index: 2,
      name: 'App Shell',
      slug: 'epic-2-app-shell',
      epicIntroducesSharedSurface: true,
      infrastructureReuseNotes: ['Reuse SessionContext'],
      prototypeSrcRoutes: { '/dashboard': 'prototype-src/dashboard' },
      nonGoals: ['No theme switching'],
      stories: {
        1: { title: 'App shell layout', route: '/', acceptanceCriteria: [{ id: 'AC-1', text: 'renders', coverage: 'playwright' }] },
        3: { title: 'Status badge', route: null, isInfrastructureOnly: true, acceptanceCriteria: [] },
      },
    },
  },
};

const MANIFEST = {
  context: { testInfrastructure: { playwrightMockingDefault: 'page-route-with-shape-report' } },
};

function setup() {
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(path.join(contextDir, 'workflow-state.json'), JSON.stringify(STATE, null, 2));
  fs.writeFileSync(path.join(contextDir, 'intake-manifest.json'), JSON.stringify(MANIFEST, null, 2));
}

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Run from tmpDir as CWD — workflow-helpers resolves state/manifest relative to CWD.
function run(args, { withManifest = true } = {}) {
  const manifestPath = path.join(contextDir, 'intake-manifest.json');
  const hadManifest = fs.existsSync(manifestPath);
  if (!withManifest && hadManifest) fs.rmSync(manifestPath);
  try {
    const output = execFileSync('node', [scriptPath, ...args], {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, exitCode: 0, data: JSON.parse(output) };
  } catch (err) {
    let data = null;
    try { data = JSON.parse(err.stdout ?? ''); } catch { /* not JSON */ }
    return { ok: false, exitCode: err.status ?? 1, data, stderr: (err.stderr ?? '').trim() };
  } finally {
    if (!withManifest && hadManifest) fs.writeFileSync(manifestPath, JSON.stringify(MANIFEST, null, 2));
  }
}

function assert(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; errors.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

// =============================================================================
// TESTS
// =============================================================================

setup();
try {
  // Explicit --epic/--story
  let r = run(['--story-context', '--epic', '2', '--story', '3']);
  assert('explicit epic/story succeeds', r.ok && r.data.status === 'ok', `exit=${r.exitCode}`);
  assert('explicit returns right story', r.ok && r.data.storyData.title === 'Status badge');
  assert('explicit carries epic-level shared-surface flag', r.ok && r.data.epicIntroducesSharedSurface === true);
  assert('explicit carries infrastructureReuseNotes', r.ok && Array.isArray(r.data.infrastructureReuseNotes) && r.data.infrastructureReuseNotes.length === 1);
  assert('explicit carries prototypeSrcRoutes', r.ok && r.data.prototypeSrcRoutes['/dashboard'] === 'prototype-src/dashboard');
  assert('explicit carries playwrightMockingDefault from manifest', r.ok && r.data.playwrightMockingDefault === 'page-route-with-shape-report');
  // Output is limited to exactly the documented B1/B2/B3 fields — no bonus epic metadata.
  const expectedKeys = ['status', 'epic', 'story', 'epicIntroducesSharedSurface', 'infrastructureReuseNotes', 'prototypeSrcRoutes', 'playwrightMockingDefault', 'storyData'].sort();
  assert('output contains only the necessary keys', r.ok && JSON.stringify(Object.keys(r.data).sort()) === JSON.stringify(expectedKeys), r.ok ? Object.keys(r.data).sort().join(',') : '');

  // --current resolves from state
  r = run(['--story-context', '--current']);
  assert('--current resolves currentEpic/currentStory', r.ok && r.data.epic === 2 && r.data.story === 1, `got ${r.data?.epic}/${r.data?.story}`);
  assert('--current returns the right story', r.ok && r.data.storyData.title === 'App shell layout');

  // --current with --story override
  r = run(['--story-context', '--current', '--story', '3']);
  assert('--current + --story override', r.ok && r.data.epic === 2 && r.data.story === 3 && r.data.storyData.title === 'Status badge');

  // Missing manifest → default mocking value
  r = run(['--story-context', '--epic', '2', '--story', '1'], { withManifest: false });
  assert('missing manifest falls back to page-route-with-spec', r.ok && r.data.playwrightMockingDefault === 'page-route-with-spec', `got ${r.data?.playwrightMockingDefault}`);

  // Error: unknown story
  r = run(['--story-context', '--epic', '2', '--story', '99']);
  assert('unknown story errors with exit 1', !r.ok && r.exitCode === 1 && r.data?.status === 'error');

  // Error: unknown epic
  r = run(['--story-context', '--epic', '9', '--story', '1']);
  assert('unknown epic errors with exit 1', !r.ok && r.exitCode === 1 && r.data?.status === 'error');

  // Error: no refs at all
  r = run(['--story-context']);
  assert('no refs errors with exit 1', !r.ok && r.exitCode === 1 && r.data?.status === 'error');

  // Error: explicit refs but no state file at all (exercises getStoryContext's no-state branch)
  const statePath = path.join(contextDir, 'workflow-state.json');
  fs.rmSync(statePath);
  r = run(['--story-context', '--epic', '2', '--story', '3']);
  assert('missing state file errors with exit 1', !r.ok && r.exitCode === 1 && r.data?.status === 'error');
  fs.writeFileSync(statePath, JSON.stringify(STATE, null, 2));
} finally {
  cleanup();
}

// =============================================================================
// REPORT
// =============================================================================

console.log(`\ntransition-phase --story-context: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const e of errors) console.log('  - ' + e);
  process.exit(1);
}
