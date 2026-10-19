# Runs Hiraman on an Android phone plugged in by USB.
# No Wi-Fi, IP address or firewall setup: the phone reaches this computer's server
# through the USB cable (adb reverse), as http://localhost:4000.
# Start it by double-clicking app\run-phone.cmd.

$port = 4000
$app = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $app

function Step($n, $text) { Write-Host ''; Write-Host "[$n/4] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "      OK  $text" -ForegroundColor Green }
function Info($text) { Write-Host "      $text" -ForegroundColor Gray }
function Fail($text) { Write-Host ''; Write-Host "  PROBLEM: $text" -ForegroundColor Red; exit 1 }

function ServerUp {
  try { return (Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 }
  catch { return $false }
}

# Find adb (comes with the Android SDK that Flutter uses).
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  foreach ($sdk in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) {
    if ($sdk -and (Test-Path "$sdk\platform-tools\adb.exe")) { $adb = "$sdk\platform-tools\adb.exe"; break }
  }
}
if (-not $adb) { Fail 'adb was not found. Run "flutter doctor" and install the Android SDK it asks for.' }

Write-Host ''
Write-Host '  Hiraman: run on my phone' -ForegroundColor White

# 1. Server
Step 1 'Hiraman server'
if (ServerUp) {
  Ok "Already running on port $port."
} else {
  Info 'Not running. Starting it in a new window (keep that window open)...'
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\server'; npm start"
  $waited = 0
  while (-not (ServerUp) -and $waited -lt 40) { Start-Sleep -Seconds 2; $waited += 2 }
  if (-not (ServerUp)) { Fail 'The server did not start. Look at the server window for the error (often the database settings in server\.env).' }
  Ok 'Started.'
}

# 2. Phone
Step 2 'Phone connected by USB'
& $adb start-server *> $null
$serial = $null
$shownHelp = $false
$shownAuth = $false
$waited = 0
while (-not $serial -and $waited -lt 180) {
  $rows = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\S' } | ForEach-Object {
    $p = $_ -split '\s+'; [pscustomobject]@{ Serial = $p[0]; State = $p[1] }
  }
  $phones = @($rows | Where-Object { $_.Serial -notlike 'emulator-*' })
  $ready = @($phones | Where-Object { $_.State -eq 'device' })
  if ($ready.Count -gt 0) {
    $serial = $ready[0].Serial
    break
  }
  if (@($phones | Where-Object { $_.State -eq 'unauthorized' }).Count -gt 0) {
    if (-not $shownAuth) {
      Info 'Phone found, but it has not allowed this computer yet.'
      Info 'Unlock the phone and tap ALLOW on "Allow USB debugging?" (tick "Always allow").'
      $shownAuth = $true
    }
  } elseif (-not $shownHelp) {
    Info 'Waiting for your phone... Check that:'
    Info '  - the phone is unlocked and plugged in with a DATA cable'
    Info '  - Developer options > USB debugging is ON'
    Info '  - the USB notification on the phone is set to "File transfer"'
    $shownHelp = $true
  }
  Start-Sleep -Seconds 2
  $waited += 2
}
if (-not $serial) { Fail 'No phone found after 3 minutes. See "If it does not work" in the guide, then run this again.' }
$model = (& $adb -s $serial shell getprop ro.product.model 2>$null | Out-String).Trim()
Ok "Found $model ($serial)."

# 3. Tunnel the server port through the cable
Step 3 'Connecting the phone to the server through the cable'
& $adb -s $serial reverse "tcp:$port" "tcp:$port" *> $null
$list = (& $adb -s $serial reverse --list | Out-String)
if ($list -notmatch "tcp:$port") { Fail 'Could not set up the USB connection. Unplug the phone, plug it back in, and run this again.' }
Ok "The phone now reaches the server at http://localhost:$port"
$wifi = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
if ($wifi) { Info "To use Wi-Fi instead of the cable later, set the app's server to  http://${wifi}:$port" }

# 4. Build, install and open the app
Step 4 'Installing and opening Hiraman on the phone'
Info 'The first time takes 3-10 minutes. Later runs take under a minute.'
Info 'When it is running, press  r = reload,  R = restart,  q = quit.'
Write-Host ''
Set-Location $app
flutter run -d $serial --dart-define=HIRAMAN_SERVER=http://localhost:$port
