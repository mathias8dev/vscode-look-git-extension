$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $Root 'scripts/look-git.ts') @args
exit $LASTEXITCODE
