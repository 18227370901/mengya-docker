# ============================================================
# 萌芽（mengya）平台 - Windows 本地服务管理脚本 (mengya-local)
#
# 支持命令：
#   .\run.ps1 start      启动本地前后端服务
#   .\run.ps1 stop       停止本地前后端服务
#   .\run.ps1 restart    重启本地前后端服务
#   .\run.ps1 status     查看运行状态与端口占用
#   .\run.ps1 help       查看帮助
# ============================================================

param (
    [Parameter(Position = 0)]
    [string]$Command = 'help'
)

$SCRIPT_DIR = $PSScriptRoot
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = (Get-Location).Path }

# 载入 .env 配置
$envFile = Join-Path $SCRIPT_DIR '.env'
if (Test-Path -LiteralPath $envFile) {
    foreach ($rawLine in (Get-Content -LiteralPath $envFile -Encoding UTF8)) {
        $trimmed = $rawLine.Trim()
        if ($trimmed -match '^([A-Za-z0-9_]+)=(.*)$' -and -not $trimmed.StartsWith('#')) {
            $k = $matches[1]
            $v = $matches[2].Trim('"', "'")
            Set-Item -Path ("env:" + $k) -Value $v
        }
    }
}
$DB_MODE = if ($env:DB_MODE) { $env:DB_MODE } else { 'sqlite' }

$FRONTEND_PORT = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } elseif ($env:PORT) { [int]$env:PORT } else { 5173 }
$BACKEND_PORT = $FRONTEND_PORT
$ADMIN_USERNAME = if ($env:ADMIN_USERNAME) { $env:ADMIN_USERNAME } else { 'admin' }
$ADMIN_PASSWORD = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { 'admin123' }
$ADMIN_NICKNAME = if ($env:ADMIN_NICKNAME) { $env:ADMIN_NICKNAME } else { '管理员' }

$LOG_DIR = Join-Path $SCRIPT_DIR 'logs'
if (-not (Test-Path -LiteralPath $LOG_DIR)) {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}

$BACKEND_PID_FILE = Join-Path $LOG_DIR 'backend.pid'
$FRONTEND_PID_FILE = Join-Path $LOG_DIR 'frontend.pid'

function Test-PortInUse([int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(800, $false)
        if ($success -and $client.Connected) {
            $client.EndConnect($iar)
            $client.Close()
            return $true
        }
        $client.Close()
    } catch {}
    return $false
}

function Get-PortPids([int]$Port) {
    $pids = @()
    try {
        $lines = netstat -ano | Select-String ":$Port\s+.*LISTENING"
        foreach ($line in $lines) {
            if ($line.Line -match '\s+(\d+)$') {
                $foundPid = [int]$matches[1]
                if ($foundPid -gt 0 -and $pids -notcontains $foundPid) {
                    $pids += $foundPid
                }
            }
        }
    } catch {}
    return $pids
}

function Stop-ByPidFile([string]$PidFile, [string]$ServiceName, [int]$Port) {
    $stopped = $false

    # 1. 停止记录在 PID 文件的进程
    if (Test-Path -LiteralPath $PidFile) {
        $pidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Out-String).Trim()
        if ($pidText -match '^[0-9]+$') {
            $targetPid = [int]$pidText
            try {
                $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host ('  ==> 停止 ' + $ServiceName + ' (PID: ' + $targetPid + ')') -ForegroundColor Yellow
                    Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
                    $stopped = $true
                }
            } catch {}
        }
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }

    # 2. 清理占用该端口的所有进程
    $portPids = Get-PortPids -Port $Port
    foreach ($p in $portPids) {
        Write-Host ('  ==> 释放占用端口 ' + $Port + ' 的进程 (PID: ' + $p + ')') -ForegroundColor Yellow
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }

    # 3. 循环等待端口释放（最多 5 秒）
    $waited = 0
    while ((Test-PortInUse -Port $Port) -and $waited -lt 10) {
        Start-Sleep -Milliseconds 500
        $waited++
    }

    if ($stopped) {
        Write-Host ('  ' + $ServiceName + ' 已停止') -ForegroundColor Green
    } else {
        Write-Host ('  ' + $ServiceName + ' 未在运行') -ForegroundColor Gray
    }
}

