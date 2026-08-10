# verify-fetch.ps1
# Checks which files still have bare fetch() calls with hdrs()
# Run from: C:\Probitechai\examify

$files = Get-ChildItem -Path "apps\web\src\app\admin","apps\web\src\app\student","apps\web\src\app\parent" -Recurse -Filter "page.tsx" | Select-Object -ExpandProperty FullName

Write-Host "Files still containing fetch() with hdrs():" -ForegroundColor Yellow
Write-Host ""

$found = 0
foreach ($file in $files) {
  $content = Get-Content $file -Raw
  if ($content -match "headers:\s*hdrs\(\)") {
    $short = $file -replace ".*\\apps\\web\\src\\app\\", ""
    Write-Host "  NEEDS FIX: $short" -ForegroundColor Red
    $found++
  }
}

if ($found -eq 0) {
  Write-Host "  All clean! No bare fetch() calls remain." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "$found files still need fetch() replaced." -ForegroundColor Red
}

Write-Host ""
Write-Host "Files missing apiFetch import:" -ForegroundColor Yellow
$missing = 0
foreach ($file in $files) {
  $content = Get-Content $file -Raw
  if ($content -notmatch "from '@/lib/auth'") {
    $short = $file -replace ".*\\apps\\web\\src\\app\\", ""
    Write-Host "  MISSING IMPORT: $short" -ForegroundColor Red
    $missing++
  }
}
if ($missing -eq 0) {
  Write-Host "  All files have the import." -ForegroundColor Green
}

Write-Host ""
Write-Host "Files missing checkAuth:" -ForegroundColor Yellow
$nocheck = 0
foreach ($file in $files) {
  $content = Get-Content $file -Raw
  if ($content -notmatch "checkAuth") {
    $short = $file -replace ".*\\apps\\web\\src\\app\\", ""
    Write-Host "  MISSING checkAuth: $short" -ForegroundColor Red
    $nocheck++
  }
}
if ($nocheck -eq 0) {
  Write-Host "  All files have checkAuth." -ForegroundColor Green
}
