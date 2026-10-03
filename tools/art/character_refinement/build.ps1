param([string]$Blender='C:\Program Files\Blender Foundation\Blender 5.1\blender.exe')
$ErrorActionPreference='Stop'
$characterRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Push-Location -LiteralPath $characterRoot
try {
    foreach ($characterKind in @('s07','bastion','revenant','warden','sovereign','raider','scavenger')) {
        & $Blender --background --factory-startup --python-exit-code 1 --python tools/art/character_refinement/build.py -- $characterKind
        if ($LASTEXITCODE) { throw "Character refinement failed: $characterKind" }
    }
    Write-Host 'Refined GLBs ready. Run tools/godot/setup.ps1 to import and compile native scenes and footing.'
} finally { Pop-Location }
