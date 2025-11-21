# PowerShell script for Windows users

Write-Host "🧹 Cleaning MDVR Platform..." -ForegroundColor Cyan

# Remove node_modules and lock files
Write-Host "Removing node_modules and lock files..." -ForegroundColor Yellow
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "pnpm-lock.yaml" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "yarn.lock" -Force -ErrorAction SilentlyContinue

# Remove service node_modules
Write-Host "Cleaning service directories..." -ForegroundColor Yellow
Get-ChildItem -Path "services" -Directory | ForEach-Object {
    Remove-Item -Path "$($_.FullName)\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -Path "mobile\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path "tools" -Directory | ForEach-Object {
    Remove-Item -Path "$($_.FullName)\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}

# Clear pnpm cache
Write-Host "Clearing pnpm cache..." -ForegroundColor Yellow
pnpm store prune

Write-Host ""
Write-Host "✅ Cleanup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
pnpm install

Write-Host ""
Write-Host "🎉 Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Run 'pnpm dev' to start the development server" -ForegroundColor Cyan
