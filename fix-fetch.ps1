# fix-fetch.ps1
# Replaces fetch(..., { headers: hdrs() }) with apiFetch(...)
# Run from: C:\Probitechai\examify
# Usage: powershell -ExecutionPolicy Bypass -File fix-fetch.ps1

$files = Get-ChildItem -Path "apps\web\src\app\admin","apps\web\src\app\student","apps\web\src\app\parent" -Recurse -Filter "page.tsx" | Select-Object -ExpandProperty FullName

$changed = 0

foreach ($file in $files) {
  $lines = Get-Content $file -Encoding UTF8
  $out = [System.Collections.Generic.List[string]]::new()
  $i = 0
  $fileChanged = $false

  while ($i -lt $lines.Count) {
    $line = $lines[$i]

    # Pattern: single-line fetch with hdrs()
    # e.g. const res = await fetch(`${API}/x`, { headers: hdrs() })
    if ($line -match "await fetch\((.+),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)") {
      $url = $Matches[1].Trim()
      $newLine = $line -replace "await fetch\((.+),\s*\{\s*headers:\s*hdrs\(\)\s*\}\)", "await apiFetch($url)"
      $out.Add($newLine)
      $fileChanged = $true
      $i++
      continue
    }

    # Pattern: multi-line fetch with headers: hdrs()
    # Detect opening: await fetch(`url`, {
    # followed by:    headers: hdrs()
    # followed by:    })
    if ($line -match "await fetch\((.+),\s*\{$" -or $line -match "await fetch\((.+),\s*\{\s*$") {
      $urlPart = $Matches[1].Trim()
      # Peek ahead to see if next non-empty line is "headers: hdrs()"
      $j = $i + 1
      # Collect options lines until closing }
      $optionLines = @()
      $foundHdrs = $false
      $depth = 1
      $endIdx = -1
      $jj = $i + 1
      while ($jj -lt $lines.Count -and $depth -gt 0) {
        $l = $lines[$jj]
        if ($l -match "^\s*headers:\s*hdrs\(\)") { $foundHdrs = $true }
        foreach ($c in $l.ToCharArray()) {
          if ($c -eq '{') { $depth++ }
          if ($c -eq '}') { $depth-- }
        }
        $optionLines += $l
        if ($depth -eq 0) { $endIdx = $jj }
        $jj++
      }

      if ($foundHdrs -and $endIdx -gt -1) {
        # Rebuild as apiFetch — keep any options that aren't headers: hdrs()
        $otherOptions = $optionLines | Where-Object {
          $_ -notmatch "^\s*headers:\s*hdrs\(\)" -and
          $_ -notmatch "^\s*'Content-Type':" -and
          $_ -notmatch "^\s*\}\s*$" -and
          $_ -notmatch "^\s*\{\s*$"
        }
        $otherOptions = $otherOptions | Where-Object { $_.Trim() -ne "" }

        $indent = ($line -replace "^(\s*).*", '$1')

        if ($otherOptions.Count -eq 0) {
          # Simple GET — no other options
          $newLine = $line -replace "await fetch\((.+),\s*\{.*$", "await apiFetch($urlPart)"
          $out.Add($newLine)
        } else {
          # Has other options (method, body etc) — keep them, remove headers
          $out.Add(($line -replace "await fetch\(", "await apiFetch("))
          foreach ($ol in $otherOptions) {
            $out.Add($ol)
          }
          # Add closing } if needed
          if ($otherOptions[-1].Trim() -notmatch "^\}") {
            $out.Add("$indent})")
          }
        }
        $i = $endIdx + 1
        $fileChanged = $true
        continue
      }
    }

    # Pattern: remove standalone ", headers: hdrs()," line (inside multi-option fetch)
    if ($line -match "^\s*headers:\s*hdrs\(\),?\s*$") {
      $fileChanged = $true
      $i++
      continue
    }

    $out.Add($line)
    $i++
  }

  if ($fileChanged) {
    Set-Content $file -Value $out -Encoding UTF8
    Write-Host "FIXED: $file" -ForegroundColor Green
    $changed++
  }
}

Write-Host ""
Write-Host "Done. $changed files updated." -ForegroundColor White
