#!/usr/bin/env node
/**
 * journal.js
 * Read-modify-write helper for the workflow decision journal
 * (`generated-docs/context/journal.md`).
 *
 * Exists so the orchestrator never has to shell out to `node -e "...fs.writeFileSync..."`
 * for journal I/O — that form is (correctly) never auto-approved by the bash permission
 * checker, so it prompts on every story commit / epic boundary. `node .claude/scripts/*`
 * IS auto-approved, so routing journal append/read through this script removes the prompt.
 *
 * Subcommands:
 *   append   Append a story's Tier-2 / Tier-3 entries under the epic's section.
 *   flagged  Print (as a JSON array) the `[review]` / `[affects-downstream]` lines for an epic.
 *
 * Usage:
 *   node .claude/scripts/journal.js append  --entries-file <path.json> [--journal <path>]
 *   node .claude/scripts/journal.js flagged --epic <N>                 [--journal <path>]
 *
 * append --entries-file JSON shape (write it with the Write tool, then invoke this):
 *   {
 *     "epic": 1,
 *     "story": 4,
 *     "title": "manual-test fix (back-button after sign-out)",
 *     "tier2": ["plain-English entry", "..."],
 *     "tier3": [ { "tag": "review", "text": "..." },
 *                { "tag": "affects-downstream", "text": "..." } ]
 *   }
 *   `tag` accepts `review` / `affects-downstream` (brackets optional).
 *
 * flagged prints the matching lines verbatim (e.g. `- [review] ...`) as a JSON array,
 * matching the shape the orchestrator previously produced inline.
 */
'use strict';

const fs = require('fs');

const DEFAULT_JOURNAL = 'generated-docs/context/journal.md';
const FLAGGED_RE = /^- \[(review|affects-downstream)\]/;
const ANY_EPIC_RE = /^## Epic \d+\b/;
const VALID_TAGS = new Set(['review', 'affects-downstream']);

function fail(msg) {
  process.stderr.write(`journal.js: ${msg}\n`);
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

function readJournal(journalPath) {
  try {
    return fs.readFileSync(journalPath, 'utf8');
  } catch {
    return null; // missing
  }
}

/** Normalize a Tier-3 tag to bare `review` / `affects-downstream`. */
function normalizeTag(tag) {
  const t = String(tag).trim().replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!VALID_TAGS.has(t)) fail(`invalid tier3 tag "${tag}" (expected review | affects-downstream)`);
  return t;
}

/** Build the markdown lines for a single story block. */
function buildStoryBlock(entries) {
  const { story, title, tier2 = [], tier3 = [] } = entries;
  const lines = [];
  const heading = title ? `### Story ${story} — ${title}` : `### Story ${story}`;
  lines.push(heading, '');
  for (const text of tier2) lines.push(`- ${String(text).trim()}`);
  for (const item of tier3) lines.push(`- [${normalizeTag(item.tag)}] ${String(item.text).trim()}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Locate an epic's section within the split journal `lines`.
 * Returns { epicIdx, endIdx }: epicIdx is the `## Epic <epic>` header line index
 * (-1 if the epic has no section yet); endIdx is the index of the next `## Epic`
 * header, or lines.length when this is the last/only epic.
 */
function findEpicSection(lines, epic) {
  const headerRe = new RegExp(`^## Epic ${epic}\\b`);
  const epicIdx = lines.findIndex((l) => headerRe.test(l));
  if (epicIdx === -1) return { epicIdx, endIdx: lines.length };
  let endIdx = lines.length;
  for (let i = epicIdx + 1; i < lines.length; i++) {
    if (ANY_EPIC_RE.test(lines[i])) { endIdx = i; break; }
  }
  return { epicIdx, endIdx };
}

function append(args) {
  const journalPath = args.journal || DEFAULT_JOURNAL;
  if (!args['entries-file']) fail('append requires --entries-file <path.json>');

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(args['entries-file'], 'utf8'));
  } catch (e) {
    fail(`could not read/parse --entries-file: ${e.message}`);
  }
  if (entries.epic === undefined || entries.story === undefined) {
    fail('--entries-file JSON must include "epic" and "story"');
  }
  const hasEntries = (entries.tier2 && entries.tier2.length) || (entries.tier3 && entries.tier3.length);
  if (!hasEntries) {
    // Nothing to record — no-op (a story may produce zero journal entries).
    process.stdout.write('journal: no entries to append\n');
    return;
  }

  const epic = entries.epic;
  const epicHeader = `## Epic ${epic}`;
  const storyBlock = buildStoryBlock(entries);

  let content = readJournal(journalPath);
  if (content === null) content = '# Journal\n';

  const lines = content.split('\n');
  const { epicIdx, endIdx } = findEpicSection(lines, epic);

  if (epicIdx === -1) {
    // No section for this epic yet — start one at the end of the file.
    const trimmed = content.replace(/\s*$/, '');
    content = `${trimmed}\n\n${epicHeader}\n\n${storyBlock}`;
  } else {
    // Insert the story block at the end of this epic's block (before the next `## Epic`).
    // Trim trailing blank lines within the epic block, then splice the new story block in.
    let insertAt = endIdx;
    while (insertAt > epicIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    const block = ['', ...storyBlock.split('\n')];
    lines.splice(insertAt, 0, ...block);
    content = lines.join('\n');
  }

  if (!content.endsWith('\n')) content += '\n';
  fs.writeFileSync(journalPath, content);
  // --consume: the entries file is a single-use input; remove it so it never lingers
  // in the working tree (would otherwise show up in `git status` / "review changed files").
  if (args.consume) { try { fs.unlinkSync(args['entries-file']); } catch {} }
  process.stdout.write(`journal: appended Story ${entries.story} under Epic ${epic}\n`);
}

function flagged(args) {
  const journalPath = args.journal || DEFAULT_JOURNAL;
  if (args.epic === undefined || args.epic === true) fail('flagged requires --epic <N>');
  const epic = String(args.epic);

  const content = readJournal(journalPath);
  if (content === null) { process.stdout.write('[]\n'); return; }

  const lines = content.split('\n');
  const { epicIdx, endIdx } = findEpicSection(lines, epic);
  if (epicIdx === -1) { process.stdout.write('[]\n'); return; }

  const result = lines.slice(epicIdx, endIdx).filter((l) => FLAGGED_RE.test(l));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// --- main ---
const [, , sub, ...rest] = process.argv;
const args = parseArgs(rest);

switch (sub) {
  case 'append': append(args); break;
  case 'flagged': flagged(args); break;
  default:
    fail(`unknown subcommand "${sub || ''}" (expected: append | flagged)`);
}
