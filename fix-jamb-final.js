const fs = require('fs')
const path = require('path')
function read(f) { return fs.readFileSync(f.replace(/\//g, path.sep), 'utf8') }
function write(f, c) { fs.writeFileSync(f.replace(/\//g, path.sep), c, 'utf8') }

let src = read('apps/web/src/app/student/jamb/page.tsx')

const oldStr = `            await apiFetch(\`\${API}/jamb/sessions\`, {
        body: JSON.stringify({
          subjectId: activeSubject.id,
          topicId: activeTopic?.id,
          sessionType,
          questions,
          answers: {},
          score,
          totalQuestions: questions.length,
      await loadProfile()`

const newStr = `            await apiFetch(\`\${API}/jamb/sessions\`, {
              method: 'POST',
              body: JSON.stringify({
                subjectId: activeSubject.id,
                topicId: activeTopic?.id,
                sessionType,
                questions,
                answers: {},
                score,
                totalQuestions: questions.length,
              })
            })
      await loadProfile()`

if (src.includes(oldStr)) {
  write('apps/web/src/app/student/jamb/page.tsx', src.replace(oldStr, newStr))
  console.log('FIXED: student/jamb/page.tsx')
} else {
  console.log('PATTERN NOT FOUND — showing raw lines 268-281:')
  src.split('\n').slice(267, 281).forEach((l,i) => console.log((i+268)+': '+JSON.stringify(l)))
}
