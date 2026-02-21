# OpenVINO Export Runner
# Activates venv and runs Depth Pro + SAM 2.1 exports to FP16 OpenVINO IR
# Output: openvino_models/depth_pro/, openvino_models/sam2_tiny/
# Optional: set $env:ML_OPENVINO_DIR for custom output path

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Ensure exports land in ml_service by default (matches model_registry)
if (-not $env:ML_OPENVINO_DIR) {
    $env:ML_OPENVINO_DIR = Join-Path $ScriptDir "openvino_models"
}

# Find and activate venv (Force using the new Python 3.11 venv in ml_service)
$venvPath = Join-Path $ScriptDir "venv"

$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
if (-not (Test-Path $activateScript)) {
    Write-Host "ERROR: venv not found. Expected at: $venvPath" -ForegroundColor Red
    exit 1
}

Write-Host "Activating venv: $venvPath" -ForegroundColor Cyan
. $activateScript

Set-Location $ScriptDir

Write-Host "`n--- Exporting Depth Pro to OpenVINO FP16 ---" -ForegroundColor Green
python export_openvino_custom.py --depth
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n--- Exporting SAM 2.1 to OpenVINO FP16 ---" -ForegroundColor Green
python export_openvino_custom.py --sam
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nAll exports completed successfully." -ForegroundColor Green
Pause
