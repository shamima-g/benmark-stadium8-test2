# token-tracker.ps1
# Records per-turn token usage for the build, broken down by phase, tagged with
# the agent that spent the tokens (main loop vs. each subagent type).
#
# Fires from one hook:
#   Stop -> end of a main-loop turn. At that point all of this turn's subagents
#           have finished and written their transcripts, so a single sweep here
#           captures both main-loop and subagent usage for the turn.
#
# How it works (self-contained, no watermark file):
#   - Claude Code records per-message `usage` (input / output / cache-create /
#     cache-read tokens) in the session transcript. A single API response is
#     split across several transcript lines that all repeat the SAME usage and
#     SAME message.id, so we DEDUPE by message.id to avoid massive double-counting.
#   - To know which messages were already recorded, we read our OWN output log
#     (token-usage.jsonl) and skip any message.id already present. This makes the
#     hook idempotent and survives /clear, resume, and re-runs with no extra state.
#   - Subagent transcripts live in <transcript-dir>/<session>/subagents/*.jsonl,
#     are flagged isSidechain=true, and carry `attributionAgent` (the agent type).
#     They are separate files, so summing main + subagent never double-counts a
#     subagent's own generation.
#
# Each new message becomes one JSON line in:
#   generated-docs/timing/token-usage.jsonl
# tagged with the phase/epic/story current at the time the turn ended.
#
# Gating: only logs while a workflow exists (state file present with a currentPhase
# and not featureComplete), mirroring timing-tracker.ps1 — non-workflow chatter is
# never recorded.
# Fail-safe: always exits 0 and never emits context; token tracking must never
# block or interfere with the workflow.

[CmdletBinding()]
param()

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
    # Stop once the build is fully finished (report has been generated).
    if ($state.featureComplete) { exit 0 }

    $transcriptPath = $hookData.transcript_path
    if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) { exit 0 }

    $timingDir = Join-Path $projectPath 'generated-docs\timing'
    if (-not (Test-Path $timingDir)) {
        New-Item -ItemType Directory -Force -Path $timingDir | Out-Null
    }
    $logFile = Join-Path $timingDir 'token-usage.jsonl'

    # Build the set of message.ids we've already recorded (idempotency / dedupe).
    $seen = @{}
    if (Test-Path $logFile) {
        foreach ($raw in Get-Content $logFile -ErrorAction SilentlyContinue) {
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }
            try {
                $rec = $raw | ConvertFrom-Json
                if ($rec.msgId) { $seen[$rec.msgId] = $true }
            }
            catch { }
        }
    }

    $now = [DateTimeOffset]::UtcNow
    $nowIso = $now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $nowMs = $now.ToUnixTimeMilliseconds()

    # Collect the transcript files to sweep: the main transcript plus this
    # session's subagent transcripts (if the directory exists).
    $files = @()
    $files += [PSCustomObject]@{ Path = $transcriptPath; Kind = 'main' }

    $transcriptDir = Split-Path -Parent $transcriptPath
    $sessionId = $hookData.session_id
    if ($sessionId) {
        $subDir = Join-Path (Join-Path $transcriptDir $sessionId) 'subagents'
        if (Test-Path $subDir) {
            foreach ($f in Get-ChildItem $subDir -Filter '*.jsonl' -ErrorAction SilentlyContinue) {
                $files += [PSCustomObject]@{ Path = $f.FullName; Kind = 'subagent' }
            }
        }
    }

    # Accumulate new records here, then append in one write.
    $newLines = New-Object System.Collections.Generic.List[string]
    # Dedupe within this run too (a message.id should be recorded at most once).
    $localSeen = @{}

    foreach ($entry in $files) {
        foreach ($raw in Get-Content $entry.Path -ErrorAction SilentlyContinue) {
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }
            try {
                $line = $raw | ConvertFrom-Json
            }
            catch { continue }

            if ($line.type -ne 'assistant') { continue }
            $msg = $line.message
            if (-not $msg) { continue }
            $usage = $msg.usage
            if (-not $usage) { continue }

            $msgId = $msg.id
            if (-not $msgId) { continue }
            if ($seen.ContainsKey($msgId) -or $localSeen.ContainsKey($msgId)) { continue }
            $localSeen[$msgId] = $true

            # An entry is a subagent message if it's flagged as a sidechain,
            # regardless of which file it came from.
            $isSub = ($line.isSidechain -eq $true) -or ($entry.Kind -eq 'subagent')
            $kind = if ($isSub) { 'subagent' } else { 'main' }
            $agent = if ($line.attributionAgent) { $line.attributionAgent } elseif ($isSub) { 'subagent' } else { 'main' }

            $inp = [int64]($usage.input_tokens)
            $out = [int64]($usage.output_tokens)
            $cc = [int64]($usage.cache_creation_input_tokens)
            $cr = [int64]($usage.cache_read_input_tokens)

            $record = [ordered]@{
                ts            = $nowIso
                epochMs       = $nowMs
                phase         = $state.currentPhase
                epic          = $state.currentEpic
                story         = $state.currentStory
                kind          = $kind
                agent         = $agent
                model         = $msg.model
                msgId         = $msgId
                input         = $inp
                output        = $out
                cacheCreate   = $cc
                cacheRead     = $cr
                session       = $sessionId
            }
            $newLines.Add(($record | ConvertTo-Json -Compress -Depth 4))
        }
    }

    if ($newLines.Count -gt 0) {
        Add-Content -Path $logFile -Value $newLines -Encoding utf8
    }
}
catch {
    # Never let a token-tracking failure interfere with the workflow.
}

exit 0
