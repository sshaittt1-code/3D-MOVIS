param(
  [string]$ProjectId = "artful-fragment-490414-g6",
  [string]$Region = "europe-west1",
  [string]$ServiceName = "holocinema-api"
)

$gcloud = "C:\Users\Shai7\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$envFile = Join-Path $PSScriptRoot "..\cloudrun.env.yaml"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stagingRoot = Join-Path $env:TEMP "holocinema-cloudrun-source"
$apkSource = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
$apkTarget = Join-Path $stagingRoot "android\app\build\outputs\apk\debug\app-debug.apk"

if (-not (Test-Path $gcloud)) {
  throw "gcloud.cmd was not found at $gcloud"
}

if (-not (Test-Path $envFile)) {
  throw "Missing cloudrun.env.yaml. Copy cloudrun.env.yaml.example and fill in your real secrets first."
}

if (Test-Path $stagingRoot) {
  Remove-Item $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingRoot | Out-Null

$excludedDirs = @(
  ".git",
  ".github",
  ".idea",
  ".kiro",
  ".vscode",
  "android",
  "dist",
  "docs",
  "Gradient gallery page (1)",
  "node_modules"
)

$excludedFiles = @(
  "1,369.93",
  ".dockerignore",
  ".env",
  "cloudrun.env.yaml",
  "Dockerfile",
  "kB",
  "progress.md",
  "task.md",
  "tg_session.txt"
)
$excludedFiles += [string][char]0x2502

$robocopyArgs = @(
  $repoRoot,
  $stagingRoot,
  "/MIR",
  "/XD"
) + $excludedDirs + @(
  "/XF"
) + $excludedFiles

robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Robocopy failed while preparing Cloud Run staging source."
}

if (Test-Path $apkSource) {
  New-Item -ItemType Directory -Path (Split-Path $apkTarget -Parent) -Force | Out-Null
  Copy-Item $apkSource $apkTarget -Force
}

try {
  & $gcloud run deploy $ServiceName `
    --source $stagingRoot `
    --project $ProjectId `
    --region $Region `
    --allow-unauthenticated `
    --env-vars-file $envFile
}
finally {
  if (Test-Path $stagingRoot) {
    Remove-Item $stagingRoot -Recurse -Force
  }
}
