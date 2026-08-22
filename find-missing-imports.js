const fs = require('fs');
const path = require('path');

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) results.push(full);
  }
  return results;
}

const functionsToCheck = ['getToken', 'getSubdomain', 'checkAuth', 'apiFetch', 'hdrs'];
const files = walk('apps/web/src/app');

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const importLine = content.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/auth['"]/);
  const imported = importLine ? importLine[1].split(',').map(s => s.trim()) : [];

  for (const fn of functionsToCheck) {
    const usesIt = new RegExp(`\\b${fn}\\(`).test(content);
    const definesItLocally = new RegExp(`function ${fn}\\(`).test(content);
    if (usesIt && !imported.includes(fn) && !definesItLocally) {
      console.log(`${file} — uses ${fn}() but doesn't import or define it`);
    }
  }

  // separate check for router (not from lib/auth, but useRouter())
  const usesRouter = /\brouter\b/.test(content);
  const declaresRouter = /const router = useRouter\(\)/.test(content);
  if (usesRouter && !declaresRouter) {
    console.log(`${file} — uses router but doesn't declare const router = useRouter()`);
  }
}