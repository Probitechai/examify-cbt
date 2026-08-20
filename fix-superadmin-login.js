// fix-superadmin-login.js
// Allows super_admin to log in without a school subdomain
// Run from C:\Probitechai\examify:  node fix-superadmin-login.js

const fs = require('fs')
const path = require('path')

const filePath = 'apps/api/src/middleware/tenant.ts'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

// Find the block that returns 400 when no subdomain found
// and add a bypass for the /auth/login route so super admins can log in
const oldStr = `  if (!subdomain) {
    return reply.status(400).send({
      error: 'BAD_REQUEST',
      message: 'Could not determine school. Access via your school subdomain.',
    })
  }`

const newStr = `  if (!subdomain) {
    // Allow the login route to proceed without a subdomain
    // Super admins can log in from any URL — the auth route handles this
    const url = request.url ?? ''
    if (url.includes('/auth/login') || url.includes('/auth/me')) {
      // Use a default school for query context — super admin auth bypasses school check
      subdomain = 'greensprings'
    } else {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Could not determine school. Access via your school subdomain.',
      })
    }
  }`

if (src.includes(oldStr)) {
  fs.writeFileSync(filePath, src.replace(oldStr, newStr), 'utf8')
  console.log('FIXED: tenant.ts — super admin login bypass added')
} else {
  console.log('PATTERN NOT FOUND — showing current block:')
  const lines = src.split('\n')
  const idx = lines.findIndex(l => l.includes('BAD_REQUEST'))
  if (idx >= 0) lines.slice(Math.max(0,idx-3), idx+6).forEach((l,i) => console.log((idx-2+i)+': '+l))
}
