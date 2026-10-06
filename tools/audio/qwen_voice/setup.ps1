param([switch]$DownloadBase)
$ErrorActionPreference = 'Stop'
$ttsRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$ttsRuntime = Join-Path $ttsRoot 'test-results/qwen3-tts'
New-Item -ItemType Directory -Force $ttsRuntime | Out-Null
$env:UV_CACHE_DIR = Join-Path $ttsRuntime 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $ttsRuntime 'python'
$ttsPython = Join-Path $ttsRuntime 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $ttsPython)) {
    & uv venv --python 3.12.13 (Join-Path $ttsRuntime 'venv')
    if ($LASTEXITCODE) { throw 'Could not create the isolated Python environment.' }
}
& uv pip install --python $ttsPython torch==2.9.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE) { throw 'CUDA PyTorch installation failed.' }
& uv pip install --python $ttsPython -r (Join-Path $PSScriptRoot 'requirements.lock.txt')
if ($LASTEXITCODE) { throw 'Qwen package installation failed.' }
& $ttsPython (Join-Path $PSScriptRoot 'download.py')
if ($LASTEXITCODE) { throw 'VoiceDesign download failed.' }
if ($DownloadBase) {
    & $ttsPython (Join-Path $PSScriptRoot 'download.py') --base
    if ($LASTEXITCODE) { throw 'Voice continuity model download failed.' }
}
Write-Host "Ready: $ttsPython"
