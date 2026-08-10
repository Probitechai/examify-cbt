// fix-fetch2.js — handles complex multi-line fetch patterns
// Run from C:\Probitechai\examify:  node fix-fetch2.js

const fs = require('fs')
const path = require('path')

const targets = [
  'apps/web/src/app/admin/admissions/page.tsx',
  'apps/web/src/app/admin/broadsheet/page.tsx',
  'apps/web/src/app/admin/curriculum/page.tsx',
  'apps/web/src/app/admin/hostel-operations/page.tsx',
  'apps/web/src/app/admin/hostels/page.tsx',
  'apps/web/src/app/admin/lessons/page.tsx',
  'apps/web/src/app/admin/live-classes/page.tsx',
  'apps/web/src/app/admin/qbank/page.tsx',
  'apps/web/src/app/admin/questions2/page.tsx',
  'apps/web/src/app/admin/report-card/page.tsx',
  'apps/web/src/app/admin/subscription/page.tsx',
  'apps/web/src/app/admin/timetable2/page.tsx',
  'apps/web/src/app/admin/admissions/[id]/page.tsx',
  'apps/web/src/app/admin/lessons/[id]/page.tsx',
  'apps/web/src/app/admin/students/[id]/page.tsx',
  'apps/web/src/app/student/learning-paths/page.tsx',
  'apps/web/src/app/student/lessons/[id]/page.tsx',
  'apps/web/src/app/parent/page.tsx',
]

// Token-based replacer: walks character by character to find
// fetch(URL, { ... headers: hdrs() ... }) and rewrites it
function replaceFetchCalls(src) {
  let result = ''
  let i = 0

  while (i < src.length) {
    // Look for: await fetch(
    const marker = 'await fetch('
    const idx = src.indexOf(marker, i)
    if (idx === -1) {
      result += src.slice(i)
      break
    }

    // Copy everything up to the fetch(
    result += src.slice(i, idx)

    // Now parse the fetch( call
    const start = idx + marker.length  // position after 'await fetch('

    // Extract the URL argument (first arg)
    // It's either a template literal or a string or a variable
    let pos = start
    let url = ''

    // skip whitespace
    while (pos < src.length && src[pos] === ' ') pos++

    if (src[pos] === '`') {
      // template literal
      pos++ // skip opening `
      url = '`'
      while (pos < src.length) {
        if (src[pos] === '`') { url += '`'; pos++; break }
        if (src[pos] === '$' && src[pos+1] === '{') {
          // expression inside template
          url += src[pos]; pos++
          url += src[pos]; pos++
          let depth = 1
          while (pos < src.length && depth > 0) {
            if (src[pos] === '{') depth++
            if (src[pos] === '}') depth--
            url += src[pos]; pos++
          }
        } else {
          url += src[pos]; pos++
        }
      }
    } else {
      // variable or string — read until comma or )
      while (pos < src.length && src[pos] !== ',' && src[pos] !== ')') {
        url += src[pos]; pos++
      }
      url = url.trim()
    }

    // skip whitespace and comma
    while (pos < src.length && (src[pos] === ' ' || src[pos] === ',')) pos++

    // Now pos should be at { (options object) or ) (no options)
    if (src[pos] !== '{') {
      // No options — simple fetch(url) — just convert
      result += `await apiFetch(${url}`
      i = pos
      continue
    }

    // Parse the options object
    pos++ // skip {
    let depth = 1
    let optionsContent = ''
    while (pos < src.length && depth > 0) {
      if (src[pos] === '{') depth++
      if (src[pos] === '}') { depth--; if (depth === 0) { pos++; break } }
      optionsContent += src[pos]
      pos++
    }

    // skip closing ) of fetch
    while (pos < src.length && src[pos] === ' ') pos++
    if (src[pos] === ')') pos++

    // Now check if options had headers: hdrs()
    if (!optionsContent.includes('hdrs()')) {
      // No hdrs() — leave as-is
      result += `await fetch(${url}, {${optionsContent}}`
      i = pos
      continue
    }

    // Remove the headers line from optionsContent
    // Remove: headers: hdrs(),  or  headers: hdrs()
    let opts = optionsContent
    opts = opts.replace(/\s*headers:\s*hdrs\(\)\s*,?\s*/g, '')
    // Remove Content-Type if it was inline in the headers object
    // (shouldn't be needed but just in case)

    // Clean up leftover commas/whitespace
    opts = opts.replace(/,\s*,/g, ',').replace(/\{\s*,/g, '{').replace(/,\s*\}/g, '}')
    opts = opts.trim()

    // Check what remains
    // Strip whitespace-only
    const remainingOpts = opts.replace(/\s/g, '')
    if (remainingOpts === '' || remainingOpts === '{}') {
      // Simple GET — no other options
      result += `await apiFetch(${url})`
    } else {
      // Has method/body — keep them
      result += `await apiFetch(${url}, {${opts}})`
    }

    i = pos
  }

  return result
}

let totalChanged = 0
const stillHas = []

for (const file of targets) {
  const winFile = file.replace(/\//g, path.sep)
  if (!fs.existsSync(winFile)) {
    console.log('SKIP (not found): ' + file)
    continue
  }

  const original = fs.readFileSync(winFile, 'utf8')
  const fixed = replaceFetchCalls(original)

  if (fixed !== original) {
    fs.writeFileSync(winFile, fixed, 'utf8')
    console.log('FIXED: ' + file.replace('apps/web/src/app/', ''))
    totalChanged++
  }

  if (fixed.includes('hdrs()')) {
    stillHas.push(file.replace('apps/web/src/app/', ''))
  }
}

console.log('\nDone. ' + totalChanged + ' files updated.')
if (stillHas.length === 0) {
  console.log('All hdrs() calls removed successfully.')
} else {
  console.log('\nStill contains hdrs():')
  stillHas.forEach(f => console.log('  ' + f))
}
