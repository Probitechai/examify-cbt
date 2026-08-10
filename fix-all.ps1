# fix-all.ps1 — compatible with PowerShell 2.0+
# Run from C:\Probitechai\examify
# Usage: powershell -ExecutionPolicy Bypass -File fix-all.ps1

$importLine = "import { apiFetch, checkAuth } from '@/lib/auth'"

$allPages = Get-ChildItem -Path "apps\web\src\app\admin","apps\web\src\app\student","apps\web\src\app\parent" -Recurse -Filter "page.tsx" | Select-Object -ExpandProperty FullName

$changed = 0

foreach ($file in $allPages) {
  $lines = Get-Content $file
  if ($lines -eq $null) { continue }

  $content = [string]::Join("`n", $lines)

  $original = $content
  $role = "school_admin"
  if ($file -match "\\student\\") { $role = "student" }
  if ($file -match "\\parent\\")  { $role = "parent" }

  # 1. Add import after 'use client' if missing
  if ($content -notmatch [regex]::Escape($importLine)) {
    $content = $content -replace "('use client')", "`$1`n$importLine"
  }

  # 2. Add checkAuth useEffect if missing
  if ($content -notmatch "checkAuth\(") {
    $check = "  useEffect(() => { checkAuth(router, '$role') }, [])`n`n  useEffect"
    $content = $content -replace "  useEffect", $check
    # Only do the first replacement
    $content = $content -replace "  useEffect(() => { checkAuth\(router, '$role'\) }, \[\])`n`n  useEffect(() => { checkAuth\(router, '$role'\) }, \[\])`n`n  useEffect", "  useEffect(() => { checkAuth(router, '$role') }, [])`n`n  useEffect"
  }

  # 3. Remove the 3 inline functions
  # getToken
  $content = [regex]::Replace($content, "function getToken\(\) \{[^}]+\}\r?\n?", "")
  # getSubdomain (spans multiple lines, use [\s\S] carefully)
  $content = [regex]::Replace($content, "function getSubdomain\(\) \{[\s\S]*?return ''\s*\}\r?\n?", "")
  # hdrs
  $content = [regex]::Replace($content, "function hdrs\(\) \{[^}]+\}\r?\n?", "")

  # 4. Replace fetch calls — simple approach line by line
  $newLines = [System.Collections.Generic.List[string]]::new()
  $lineArr = $content -split "`n"
  $i = 0
  while ($i -lt $lineArr.Length) {
    $ln = $lineArr[$i]

    # Single-line: await fetch(`url`, { headers: hdrs() })
    if ($ln -match "await fetch\((.+),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)") {
      $url = $Matches[1].Trim()
      $ln = $ln -replace [regex]::Escape("fetch($url, { headers: hdrs() })"), "apiFetch($url)"
      $newLines.Add($ln)
      $i++
      continue
    }

    # Multi-line fetch — detect start: ends with , {
    if ($ln -match "(.*await )fetch\((.+),\s*\{$") {
      $prefix  = $Matches[1]
      $url     = $Matches[2].Trim()
      # Scan ahead collecting lines until balanced }
      $depth   = 1
      $j       = $i + 1
      $opts    = [System.Collections.Generic.List[string]]::new()
      $hasHdrs = $false
      while ($j -lt $lineArr.Length -and $depth -gt 0) {
        $ol = $lineArr[$j]
        if ($ol -match "headers:\s*hdrs\(\)") { $hasHdrs = $true }
        foreach ($ch in $ol.ToCharArray()) {
          if ($ch -eq '{') { $depth++ }
          if ($ch -eq '}') { $depth-- }
        }
        $opts.Add($ol)
        $j++
      }
      if ($hasHdrs) {
        # Remove headers line and Content-Type line
        $kept = $opts | Where-Object {
          $_ -notmatch "headers:\s*hdrs\(\)" -and
          $_ -notmatch "'Content-Type'" -and
          $_ -notmatch '"Content-Type"'
        }
        # Strip lines that are now just { or }
        $kept = $kept | Where-Object { $_.Trim() -ne "{" -and $_.Trim() -ne "}" -and $_.Trim() -ne "})" -and $_.Trim() -ne "" }

        if ($kept.Count -eq 0) {
          # Simple GET
          $indent = [regex]::Match($ln, "^(\s*)").Groups[1].Value
          $newLines.Add("$indent${prefix}apiFetch($url)")
        } else {
          # Has method/body — keep those, remove headers
          $indent = [regex]::Match($ln, "^(\s*)").Groups[1].Value
          $newLines.Add("$indent${prefix}apiFetch($url, {")
          foreach ($kl in $kept) { $newLines.Add($kl) }
          # ensure closing })
          $last = $kept[$kept.Count - 1].Trim()
          if ($last -notmatch "\}\)$" -and $last -notmatch ",$") {
            $newLines.Add("$indent})")
          }
        }
        $i = $j
        continue
      }
    }

    # Remove standalone headers: hdrs() lines
    if ($ln -match "^\s*headers:\s*hdrs\(\),?\s*$") {
      $i++
      continue
    }

    $newLines.Add($ln)
    $i++
  }

  $content = [string]::Join("`n", $newLines)

  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
    $short = $file -replace ".*\\apps\\web\\src\\app\\", ""
    Write-Host "FIXED: $short" -ForegroundColor Green
    $changed++
  }
}

Write-Host ""
Write-Host "Done. $changed files updated." -ForegroundColor White

# Verification summary
Write-Host ""
Write-Host "--- Verification ---" -ForegroundColor Cyan
$remaining = 0
foreach ($file in $allPages) {
  $c = [string]::Join("", (Get-Content $file))
  if ($c -match "headers:\s*hdrs\(\)") {
    $short = $file -replace ".*\\apps\\web\\src\\app\\", ""
    Write-Host "STILL HAS fetch: $short" -ForegroundColor Red
    $remaining++
  }
}
if ($remaining -eq 0) {
  Write-Host "All fetch() calls replaced with apiFetch()." -ForegroundColor Green
} else {
  Write-Host "$remaining files still have bare fetch() calls." -ForegroundColor Red
}
