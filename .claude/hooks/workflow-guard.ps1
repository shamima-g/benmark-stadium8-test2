# workflow-guard.ps1
# UserPromptSubmit hook: injects workflow state context on every user prompt.
# Ensures Claude always knows the TDD workflow state so it can redirect users
# who attempt development work outside the /start and /continue flow.
#
# Output: JSON with hookSpecificOutput.additionalContext
# Fail-safe: exits 0 with no output on parse errors or unknown state.

$ErrorActionPreference = 'SilentlyContinue'

$projectRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$stateFile = Join-Path $projectRoot 'generated-docs\context\workflow-state.json'
$nodeModulesPath = Join-Path $projectRoot 'web\node_modules'

# Dev-repo sentinel: .release-ignore exists only here (stripped on publish/sync).
$isTemplateDevRepo = Test-Path (Join-Path $projectRoot '.release-ignore')

$devRepoMessage = @"
TEMPLATE-DEV REPO: This is the Stadium 8 template source repo, not an end-user project.
- Template maintenance (.claude/, .github/, scripts, policies, docs, CLAUDE.user.md, the publish/sync pipeline) does NOT go through the TDD workflow. Proceed directly; do NOT redirect to /start.
- Use /start only when dogfooding the end-user experience (building a sample app to exercise the workflow). For a faithful test, prefer the release repo (Digiata/Stadium-8) over the dev repo.
"@

$guardMessage = $null

# --- Branches A & B: not yet in an active workflow (deps missing, or no state file) ---
# In the dev repo, emit the maintenance note once rather than pushing either case to /start.
if (-not (Test-Path $nodeModulesPath) -or -not (Test-Path $stateFile)) {
    if ($isTemplateDevRepo) {
        $guardMessage = $devRepoMessage
    }
    elseif (-not (Test-Path $nodeModulesPath)) {
        # Branch A: Project not set up
        $guardMessage = @"
WORKFLOW GUARD: Project not initialized. Dependencies are not installed.
Action: Redirect to /start — it handles install and prefs as part of Step 0 before INTAKE.
"@
    }
    else {
        # Branch B: No workflow state file
        $guardMessage = @"
WORKFLOW GUARD: No active workflow. No feature development has been started.
Action: Redirect to /start to begin the TDD workflow.
"@
    }
}
else {
    # --- Parse state file ---
    try {
        $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    } catch {
        exit 0
    }

    # --- Branch C: Feature complete ---
    if ($state.featureComplete) {
        $guardMessage = @"
WORKFLOW GUARD: Previous feature is complete.
Action: Redirect to /continue — it will prompt for the new epic(s) to add and re-open PLAN.
"@
    }
    # --- Branch D: COMPLETE phase, between stories/epics ---
    elseif ($state.currentPhase -eq 'COMPLETE' -and -not $state.featureComplete) {
        $guardMessage = @"
WORKFLOW GUARD: Workflow paused between stories/epics.
Action: Redirect to /continue to advance to the next story or epic.
"@
    }
    # --- Branch E: Active phase ---
    elseif ($state.currentPhase) {
        $phase = $state.currentPhase
        $epic = if ($state.currentEpic) { $state.currentEpic } else { 'N/A' }
        $story = if ($state.currentStory) { $state.currentStory } else { 'N/A' }
        $feature = if ($state.featureName) { $state.featureName } else { 'Unknown' }

        $guardMessage = @"
WORKFLOW GUARD: Active workflow detected.
Phase: $phase | Epic: $epic | Story: $story | Feature: $feature
Action: Redirect to /continue to resume the TDD workflow.
"@
    }
    else {
        # Unknown state — do not inject
        exit 0
    }
}

# --- Output JSON ---
$output = @{
    hookSpecificOutput = @{
        hookEventName = 'UserPromptSubmit'
        additionalContext = $guardMessage
    }
} | ConvertTo-Json -Depth 3

Write-Output $output
exit 0
