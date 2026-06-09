<!-- stadium8-claude: template-dev -->

# CLAUDE.md — Template Development

This is the **dev / source repo** for the Stadium 8 workflow template
(`stadium-software/stadium-8`). It is not an end-user project, and this file is
not the guidance users receive.

**What ships to users** lives in [CLAUDE.user.md](CLAUDE.user.md). On release,
the publish pipeline swaps that file in as the consumer-facing `CLAUDE.md`; this
file is maintainer-only and is discarded on publish.

## Development principles

- **Keep the workflow as simple as possible.** Every step, gate, and prompt is
  friction for the user. Add one only when it earns its place; prefer removing
  steps over adding them.
- **Keep user-facing language simple and actionable.** Anything an end user
  reads — slash-command output, prompts, gate questions, `CLAUDE.user.md`, help
  docs — must be plain, direct, and free of dev-speak or unexplained jargon.
  Write for someone who isn't a developer.

## Two kinds of work here

- **Template maintenance** — editing `.claude/`, `.github/`, `.template-docs/`,
  root configs, `CLAUDE.user.md`, or this file. This does **not** go through the
  TDD workflow; don't run `/start`, just make the change. The
  [workflow-guard.ps1](.claude/hooks/workflow-guard.ps1) hook detects this repo
  (via [.release-ignore](.release-ignore), which only the dev repo has) and
  won't push you toward `/start`.
- **Dogfooding** — building a sample app to test the `/start` → INTAKE → PLAN →
  BUILD flow as a user would. This **does** use `/start`. For the most faithful
  test, dogfood the published release repo (`Digiata/Stadium-8`) or a `dry_run`
  publish, not the dev arrangement.

## Editing user-facing rules

The numbered Critical Rules and policies users follow are the single source of
truth in [CLAUDE.user.md](CLAUDE.user.md) — change them there, not here.
References to "CLAUDE.md §N" anywhere in the workflow mean those rules. They're
imported at the bottom of this file so they also apply when you dogfood here.

## Releasing

A GitHub Release triggers
[publish-template.yml](.github/workflows/publish-template.yml): it copies dev →
release (excluding [.release-ignore](.release-ignore) entries), swaps
`CLAUDE.user.md` → `CLAUDE.md`, verifies the result, then pushes to
`Digiata/Stadium-8`. Workflow files under `.github/workflows/` are **not**
pushed automatically — copy those by hand. Full process and where-things-live:
[CONTRIBUTING.md](.template-docs/template-maintainers/CONTRIBUTING.md) and
[TEMPLATE_DEVELOPMENT.md](.template-docs/template-maintainers/TEMPLATE_DEVELOPMENT.md).

---

## Shipped end-user rules (single source of truth)

@CLAUDE.user.md
