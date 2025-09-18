# Usage: start ngrok first (ngrok http 8000), then run this script.
$resp = Invoke-RestMethod http://127.0.0.1:4040/api/tunnels
$https = ($resp.tunnels | Where-Object { $_.public_url -like "https:*" } | Select-Object -First 1).public_url
if (-not $https) { Write-Error "No https tunnel found. Is ngrok running?"; exit 1 }

$envPath = ".\.env"
"EXPO_PUBLIC_API_URL=$https" | Out-File -FilePath $envPath -Encoding utf8
Write-Host "Updated $envPath to $https"

Write-Host "Restarting Expo is required to pick up the new URL."