function Start-BackendService {
    Write-Host ('==> 启动 Django 一体化服务（端口 ' + $FRONTEND_PORT + '，本地模式）') -ForegroundColor Cyan

    # 若端口仍被占用，主动释放
    if (Test-PortInUse -Port $FRONTEND_PORT) {
        Write-Host ('  [清理] 端口 ' + $FRONTEND_PORT + ' 已被占用，正在释放占用进程...') -ForegroundColor Yellow
        $portPids = Get-PortPids -Port $FRONTEND_PORT
        foreach ($p in $portPids) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 800
    }

    $venvPy = Join-Path $SCRIPT_DIR '.venv\Scripts\python.exe'
    $pyCmd = if (Test-Path -LiteralPath $venvPy) { $venvPy } else { 'python' }
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONUTF8 = '1'

    Push-Location $SCRIPT_DIR
    try {
        # 静态资源自愈：检测 static/fetal-stories，缺失时自动从 frontend/public/fetal-stories 同步
        $staticFetalDir = Join-Path $SCRIPT_DIR 'static\fetal-stories'
        $publicFetalDir = Join-Path $SCRIPT_DIR 'frontend\public\fetal-stories'
        if ((-not (Test-Path -LiteralPath $staticFetalDir)) -and (Test-Path -LiteralPath $publicFetalDir)) {
            Write-Host '  [自愈] 自动同步胎教故事静态产物至 static/fetal-stories...' -ForegroundColor Cyan
            $staticDir = Join-Path $SCRIPT_DIR 'static'
            if (-not (Test-Path -LiteralPath $staticDir)) {
                New-Item -ItemType Directory -Path $staticDir -Force | Out-Null
            }
            Copy-Item -LiteralPath $publicFetalDir -Destination $staticFetalDir -Recurse -Force | Out-Null
        }

        Write-Host '  执行数据迁移...'
        & $pyCmd manage.py migrate --noinput | Out-Null
        Write-Host '  初始化种子数据...'
        & $pyCmd manage.py init_data --skip-if-exists | Out-Null
        & $pyCmd manage.py init_fetal_stories --skip-if-exists | Out-Null

        Write-Host ('  同步单一管理员账号 (' + $ADMIN_USERNAME + ')...')
        $env:ADMIN_USERNAME = $ADMIN_USERNAME
        $env:ADMIN_PASSWORD = $ADMIN_PASSWORD
        $env:ADMIN_NICKNAME = $ADMIN_NICKNAME

        $venvCa = Join-Path $SCRIPT_DIR '.venv\Lib\site-packages\certifi\cacert.pem'
        if (Test-Path -LiteralPath $venvCa) {
            $env:SSL_CERT_FILE = $venvCa
            $env:REQUESTS_CA_BUNDLE = $venvCa
            $env:CURL_CA_BUNDLE = $venvCa
        }
        & $pyCmd manage.py ensure_admin | Out-Null

        Write-Host "  [会话安全] 注销所有活跃登录会话，强制客户端重新登录..."
        & $pyCmd manage.py invalidate_tokens | Out-Null

        $stdoutLog = Join-Path $LOG_DIR 'backend.log'
        $stderrLog = Join-Path $LOG_DIR 'backend.err.log'

        $bp = Start-Process -FilePath $pyCmd `
            -ArgumentList 'manage.py', 'runserver', ('127.0.0.1:' + $FRONTEND_PORT), '--noreload' `
            -WorkingDirectory $SCRIPT_DIR `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -WindowStyle Hidden `
            -PassThru

        $bp.Id | Out-File -FilePath $BACKEND_PID_FILE -Encoding ascii
        Write-Host ('  一体化服务启动中 (PID: ' + $bp.Id + ')...') -ForegroundColor Green

        # 健康探针：循环等待端口 $FRONTEND_PORT 成功监听
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            if (Test-PortInUse -Port $FRONTEND_PORT) {
                $ready = $true
                break
            }
            $proc = Get-Process -Id $bp.Id -ErrorAction SilentlyContinue
            if ($null -eq $proc) {
                Write-Host '  [错误] 服务进程异常退出，错误日志：' -ForegroundColor Red
                Get-Content $stderrLog -Tail 15 -ErrorAction SilentlyContinue
                break
            }
            Start-Sleep -Milliseconds 500
        }

        if ($ready) {
            Write-Host ('  Django 一体化服务已就绪 (端口 ' + $FRONTEND_PORT + ')') -ForegroundColor Green
        } else {
            Write-Host ('  [警告] 一体化服务尚未监听端口 ' + $FRONTEND_PORT + '，请检查日志') -ForegroundColor Yellow
        }
    } finally {
        Pop-Location
    }
}

