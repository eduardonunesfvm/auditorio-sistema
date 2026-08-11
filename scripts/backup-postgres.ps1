param(
    [string]$DatabaseUrl = $env:DATABASE_PUBLIC_URL,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw "Defina DATABASE_PUBLIC_URL ou informe -DatabaseUrl."
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw "pg_dump nao foi encontrado no PATH. Instale o cliente PostgreSQL."
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outputFile = Join-Path $resolvedOutput "auditorio-$timestamp.dump"

& pg_dump `
    --format=custom `
    --no-owner `
    --no-acl `
    --dbname=$DatabaseUrl `
    --file=$outputFile

if ($LASTEXITCODE -ne 0) {
    throw "pg_dump terminou com codigo $LASTEXITCODE."
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $outputFile
Write-Output "Backup criado: $outputFile"
Write-Output "SHA256: $($hash.Hash)"
