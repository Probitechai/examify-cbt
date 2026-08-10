# apply-auth-fixes.ps1
# Run from: C:\Probitechai\examify
# Usage: powershell -ExecutionPolicy Bypass -File apply-auth-fixes.ps1

$files = @(
  "apps\web\src\app\admin\admissions\page.tsx",
  "apps\web\src\app\admin\analytics\page.tsx",
  "apps\web\src\app\admin\announcements\page.tsx",
  "apps\web\src\app\admin\approvals\page.tsx",
  "apps\web\src\app\admin\attendance\page.tsx",
  "apps\web\src\app\admin\broadsheet\page.tsx",
  "apps\web\src\app\admin\certificates\page.tsx",
  "apps\web\src\app\admin\conduct\page.tsx",
  "apps\web\src\app\admin\curriculum\page.tsx",
  "apps\web\src\app\admin\fees\page.tsx",
  "apps\web\src\app\admin\gradebook\page.tsx",
  "apps\web\src\app\admin\hostel-operations\page.tsx",
  "apps\web\src\app\admin\hostels\page.tsx",
  "apps\web\src\app\admin\learning-paths\page.tsx",
  "apps\web\src\app\admin\lessons\page.tsx",
  "apps\web\src\app\admin\live-classes\page.tsx",
  "apps\web\src\app\admin\results\page.tsx",
  "apps\web\src\app\admin\sessions\page.tsx",
  "apps\web\src\app\admin\settings\page.tsx",
  "apps\web\src\app\admin\subscription\page.tsx",
  "apps\web\src\app\admin\timetable\page.tsx",
  "apps\web\src\app\admin\transport\page.tsx",
  "apps\web\src\app\admin\transport-ops\page.tsx",
  "apps\web\src\app\student\page.tsx",
  "apps\web\src\app\student\lessons\page.tsx",
  "apps\web\src\app\student\live-classes\page.tsx",
  "apps\web\src\app\parent\page.tsx"
)

$adminRole   = "school_admin"
$studentRole = "student"
$parentRole  = "parent"

$importLine  = "import { apiFetch, checkAuth } from '@/lib/auth'"

# The 3 inline functions to remove (as a regex pattern)
$inlineFunctionsPattern = @'
function getToken\(\)[^\}]+\}
[\r\n]+function getSubdomain\(\) \{[\s\S]+?\}
[\r\n]+function hdrs\(\) \{[^\}]+\}
'@

$changed = 0
$skipped = 0

foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    Write-Host "SKIP (not found): $file" -ForegroundColor Yellow
    $skipped++
    continue
  }

  $content = Get-Content $file -Raw -Encoding UTF8

  # Determine role for this file
  if ($file -like "*\student\*") {
    $role = $studentRole
  } elseif ($file -like "*\parent\*") {
    $role = $parentRole
  } else {
    $role = $adminRole
  }

  $checkAuthLine = "useEffect(() => { checkAuth(router, '$role') }, [])`n`n"

  $modified = $content

  # 1. Add import if not already present
  if ($modified -notmatch [regex]::Escape($importLine)) {
    # Insert after the last import line block
    $modified = $modified -replace "('use client'`r?`n)", "`$1$importLine`n"
    # Fallback: insert after first import line if 'use client' not found
    if ($modified -notmatch [regex]::Escape($importLine)) {
      $modified = $modified -replace "(import \{[^}]+\} from '[^']+'`r?`n)", "`$1$importLine`n"
    }
  }

  # 2. Remove the 3 inline functions if present
  $modified = $modified -replace "function getToken\(\) \{[^}]+\}`r?`n", ""
  $modified = $modified -replace "function getSubdomain\(\) \{[\s\S]+?return ''\s*\}`r?`n", ""
  $modified = $modified -replace "function hdrs\(\) \{[^}]+\}`r?`n", ""

  # 3. Add checkAuth useEffect if not already present
  if ($modified -notmatch "checkAuth\(") {
    # Insert before the first useEffect
    $modified = $modified -replace "(  useEffect\()", "$checkAuthLine`$1"
  }

  # 4. Replace fetch() calls that have headers: hdrs() with apiFetch()
  # GET: fetch(`url`, { headers: hdrs() })
  $modified = $modified -replace "await fetch\((`[^`]+`), \{ headers: hdrs\(\) \}\)", "await apiFetch(`$1)"
  # POST/PATCH/DELETE with headers: hdrs() inline
  $modified = $modified -replace ", headers: hdrs\(\),", ","
  $modified = $modified -replace ", headers: hdrs\(\) \}", " }"
  # Replace remaining bare fetch( with apiFetch( only where it has Authorization header pattern
  $modified = $modified -replace "await fetch\((`[^`]+`), \{`r?`n\s+headers: \{`r?`n\s+'Authorization'[^}]+\}`r?`n\s+\}\)", "await apiFetch(`$1)"

  if ($modified -ne $content) {
    Set-Content $file -Value $modified -Encoding UTF8 -NoNewline
    Write-Host "FIXED: $file" -ForegroundColor Green
    $changed++
  } else {
    Write-Host "NO CHANGE: $file" -ForegroundColor Cyan
  }
}

Write-Host ""
Write-Host "Done. $changed files updated, $skipped skipped." -ForegroundColor White
