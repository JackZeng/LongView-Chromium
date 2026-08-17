param(
  [Parameter(Mandatory=$true)][string]$SourceDirectory,
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$OutputDirectory = "dist/windows",
  [string]$SigningCertificateThumbprint = $env:WINDOWS_SIGNING_CERT_THUMBPRINT
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$Archive = Join-Path $OutputDirectory "LongView-Chromium-$Version-windows-x64.zip"
if (Test-Path $Archive) { Remove-Item $Archive -Force }

if ($SigningCertificateThumbprint) {
  Get-ChildItem -Path $SourceDirectory -Filter *.exe -Recurse | ForEach-Object {
    & signtool.exe sign /sha1 $SigningCertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for $($_.FullName)" }
  }
} else {
  Write-Warning "No signing thumbprint supplied; producing an unsigned developer package."
}

Compress-Archive -Path (Join-Path $SourceDirectory '*') -DestinationPath $Archive -CompressionLevel Optimal
$Hash = Get-FileHash -Algorithm SHA256 $Archive
"$($Hash.Hash.ToLower())  $([IO.Path]::GetFileName($Archive))" | Set-Content -Encoding ascii "$Archive.sha256"
Write-Output $Archive
