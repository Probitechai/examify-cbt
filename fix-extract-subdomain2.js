const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')
const lines = src.split('\n')

// Find and replace the function line by line
const idx = lines.findIndex(l => l.includes('if (parts.length >= 3) return parts[0]'))
if (idx >= 0) {
  lines[idx] = "  // Only extract subdomain from *.examify.ng — ignore Railway, Vercel, localhost\n  if (parts.length === 3 && parts[1] === 'examify' && parts[2] === 'ng') return parts[0]"
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  console.log('FIXED: line ' + (idx+1))
} else {
  console.log('Line not found')
}
