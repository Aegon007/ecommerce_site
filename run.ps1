$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtime = Get-Command node -ErrorAction SilentlyContinue
if ($runtime) {
    $nodeExecutable = $runtime.Source
} else {
    $bundledRuntime = Join-Path $env:APPDATA 'Antigravity\bin\agy-node.cmd'
    if (!(Test-Path -LiteralPath $bundledRuntime)) {
        Write-Error 'Node.js 22.13 or newer is required. Install Node.js, then run this launcher again.'
        exit 1
    }
    $nodeExecutable = $bundledRuntime
}
$versionText = (& $nodeExecutable --version | Select-Object -Last 1).Trim()
if ([version]($versionText.TrimStart('v').Split('-')[0]) -lt [version]'22.13.0') {
    Write-Error "Node.js 22.13 or newer is required. Found $versionText."
    exit 1
}
$portText = & $nodeExecutable -e "require('./src/config'); console.log(process.env.PORT || '3000')"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$storeUrl = "http://localhost:$($portText.Trim())"
Write-Host "Apex Goods - $storeUrl" -ForegroundColor Green
Write-Host 'Demo checkout only. No payments will be taken.' -ForegroundColor Yellow
$browserJob = Start-Job -ArgumentList $storeUrl -ScriptBlock {
    param($url)
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        try {
            $health = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 1
            if ($health.StatusCode -eq 200) { Start-Process $url; return }
        } catch { Start-Sleep -Milliseconds 500 }
    }
}
try { & $nodeExecutable src/server.js; $serverExitCode = $LASTEXITCODE }
finally { Stop-Job $browserJob -ErrorAction SilentlyContinue; Remove-Job $browserJob -Force -ErrorAction SilentlyContinue }
exit $serverExitCode
