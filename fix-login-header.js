const fs = require('fs')
const path = require('path')

const filePath = 'apps/web/src/app/login/page.tsx'.replace(/\//g, path.sep)
let src = fs.readFileSync(filePath, 'utf8')

// Fix the fetch call to send subdomain as header instead of body
const oldFetch = `      const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, subdomain: activeSchool }),
      })`

const newFetch = `      const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/auth/login\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-School-Subdomain': activeSchool,
        },
        body: JSON.stringify({ email, password }),
      })`

if (src.includes(oldFetch)) {
  fs.writeFileSync(filePath, src.replace(oldFetch, newFetch), 'utf8')
  console.log('FIXED: login page now sends subdomain as X-School-Subdomain header')
} else {
  console.log('PATTERN NOT FOUND - showing fetch call:')
  const lines = src.split('\n')
  const idx = lines.findIndex(l => l.includes('auth/login'))
  if (idx >= 0) lines.slice(Math.max(0,idx-2), idx+6).forEach((l,i) => console.log((idx-1+i)+': '+l))
}
