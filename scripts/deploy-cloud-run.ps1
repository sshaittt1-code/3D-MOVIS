param(
  [string]$ProjectId = "artful-fragment-490414-g6",
  [string]$Region = "europe-west1",
  [string]$ServiceName = "holocinema-api"
)

$gcloud = "C:\Users\Shai7\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$envFile = Join-Path $PSScriptRoot "..\cloudrun.env.yaml"

if (-not (Test-Path $gcloud)) {
  throw "gcloud.cmd was not found at $gcloud"
}

if (-not (Test-Path $envFile)) {
  throw "Missing cloudrun.env.yaml. Copy cloudrun.env.yaml.example and fill in your real secrets first."
}

& $gcloud run deploy $ServiceName `
  --source . `
  --project $ProjectId `
  --region $Region `
  --allow-unauthenticated `
  --env-vars-file $envFile
