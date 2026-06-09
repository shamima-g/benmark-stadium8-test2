# timing-tracker.ps1
# Records active-work vs wait-time boundaries for the build, broken down by phase.
#
# Fires from two hooks:
#   UserPromptSubmit -> -EventType resume  (you re-engaged: active work starts)
#   Stop             -> -EventType yield   (Claude went idle: active work ends, wait begins)
#
# Each event is tagged with the current workflow phase/epic/story (read from
# workflow-state.json) and appended as one JSON line to:
#   generated-docs/timing/build-timing.jsonl
#
# "Active work time" is the sum of resume->yield spans. "Wait time" (yield->resume
# gaps: your decisions, manual verification, breaks, /clear gaps, time between
# sessions) is recorded implicitly and EXCLUDED from active totals by the report.
#
# Gating: only logs while a workflow exists (state file present with a currentPhase),
# so non-workflow / template-maintenance chatter is never recorded.
# Fail-safe: always exits 0 and never emits context; timing must never block work.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('resume', 'yield')]
    [string]$EventType
)

$ErrorActionPreference = 'SilentlyContinue'

try {
    $stdinContent = [System.Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($stdinContent)) { exit 0 }
    $hookData = $stdinContent | ConvertFrom-Json

    $projectPath = $hookData.cwd
    if (-not $projectPath) { exit 0 }

    # Read workflow state; skip logging entirely if no active workflow.
    $stateFile = Join-Path $projectPath 'generated-docs\context\workflow-state.json'
    if (-not (Test-Path $stateFile)) { exit 0 }
    $state = Get-Content $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json
    if (-not $state.currentPhase) { exit 0 }
    # Stop logging once the build is fully finished (report has been generated).
    if ($state.featureComplete) { exit 0 }

    $now = [DateTimeOffset]::UtcNow
    $record = [ordered]@{
        ts      = $now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        epochMs = $now.ToUnixTimeMilliseconds()
        event   = $EventType
        phase   = $state.currentPhase
        epic    = $state.currentEpic
        story   = $state.currentStory
        session = $hookData.session_id
    }

    $timingDir = Join-Path $projectPath 'generated-docs\timing'
    if (-not (Test-Path $timingDir)) {
        New-Item -ItemType Directory -Force -Path $timingDir | Out-Null
    }
    $logFile = Join-Path $timingDir 'build-timing.jsonl'

    $line = ($record | ConvertTo-Json -Compress -Depth 4)
    Add-Content -Path $logFile -Value $line -Encoding utf8
}
catch {
    # Never let a timing failure interfere with the workflow.
}

exit 0
