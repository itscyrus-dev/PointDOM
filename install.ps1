param(
  [ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [ValidatePattern('^[a-f0-9]{64}$')][string]$Challenge
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($env:OS -ne 'Windows_NT') { throw 'This command requires Windows 10 or later.' }
if ([bool]$ExtensionId -ne [bool]$Challenge) { throw 'Copy the complete connection command from PointDOM.' }
$base = Join-Path $env:LOCALAPPDATA 'PointDOM'
$launcher = Join-Path $HOME '.local\bin\pdo.cmd'
$release = 'https://github.com/itscyrus-dev/PointDOM/releases/latest/download'
if ($env:POINTDOM_RELEASE_BASE_URL) { $release = $env:POINTDOM_RELEASE_BASE_URL }

function Connect-Browser {
  if (!$ExtensionId) { return }
  $output = & $launcher status --json 2>$null
  if ($LASTEXITCODE -ne 0) {
    & $launcher start *> $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      $output = & $launcher status --json 2>$null
      if ($LASTEXITCODE -eq 0) { break }
    }
  }
  try { $status = ($output -join "`n") | ConvertFrom-Json } catch { throw 'Update PointDOM for automatic connection, or use Advanced: manual pairing.' }
  if ($LASTEXITCODE -ne 0 -or !$status.bootstrap) { throw 'The existing service is unavailable or needs an update. Existing data was preserved.' }
  & $launcher pair --extension-id $ExtensionId --challenge $Challenge
  if ($LASTEXITCODE -ne 0) { throw 'Browser authorization failed. Copy a new command from the extension.' }
  Write-Host "`nReturn to PointDOM. The extension connects automatically." -ForegroundColor Green
}
function Get-Download([string]$url, [string]$destination) {
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destination -TimeoutSec 120
}
function Test-Checksum([string]$path, [string]$name, [string]$sums) {
  $match = [regex]::Match((Get-Content -Raw $sums), '(?m)^([a-fA-F0-9]{64})\s+' + [regex]::Escape($name) + '\r?$')
  if (!$match.Success -or (Get-FileHash -Algorithm SHA256 $path).Hash -ine $match.Groups[1].Value) { throw 'Checksum mismatch. Nothing was installed.' }
}
if (Test-Path -LiteralPath $launcher) {
  Connect-Browser
  if (!$ExtensionId) { Write-Host 'PointDOM is already installed. Run pdo status to check it.' }
  return
}
$cpu = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($cpu -notin @('x64','arm64')) { throw 'PointDOM supports Windows x64 and ARM64.' }
New-Item -ItemType Directory -Force $base | Out-Null
$staging = Join-Path $base ('.install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $staging | Out-Null
try {
  Write-Host "`nPointDOM - Installing local service" -ForegroundColor Cyan
  Get-Download "$release/pointdom.tar.gz" "$staging\pointdom.tar.gz"
  Get-Download "$release/SHA256SUMS" "$staging\SHA256SUMS"
  Test-Checksum "$staging\pointdom.tar.gz" 'pointdom.tar.gz' "$staging\SHA256SUMS"
  $files = & tar.exe -tzf "$staging\pointdom.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the application archive.' }
  foreach ($file in $files) {
    if ($file -notmatch '^pointdom/' -or $file -match '(^|/)\.\.(/|$)|\\|:') { throw 'Invalid paths in the package.' }
  }
  & tar.exe -xzf "$staging\pointdom.tar.gz" -C $staging
  if ($LASTEXITCODE -ne 0) { throw 'Could not extract the application archive.' }
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  $nodeOK = $false
  if ($node) { $nodeVersionText = & $node --version; $nodeOK = $LASTEXITCODE -eq 0 -and $nodeVersionText -match '^v(\d+)\.' -and [int]$Matches[1] -ge 24 }
  if (!$nodeOK) {
    $nodeVersion = 'v24.13.0'
    $archive = "node-$nodeVersion-win-$cpu.zip"
    Get-Download "https://nodejs.org/dist/$nodeVersion/$archive" "$staging\$archive"
    Get-Download "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt" "$staging\node-sums"
    Test-Checksum "$staging\$archive" $archive "$staging\node-sums"
    New-Item -ItemType Directory -Force "$base\runtime" | Out-Null
    Expand-Archive -LiteralPath "$staging\$archive" -DestinationPath "$base\runtime" -Force
    $node = "$base\runtime\node-$nodeVersion-win-$cpu\node.exe"
  }
  $package = Get-Content -Raw "$staging\pointdom\package.json" | ConvertFrom-Json
  if ($package.version -notmatch '^\d+\.\d+\.\d+([+-][a-zA-Z0-9.-]+)?$') { throw 'Invalid package version.' }
  if (!(Test-Path "$staging\pointdom\dist\bridge\main.js") -or !(Test-Path "$staging\pointdom\dist\extension\manifest.json")) { throw 'Incomplete release package.' }
  $versions = Join-Path $base 'versions'
  New-Item -ItemType Directory -Force $versions | Out-Null
  $app = Join-Path $versions ($package.version + '-' + [guid]::NewGuid().ToString('N'))
  Move-Item -LiteralPath "$staging\pointdom" -Destination $app
  & $node "$app\dist\bridge\main.js" install --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Service setup did not complete. Local files were preserved for recovery.' }
  $bin = Join-Path $HOME '.local\bin'
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($env:POINTDOM_SKIP_PATH -ne '1' -and $bin -notin ($userPath -split ';')) { [Environment]::SetEnvironmentVariable('Path', ($bin + ';' + $userPath), 'User') }
  $env:Path = "$bin;$env:Path"
  Connect-Browser
  if (!$ExtensionId) { Write-Host 'PointDOM is ready. Open the extension to connect.' -ForegroundColor Green }
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}
