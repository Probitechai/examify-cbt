const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

let src = read('apps/web/src/app/admin/timetable2/page.tsx')

const oldStr = `            const res = await apiFetch(\`\${API}/timetable\`, {
        body: JSON.stringify({
          termId: selectedTerm,
          classLevel,
          classArm: classArm || undefined,
          day: formDay,
          period: formPeriod,
          subject: formSubject,
          teacherName: formTeacher || undefined,
          startTime: formStart || undefined,
          endTime: formEnd || undefined,
          venue: formVenue || undefined,
        })
      if (!res.ok)`

const newStr = `            const res = await apiFetch(\`\${API}/timetable\`, {
              method: 'POST',
              body: JSON.stringify({
                termId: selectedTerm,
                classLevel,
                classArm: classArm || undefined,
                day: formDay,
                period: formPeriod,
                subject: formSubject,
                teacherName: formTeacher || undefined,
                startTime: formStart || undefined,
                endTime: formEnd || undefined,
                venue: formVenue || undefined,
              })
            })
      if (!res.ok)`

if (src.includes(oldStr)) {
  write('apps/web/src/app/admin/timetable2/page.tsx', src.replace(oldStr, newStr))
  console.log('FIXED: admin/timetable2/page.tsx')
} else {
  console.log('PATTERN NOT FOUND — showing raw lines 107-122:')
  src.split('\n').slice(106, 122).forEach((l,i) => console.log((i+107)+': '+JSON.stringify(l)))
}
