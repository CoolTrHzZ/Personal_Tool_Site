param([Parameter(ValueFromRemainingArguments = $true)][string[]]$DeployArgs)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22+ (including npm) and Git, then retry.' }
$deployTemp = $null
try {
    $script = if ($MyInvocation.MyCommand.CommandType -eq 'ExternalScript') { Join-Path $PSScriptRoot 'deploy.mjs' } else { '' }
    if (-not $script -or -not (Test-Path -LiteralPath $script)) {
        $deployTemp = Join-Path ([IO.Path]::GetTempPath()) ('devos-install-' + [guid]::NewGuid())
        New-Item -ItemType Directory -Path $deployTemp | Out-Null
        $script = Join-Path $deployTemp 'deploy.mjs'
        Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/CoolTrHzZ/Personal_Tool_Site/main/deploy.mjs' -OutFile $script
    }
    & node $script @DeployArgs
    if ($LASTEXITCODE -ne 0) { throw "Deployment failed (exit code $LASTEXITCODE). See the output above." }
} finally {
    if ($deployTemp) { Remove-Item -LiteralPath $deployTemp -Recurse -Force }
}
