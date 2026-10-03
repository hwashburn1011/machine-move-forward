param([int]$Port = 5207, [string]$Godot = $env:MMF_GODOT)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ownedServer = $null
Push-Location -LiteralPath $taskRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) { throw 'Run npm ci in the repository first.' }
    if (-not $Godot) { $Godot = Join-Path $taskRoot 'test-results\godot-tools\Godot_v4.7.2-stable_win64_console.exe' }
    if (-not (Test-Path -LiteralPath $Godot)) { throw 'Pass -Godot with the path to Godot 4.7.2, or set MMF_GODOT.' }
    $version = (& $Godot --version | Out-String).Trim()
    if ($version -notmatch '^4\.(7|[89]|[1-9][0-9])\.') { throw "Unsupported engine: $version. Use Godot 4.7.2." }
    & node tools/godot/prepare.mjs
    if ($LASTEXITCODE) { throw 'Asset/data conversion failed.' }
    $env:MMF_PORT = [string]$Port
    $serverReady = $false
    try { $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2; $serverReady = $response.StatusCode -eq 200 } catch { }
    if (-not $serverReady) {
        $node = (Get-Command node).Source
        $ownedServer = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', [string]$Port, '--strictPort') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru
        for ($i=0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 500
            try { $response=Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $serverReady=$true; break } } catch { }
        }
        if (-not $serverReady) { throw 'The temporary asset-baking server did not start.' }
    }
    & node tools/godot/bake-runtime.mjs --force
    if ($LASTEXITCODE) { throw 'Machine/building bake failed.' }
    & node tools/godot/bake-audio.mjs
    if ($LASTEXITCODE) { throw 'Sound bake failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --editor --import
    if ($LASTEXITCODE) { throw 'Godot import failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_legacy_enemies.gd
    if ($LASTEXITCODE) { throw 'Legacy enemy compilation failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_character_refinement.gd
    if ($LASTEXITCODE) { throw 'Character refinement compilation failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_sovereign_body.gd
    if ($LASTEXITCODE) { throw 'Sovereign body compilation failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_enemy_warning.gd
    if ($LASTEXITCODE) { throw 'Enemy warning geometry compilation failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_machine.gd
    if ($LASTEXITCODE) { throw 'Native machine compilation failed.' }
    & $Godot --headless --path (Join-Path $taskRoot 'godot') --script res://tools/bake_enemy_footing.gd --fixed-fps 60
    if ($LASTEXITCODE) { throw 'Enemy footing compilation failed.' }
    Write-Host 'Native assets ready. Double-click godot\Play Godot.cmd, or run tools/godot/launch.ps1.'
} finally {
    if ($ownedServer -and -not $ownedServer.HasExited) { Stop-Process -Id $ownedServer.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
