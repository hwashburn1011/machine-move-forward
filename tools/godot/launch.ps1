param([string]$Godot = $env:MMF_GODOT, [switch]$Editor, [switch]$Test, [switch]$ParityTest, [switch]$AuditTest, [switch]$Benchmark, [switch]$Headless)
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
elseif ($Benchmark) { $arguments += @('--script', 'tests/benchmark.gd') }
& $Godot @arguments
exit $LASTEXITCODE
