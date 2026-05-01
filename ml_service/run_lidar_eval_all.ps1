# run_lidar_eval_all.ps1
# Runs lidar_gt_eval.py for every depth model.
# Designed to be started AFTER the overnight benchmark matrix completes
# (otherwise the GPU will be busy).
#
# Usage:
#   .\run_lidar_eval_all.ps1                # all 6 models, GPU
#   .\run_lidar_eval_all.ps1 -Limit 5       # smoke test with 5 imgs each
#   .\run_lidar_eval_all.ps1 -Models @('da_v2_small') -Device CPU

param(
    [string[]]$Models = @('da_v2_small','da_v2_base','da_v2_large',
                          'depth_pro','unidepth_v2_l','da3_metric_large'),
    [int]$Limit       = 0,
    [string]$OutDir   = 'lidar_eval',
    [string]$Device   = 'GPU'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# OpenVINO works for DA-V2 + Depth Pro; not for unidepth/da3
$ovEnabledFor   = @('da_v2_small','da_v2_base','da_v2_large','depth_pro')

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory $OutDir | Out-Null }

foreach ($model in $Models) {
    Write-Host ""
    Write-Host "==============================================================" -ForegroundColor Cyan
    Write-Host " LIDAR-GT EVAL: $model" -ForegroundColor Cyan
    Write-Host "==============================================================" -ForegroundColor Cyan

    if ($ovEnabledFor -contains $model) {
        $env:ML_USE_OPENVINO = 'true'
        $env:ML_OV_DEVICE    = $Device
    } else {
        $env:ML_USE_OPENVINO = 'false'
        Remove-Item Env:\ML_OV_DEVICE -ErrorAction SilentlyContinue
    }

    $out  = Join-Path $OutDir "$model.csv"
    $args = @('lidar_gt_eval.py', '--model', $model, '--out', $out)
    if ($Limit -gt 0) { $args += @('--limit', $Limit) }

    & .\venv\Scripts\python.exe @args
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "lidar_gt_eval.py failed for $model (exit=$LASTEXITCODE)"
    }
}

Write-Host ""
Write-Host "[lidar-eval] All models done. CSVs in $OutDir/" -ForegroundColor Green
