# ============================================================
# Tree ML Service — Windows 啟動腳本
# ============================================================
# 使用方式:
#   cd backend\ml_service
#   .\start.ps1              # 預設模式 (DA V2 Base)
#   .\start.ps1 -Preset pro  # Depth Pro 模式
#   .\start.ps1 -Verify      # 啟用 numpy 驗證
#   .\start.ps1 -Workers 2   # 多 worker (需較大 RAM)
# ============================================================

param(
    [ValidateSet('default', 'pro', 'openvino')]
    [string]$Preset = 'default',

    [switch]$Verify,
    [switch]$Debug,
    [int]$Workers = 1,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir '.env'

# --- 載入 .env ---
if (Test-Path $EnvFile) {
    Write-Host "[config] Loading $EnvFile" -ForegroundColor DarkGray
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $parts = $line -split '=', 2
            if ($parts.Count -eq 2 -and $parts[0].Trim() -and $parts[1].Trim()) {
                [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
            }
        }
    }
}

# --- 依 Preset 設定模型 ---
switch ($Preset) {
    'pro' {
        $env:ML_DEPTH_MODEL = 'depth_pro'
        $env:ML_USE_OPENVINO = 'false'
        Write-Host "`n  Model: Depth Pro (higher accuracy, slower)" -ForegroundColor Cyan
    }
    'openvino' {
        $env:ML_DEPTH_MODEL = 'da_v2_base'
        $env:ML_USE_OPENVINO = 'true'
        Write-Host "`n  Model: DA V2 + OpenVINO iGPU acceleration" -ForegroundColor Cyan
    }
    default {
        if (-not $env:ML_DEPTH_MODEL) { $env:ML_DEPTH_MODEL = 'da_v2_base' }
        if (-not $env:ML_USE_OPENVINO) { $env:ML_USE_OPENVINO = 'false' }
        Write-Host "`n  Model: $($env:ML_DEPTH_MODEL) (default)" -ForegroundColor Cyan
    }
}

# --- Port ---
if ($Port -gt 0) {
    $env:PORT = "$Port"
} elseif (-not $env:PORT) {
    $env:PORT = '8100'
}

# --- Optional flags ---
if (-not $env:ML_ENABLE_SAM)   { $env:ML_ENABLE_SAM = 'true' }
if (-not $env:ML_SEG_MODEL)    { $env:ML_SEG_MODEL = 'sam2_tiny' }

if ($Verify) {
    $env:ML_VERIFY_NUMPY = 'true'
    Write-Host "  Numpy verify: ON" -ForegroundColor Yellow
}

if ($Debug) {
    $env:ML_DEBUG = 'true'
    Write-Host "  Debug (/docs): ON" -ForegroundColor Yellow
}

# --- 安全檢查 ---
if (-not $env:ML_API_KEY) {
    Write-Host "`n  WARNING: ML_API_KEY not set — endpoints are unprotected!" -ForegroundColor Red
    Write-Host "  Set it in .env or run: `$env:ML_API_KEY='your-key'" -ForegroundColor DarkGray
}

# --- 摘要 ---
Write-Host ""
Write-Host "  ========================================" -ForegroundColor DarkCyan
Write-Host "  Tree ML Service" -ForegroundColor White
Write-Host "  ----------------------------------------" -ForegroundColor DarkCyan
Write-Host "  Port:      $($env:PORT)" -ForegroundColor White
Write-Host "  Model:     $($env:ML_DEPTH_MODEL)" -ForegroundColor White
Write-Host "  OpenVINO:  $($env:ML_USE_OPENVINO)" -ForegroundColor White
Write-Host "  SAM:       $($env:ML_ENABLE_SAM) ($($env:ML_SEG_MODEL))" -ForegroundColor White
Write-Host "  API Key:   $(if ($env:ML_API_KEY) { $env:ML_API_KEY.Substring(0,8) + '...' } else { 'NOT SET' })" -ForegroundColor $(if ($env:ML_API_KEY) { 'White' } else { 'Red' })
Write-Host "  Workers:   $Workers" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkCyan
Write-Host ""

# --- 啟動 ---
Set-Location $ScriptDir
python -m uvicorn app:app --host 0.0.0.0 --port $env:PORT --workers $Workers
