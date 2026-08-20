// fix-extract-subdomain.js
// Run from C:\Probitechai\examify:  node fix-extract-subdomain.js

const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

// Fix the extractSubdomain function to only extract from *.examify.ng
const oldFn = `function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  if (parts.length >= 3) return parts[0]
  return null
}`

const newFn = `function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  // Only extract subdomain from *.examify.ng — ignore Railway, Vercel, localhost etc
  if (parts.length === 3 && parts[1] === 'examify' && parts[2] === 'ng') {
    return parts[0]
  }
  return null
}`

if (src.includes(oldFn)) {
  fs.writeFileSync(filePath, src.replace(oldFn, newFn), 'utf8')
  console.log('FIXED: extractSubdomain now only reads from *.examify.ng')
} else {
  console.log('PATTERN NOT FOUND - showing current function:')
  const lines = src.split('\n')
  const idx = lines.findIndex(l => l.includes('function extractSubdomain'))
  if (idx >= 0) lines.slice(idx, idx+6).forEach((l,i) => console.log((idx+i+1)+': '+l))
}