function Start-FrontendService {
    # 前端静态产物已合并至 Django (templates/ & static/)，零 Node.js 进程常驻
}

function Show-Status {
    Write-Host '============================================' -ForegroundColor Cyan
    Write-Host '  萌芽（mengya-local）本地运行状态' -ForegroundColor Cyan
    Write-Host '============================================' -ForegroundColor Cyan

    $bInUse = Test-PortInUse -Port $FRONTEND_PORT
    $bPid = if (Test-Path -LiteralPath $BACKEND_PID_FILE) { (Get-Content $BACKEND_PID_FILE).Trim() } else { '' }
    $bStatus = if ($bInUse) { ('运行中 (PID: ' + $bPid + ', 端口 ' + $FRONTEND_PORT + ')') } else { '未运行' }

    Write-Host ('  一体化服务 : ' + $bStatus)
    Write-Host ('  数据库模式 : ' + $DB_MODE + ' [与 Docker 版 100% 物理隔离]')
    if ($DB_MODE -eq 'sqlite') {
        Write-Host ('  数据库文件 : ' + (Join-Path $SCRIPT_DIR 'db.sqlite3'))
    } else {
        Write-Host ('  数据库连接 : ' + $env:DATABASE_URL)
    }
    Write-Host ('  架构模式   : Django 统一托管前端 SPA、静态资源与后端 API，彻底移除 Node.js 常驻')
    Write-Host ('  访问地址   : http://localhost:' + $FRONTEND_PORT + '/')
    Write-Host ('  日志目录   : ' + $LOG_DIR)
    Write-Host '============================================' -ForegroundColor Cyan
}

switch ($Command.ToLower()) {
    'start' {
        Start-BackendService
        Start-Sleep -Seconds 1
        Write-Host ''
        Write-Host '============================================' -ForegroundColor Green
        Write-Host '  萌芽（mengya-local）启动完成！' -ForegroundColor Green
        Write-Host ('  访问地址: http://localhost:' + $FRONTEND_PORT + '/') -ForegroundColor Yellow
        Write-Host ('  管理员账号: ' + $ADMIN_USERNAME + ' / ' + $ADMIN_PASSWORD) -ForegroundColor Yellow
        Write-Host '  一体化说明: 前端静态产物已合并至 Django，零 Node.js 进程常驻，内存开销大幅降低'
        Write-Host '============================================' -ForegroundColor Green
    }
    'stop' {
        Write-Host '==> 停止本地服务' -ForegroundColor Yellow
        Stop-ByPidFile -PidFile $BACKEND_PID_FILE -ServiceName 'Django 一体化服务' -Port $FRONTEND_PORT
        if (Test-Path -LiteralPath $FRONTEND_PID_FILE) {
            Remove-Item -LiteralPath $FRONTEND_PID_FILE -Force -ErrorAction SilentlyContinue
        }
        Write-Host '  本地服务停止操作完成' -ForegroundColor Green
    }
    'restart' {
        $scriptPath = Join-Path $SCRIPT_DIR 'run.ps1'
        & $scriptPath stop
        Start-Sleep -Seconds 1
        & $scriptPath start
    }
    'status' {
        Show-Status
    }
    default {
        Write-Host ''
        Write-Host '萌芽（mengya-local）本地模式管理命令：' -ForegroundColor Cyan
        Write-Host '  .\run.ps1 start      启动前后端本地服务'
        Write-Host '  .\run.ps1 stop       停止本地前后端服务'
        Write-Host '  .\run.ps1 restart    重启本地前后端服务'
        Write-Host '  .\run.ps1 status     查看运行状态'
        Write-Host '  .\run.ps1 help       查看帮助'
        Write-Host ''
    }
}
