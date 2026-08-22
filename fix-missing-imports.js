const fs = require('fs');

// file path -> array of function names that need to be added to its @/lib/auth import
const fixes = {
  'apps/web/src/app/admin/admissions/page.tsx': ['getSubdomain'],
  'apps/web/src/app/admin/analytics/page.tsx': ['getToken'],
  'apps/web/src/app/admin/announcements/page.tsx': ['getToken'],
  'apps/web/src/app/admin/approvals/page.tsx': ['getToken'],
  'apps/web/src/app/admin/attendance/page.tsx': ['getToken'],
  'apps/web/src/app/admin/broadsheet/page.tsx': ['getToken'],
  'apps/web/src/app/admin/conduct/page.tsx': ['getToken'],
  'apps/web/src/app/admin/exams/page.tsx': ['getToken'],
  'apps/web/src/app/admin/fees/page.tsx': ['getToken'],
  'apps/web/src/app/admin/learning-paths/page.tsx': ['getToken', 'getSubdomain'],
  'apps/web/src/app/admin/qbank/add/page.tsx': ['getToken'],
  'apps/web/src/app/admin/qbank/page.tsx': ['getToken'],
  'apps/web/src/app/admin/questions2/page.tsx': ['getToken'],
  'apps/web/src/app/admin/report-card/page.tsx': ['getToken'],
  'apps/web/src/app/admin/results/page.tsx': ['getToken'],
  'apps/web/src/app/admin/results2/page.tsx': ['getToken'],
  'apps/web/src/app/admin/sessions/page.tsx': ['getToken'],
  'apps/web/src/app/admin/settings/page.tsx': ['getToken'],
  'apps/web/src/app/admin/timetable/page.tsx': ['getToken'],
  'apps/web/src/app/admin/timetable2/page.tsx': ['getToken'],
  'apps/web/src/app/parent/page.tsx': ['getToken'],
};

for (const [file, needed] of Object.entries(fixes)) {
  let content = fs.readFileSync(file, 'utf8');

  const importRegex = /import\s*\{([^}]*)\}\s*from\s*(['"])@\/lib\/auth\2/;
  const match = content.match(importRegex);

  if (!match) {
    console.log(`SKIPPED (no @/lib/auth import found): ${file}`);
    continue;
  }

  const existingNames = match[1].split(',').map(s => s.trim()).filter(Boolean);
  const missing = needed.filter(fn => !existingNames.includes(fn));

  if (missing.length === 0) {
    console.log(`ALREADY OK: ${file}`);
    continue;
  }

  const newNames = [...existingNames, ...missing].join(', ');
  const newImportLine = `import { ${newNames} } from '@/lib/auth'`;
  content = content.replace(importRegex, newImportLine);

  fs.writeFileSync(file, content, 'utf8');
  console.log(`FIXED (${missing.join(', ')}): ${file}`);
}