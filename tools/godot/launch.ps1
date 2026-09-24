param([string]$Godot = $env:MMF_GODOT, [switch]$Editor, [switch]$Test, [switch]$ParityTest, [switch]$AuditTest, [switch]$StoryTest, [switch]$PacingTest, [switch]$AtmosphereTest, [switch]$TerrainTest, [switch]$EffectBenchmark, [switch]$StreamTest, [switch]$SceneryTest, [switch]$StreamBenchmark, [switch]$CameraTest, [switch]$WorkloadTest, [switch]$SessionBenchmark, [switch]$AccessTest, [switch]$AccessBenchmark, [switch]$CaretakerTest, [switch]$ConstructionProfile, [switch]$DriveProfile, [switch]$TravelProfile, [switch]$AutosaveTest, [switch]$AutosaveProfile, [switch]$MotionAudit, [switch]$LocomotionTest, [switch]$LocomotionProfile, [switch]$Stress, [switch]$Benchmark, [switch]$Headless)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $Godot) {
    $Godot = Join-Path $taskRoot 'test-results\godot-tools\Godot_v4.7.2-stable_win64_console.exe'
    if (-not (Test-Path -LiteralPath $Godot)) {
        $command = Get-Command godot -ErrorAction SilentlyContinue
        if ($command) { $Godot = $command.Source }
    }
}
if (-not $Godot -or -not (Test-Path -LiteralPath $Godot)) { throw 'Install Godot 4.7.2, then pass -Godot <exe path> or set MMF_GODOT. See godot/README.md.' }
$version = (& $Godot --version | Out-String).Trim()
if ($version -notmatch '^4\.(7|[89]|[1-9][0-9])\.') { throw "Godot 4.7 or newer is required (found $version). The installed 4.1 editor is too old for this port." }
$project = Join-Path $taskRoot 'godot'
if (-not (Test-Path -LiteralPath (Join-Path $project 'assets\runtime\scatter.glb'))) { throw 'Assets have not been prepared. Run tools/godot/setup.ps1 first.' }
$arguments = @('--path', $project)
if ($Headless) { $arguments += '--headless' }
if ($Editor) { $arguments += '--editor' }
elseif ($Test) { $arguments += @('--script', 'tests/integration.gd') }
elseif ($ParityTest) { $arguments += @('--script', 'tests/play_parity.gd') }
elseif ($AuditTest) { $arguments += @('--script', 'tests/audit_parity.gd') }
elseif ($StoryTest) { $arguments += @('--script', 'tests/story_polish.gd') }
elseif ($PacingTest) { $arguments += @('--script', 'tests/journey_pacing.gd') }
elseif ($AtmosphereTest) { $arguments += @('--script', 'tests/atmosphere_effects.gd') }
elseif ($TerrainTest) { $arguments += @('--script', 'tests/dune_parity.gd') }
elseif ($CameraTest) { $arguments += @('--script', 'tests/camera_clearance.gd') }
elseif ($AccessTest) { $arguments += @('--script', 'tests/machine_access.gd') }
elseif ($AccessBenchmark) { $arguments += @('--script', 'tests/access_benchmark.gd') }
elseif ($CaretakerTest) { $arguments += @('--script', 'tests/caretaker_workload.gd') }
elseif ($ConstructionProfile) { $arguments += @('--script', 'tests/construction_profile.gd') }
elseif ($DriveProfile) { $arguments += @('--script', 'tests/caretaker_drive_profile.gd') }
elseif ($TravelProfile) { $arguments += @('--script', 'tests/travel_profile.gd') }
elseif ($AutosaveTest) { $arguments += @('--script', 'tests/autosave_worker.gd') }
elseif ($AutosaveProfile) { $arguments += @('--script', 'tests/autosave_profile.gd') }
elseif ($MotionAudit) { $arguments += @('--script', 'tests/player_motion_audit.gd') }
elseif ($LocomotionTest) { $arguments += @('--script', 'tests/player_locomotion.gd') }
elseif ($LocomotionProfile) { $arguments += @('--script', 'tests/locomotion_profile.gd') }
elseif ($WorkloadTest) { $arguments += @('--script', 'tests/session_workload.gd') }
elseif ($SessionBenchmark) { $arguments += @('--script', 'tests/session_benchmark.gd') }
elseif ($EffectBenchmark) { $arguments += @('--script', 'tests/effect_benchmark.gd') }
elseif ($StreamTest) { $arguments += @('--script', 'tests/scenery_streaming_checks.gd') }
elseif ($SceneryTest) { $arguments += @('--script', 'tests/scenery_contract.gd') }
elseif ($StreamBenchmark) {
    $arguments += @('--script', 'tests/scenery_streaming.gd')
    if (-not $Stress) { $arguments += @('--', '--prepared') }
}
elseif ($Benchmark) { $arguments += @('--script', 'tests/benchmark.gd') }
& $Godot @arguments
exit $LASTEXITCODE
