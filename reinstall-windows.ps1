# Run this in PowerShell to reinstall packages for Windows

Write-Host "Cleaning and reinstalling packages for Windows..."

# Backend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install

# Frontend
cd client
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
cd ..

Write-Host "Done! Packages reinstalled for Windows."
