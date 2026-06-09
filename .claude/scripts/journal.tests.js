#!/usr/bin/env node
/**
 * Tests for journal.js — append + flagged against temp journal files.
 * Usage: node .claude/scripts/journal.tests.js
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'journal.js');
let passed = 0, failed = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));

function run(subAndArgs) {
  return execFileSync('node', [SCRIPT, ...subAndArgs], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
function writeEntries(obj) {
  const p = path.join(tmp, `entries-${Math.abs(JSON.stringify(obj).length)}-${Object.keys(obj).join('')}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}
function appendEntries(journal, obj) {
  run(['append', '--journal', journal, '--entries-file', writeEntries(obj)]);
}
function assert(cond, name) {
  if (cond) { passed++; console.log(`  \x1b[32mPASS\x1b[0m: ${name}`); }
  else { failed++; console.log(`  \x1b[31mFAIL\x1b[0m: ${name}`); }
}
function freshJournal(name) {
  const p = path.join(tmp, name);
  try { fs.unlinkSync(p); } catch {}
  return p;
}

// 1. append to a missing journal creates the epic section + story block
let j = freshJournal('j1.md');
appendEntries(j, { epic: 1, story: 1, title: 'first', tier2: ['did a thing'] });
let txt = fs.readFileSync(j, 'utf8');
assert(/## Epic 1\b/.test(txt), 'append creates "## Epic 1" header');
assert(/### Story 1 — first/.test(txt), 'append writes story heading with title');
assert(/^- did a thing$/m.test(txt), 'append writes tier2 entry as plain bullet');

// 2. second story under the same epic stays under Epic 1 (no duplicate Epic header)
appendEntries(j, { epic: 1, story: 2, title: 'second', tier2: ['another'] });
txt = fs.readFileSync(j, 'utf8');
assert((txt.match(/## Epic 1\b/g) || []).length === 1, 'second story does NOT duplicate the Epic 1 header');
assert(/### Story 2 — second/.test(txt), 'second story heading present');
assert(txt.indexOf('Story 1') < txt.indexOf('Story 2'), 'stories appended in order');

// 3. tier3 entries render with bracketed tags; tag accepts bare or bracketed
appendEntries(j, { epic: 1, story: 3, title: 't3',
  tier3: [{ tag: 'review', text: 'check me' }, { tag: '[affects-downstream]', text: 'later' }] });
txt = fs.readFileSync(j, 'utf8');
assert(/^- \[review\] check me$/m.test(txt), 'tier3 review formatted as "- [review] ..."');
assert(/^- \[affects-downstream\] later$/m.test(txt), 'tier3 bracketed tag normalized');

// 4. a new epic appends a new section after the existing one
appendEntries(j, { epic: 2, story: 1, title: 'e2s1', tier2: ['epic two work'] });
txt = fs.readFileSync(j, 'utf8');
assert(/## Epic 2\b/.test(txt), 'new epic section created');
assert(txt.indexOf('## Epic 1') < txt.indexOf('## Epic 2'), 'Epic 2 section after Epic 1');

// 5. flagged returns only the flagged lines for the requested epic
let out = JSON.parse(run(['flagged', '--journal', j, '--epic', '1']));
assert(Array.isArray(out) && out.length === 2, 'flagged returns the 2 flagged lines for Epic 1');
assert(out.some((l) => l.includes('[review] check me')) && out.some((l) => l.includes('[affects-downstream] later')),
  'flagged includes both review and affects-downstream lines');
let out2 = JSON.parse(run(['flagged', '--journal', j, '--epic', '2']));
assert(Array.isArray(out2) && out2.length === 0, 'flagged for Epic 2 (no flagged entries) returns []');

// 6. flagged on a missing journal returns []
let outMissing = JSON.parse(run(['flagged', '--journal', path.join(tmp, 'nope.md'), '--epic', '1']));
assert(Array.isArray(outMissing) && outMissing.length === 0, 'flagged on missing journal returns []');

// 7. append with no entries is a no-op (does not create an empty story block)
let j7 = freshJournal('j7.md');
appendEntries(j7, { epic: 1, story: 1, title: 'empty' });
assert(!fs.existsSync(j7), 'append with no tier2/tier3 entries writes nothing');

// 8. apostrophes / quotes / pipes in entry text survive (the whole point vs. node -e arg quoting)
let j8 = freshJournal('j8.md');
appendEntries(j8, { epic: 1, story: 1, title: "don't break", tier2: ['user\'s "quoted" a|b path'] });
txt = fs.readFileSync(j8, 'utf8');
assert(txt.includes('user\'s "quoted" a|b path'), 'special chars in entry text preserved');
assert(/### Story 1 — don't break/.test(txt), 'apostrophe in title preserved');

// 9. --consume deletes the entries file after a successful append
let j9 = freshJournal('j9.md');
let ef = path.join(tmp, 'consume-me.json');
fs.writeFileSync(ef, JSON.stringify({ epic: 1, story: 1, title: 'c', tier2: ['x'] }));
run(['append', '--journal', j9, '--entries-file', ef, '--consume']);
assert(!fs.existsSync(ef), '--consume removes the entries file');
assert(fs.existsSync(j9) && /- x/.test(fs.readFileSync(j9, 'utf8')), '--consume still appends before removing');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
