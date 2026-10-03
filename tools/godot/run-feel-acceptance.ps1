param(
    [string]$Engine = "test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe",
    [switch]$StairsPairs
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$enginePath = (Resolve-Path (Join-Path $workspace $Engine)).Path
$outputDirectory = Join-Path $workspace "test-results/godot-native"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Get-Process -Name "Godot*" -ErrorAction SilentlyContinue) {
    throw "Another Godot process is running. Release the profiling slot before running this set."
}

$samples = @()
if ($StairsPairs) {
    foreach ($repeat in 1..5) {
        foreach ($skip in @($true, $false)) {
            $mode = if ($skip) { "before" } else { "after" }
            $samples += @{ id = "stairs-$mode-$repeat"; route = "scanner"; seconds = 20; cap = 60; recording = $true; exercise = "construction"; instrumented = $true; skip_stairs_preparation = $skip }
        }
    }
} else {
    foreach ($repeat in 1..3) {
        foreach ($recording in @($false, $true)) {
            $mode = if ($recording) { "on" } else { "off" }
            $samples += @{ id = "recorder-$mode-$repeat"; route = "foundry-route"; seconds = 30; cap = 0; recording = $recording; exercise = "" }
        }
    }
    $samples += @{ id = "travel-save"; route = "foundry-route"; seconds = 90; cap = 60; recording = $true; exercise = "" }
    $samples += @{ id = "construction"; route = "scanner"; seconds = 20; cap = 60; recording = $true; exercise = "construction" }
    $samples += @{ id = "expedition"; route = "foundry"; seconds = 20; cap = 60; recording = $true; exercise = "expedition" }
}

function Get-BackgroundRenderApps {
    @(Get-Process -Name "blender", "Godot*" -ErrorAction SilentlyContinue | ForEach-Object {
        @{ name = $_.ProcessName; id = $_.Id; cpu_seconds = $_.CPU }
    })
}
$manifest = @{
    started = (Get-Date).ToUniversalTime().ToString("o")
    engine = $enginePath
    host_before = @(Get-BackgroundRenderApps)
    cache_state = "Fresh processes; OS and driver caches uncontrolled. Background GPU utilization not measured."
    samples = @()
}
Push-Location $workspace
try {
    foreach ($sample in $samples) {
        $jsonPath = "res://../test-results/godot-native/feel-final-$($sample.id).json"
        $logPath = Join-Path $outputDirectory "feel-final-$($sample.id).log"
        $arguments = @("--path", "godot", "--script", "res://tests/feel_route_profile.gd", "--", "--route=$($sample.route)", "--seconds=$($sample.seconds)", "--cap=$($sample.cap)", "--label=final-$($sample.id)", "--output=$jsonPath")
        if ($sample.recording) { $arguments += "--playtest-record" }
        if ($sample.exercise) { $arguments += "--exercise=$($sample.exercise)" }
        if ($sample.instrumented) { $arguments += "--instrumented" }
        if ($sample.skip_stairs_preparation) { $arguments += "--skip-stairs-preparation" }
        $sample.arguments = $arguments
        $sample.started = (Get-Date).ToUniversalTime().ToString("o")
        & $enginePath @arguments *> $logPath
        $sample.exit_code = $LASTEXITCODE
        $sample.finished = (Get-Date).ToUniversalTime().ToString("o")
        $manifest.samples += $sample
        Write-Output "$($sample.id): exit=$($sample.exit_code)"
        if ($sample.exit_code -ne 0) { throw "Sample $($sample.id) failed. Inspect $logPath." }
    }
} finally {
    $manifest.finished = (Get-Date).ToUniversalTime().ToString("o")
    $manifest.host_after = @(Get-BackgroundRenderApps)
    $hostFile = if ($StairsPairs) { "feel-stairs-host.json" } else { "feel-final-host.json" }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputDirectory $hostFile) -Encoding utf8
    Pop-Location
}
