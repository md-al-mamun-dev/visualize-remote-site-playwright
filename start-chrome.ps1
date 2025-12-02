# Start Chrome with remote debugging enabled
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# Alternative paths to check
$altPaths = @(
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

foreach ($path in $altPaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

Write-Host "Starting Chrome with remote debugging on port 9222..."
Write-Host "Chrome path: $chromePath"

Start-Process $chromePath -ArgumentList "--remote-debugging-port=9222", "--no-first-run", "--no-default-browser-check"

Write-Host "Chrome started! You can now run your Next.js app."
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
