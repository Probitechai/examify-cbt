const fs = require('fs')
const path = require('path')

// Create a debug page at /debug/page.tsx
const dir = 'apps/web/src/app/debug'.replace(/\//g, path.sep)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(path.join(dir, 'page.tsx'), `'use client'
import { useEffect, useState } from 'react'
export default function DebugPage() {
  const [info, setInfo] = useState('')
  useEffect(() => {
    const h = window.location.hostname
    const parts = h.split('.')
    setInfo(JSON.stringify({
      hostname: h,
      parts,
      partsLength: parts.length,
      part0: parts[0],
      part1: parts[1],
      part2: parts[2],
      detected: parts.length === 3 && parts[1] === 'examify' ? parts[0] : 'NONE'
    }, null, 2))
  }, [])
  return <pre style={{padding:'2rem',fontSize:'1.2rem'}}>{info || 'loading...'}</pre>
}
`, 'utf8')

console.log('Debug page created at /debug')
console.log('Visit: greensprings.examify.ng/debug on your phone after deploying')
