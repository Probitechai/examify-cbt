// Plain JavaScript seed - run with: node -r dotenv/config seed.js
const postgres = require('postgres')
const bcrypt = require('bcryptjs')

require('dotenv').config()

const db = postgres(process.env.DATABASE_URL)

async function seed() {
  console.log('🌱 Seeding database...')

  // 1. Create the first school
  const [school] = await db`
    INSERT INTO schools (name, subdomain, subscription_tier, max_students, email, phone)
    VALUES (
      'Greensprings Academy',
      'greensprings',
      'growth',
      500,
      'admin@greenspringsacademy.edu.ng',
      '+234-801-000-0001'
    )
    ON CONFLICT (subdomain) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, name, subdomain
  `
  console.log(`✅ School: ${school.name} — ID: ${school.id}`)

  const schoolId = school.id

  // 2. School admin
  const adminHash = await bcrypt.hash('Admin@1234', 12)
  const adminResult = await db`
    INSERT INTO users (school_id, role, email, full_name, password_hash)
    VALUES (${schoolId}, 'school_admin', 'admin@greensprings.examify.ng', 'Mrs. Adaeze Okonkwo', ${adminHash})
    ON CONFLICT (school_id, email) DO NOTHING
    RETURNING id, full_name
  `
  if (adminResult[0]) console.log(`✅ Admin: ${adminResult[0].full_name}  (password: Admin@1234)`)

  // 3. Teachers
  const teacherHash = await bcrypt.hash('Teacher@1234', 12)
  const teachers = [
    { name: 'Mr. Chukwuemeka Eze', email: 'c.eze@greensprings.examify.ng' },
    { name: 'Mrs. Fatima Bello', email: 'f.bello@greensprings.examify.ng' },
  ]
  for (const t of teachers) {
    const result = await db`
      INSERT INTO users (school_id, role, email, full_name, password_hash)
      VALUES (${schoolId}, 'teacher', ${t.email}, ${t.name}, ${teacherHash})
      ON CONFLICT (school_id, email) DO NOTHING
      RETURNING full_name
    `
    if (result[0]) console.log(`✅ Teacher: ${result[0].full_name}  (password: Teacher@1234)`)
  }

  // 4. Students
  const studentHash = await bcrypt.hash('Student@1234', 12)
  const students = [
    { name: 'Amara Obi',      email: 'amara.obi@greensprings.examify.ng',      admNo: 'GS/2024/001' },
    { name: 'Tunde Adeyemi',  email: 'tunde.adeyemi@greensprings.examify.ng',  admNo: 'GS/2024/002' },
    { name: 'Ngozi Eze',      email: 'ngozi.eze@greensprings.examify.ng',      admNo: 'GS/2024/003' },
    { name: 'Emeka Nwosu',    email: 'emeka.nwosu@greensprings.examify.ng',    admNo: 'GS/2024/004' },
    { name: 'Halima Sule',    email: 'halima.sule@greensprings.examify.ng',    admNo: 'GS/2024/005' },
  ]
  for (const s of students) {
    const result = await db`
      INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm)
      VALUES (${schoolId}, 'student', ${s.email}, ${s.name}, ${studentHash}, ${s.admNo}, 'SS2', 'A')
      ON CONFLICT (school_id, email) DO NOTHING
      RETURNING full_name
    `
    if (result[0]) console.log(`✅ Student: ${result[0].full_name}`)
  }

  // 5. Sample questions
  const [teacher1] = await db`
    SELECT id FROM users WHERE school_id = ${schoolId} AND role = 'teacher' LIMIT 1
  `
  if (teacher1) {
    const questions = [
      {
        text: 'Which of the following is a conjunction?',
        options: JSON.stringify([
          { key: 'A', text: 'Quickly' },
          { key: 'B', text: 'Because' },
          { key: 'C', text: 'Beautiful' },
          { key: 'D', text: 'Underneath' }
        ]),
        correct: 'B',
      },
      {
        text: "Choose the sentence with the correct use of the apostrophe.",
        options: JSON.stringify([
          { key: 'A', text: "The boys' bags are heavy." },
          { key: 'B', text: "The boy's bags are heavy." },
          { key: 'C', text: "The boys bags are heavy." },
          { key: 'D', text: "The boys bag's are heavy." }
        ]),
        correct: 'A',
      },
      {
        text: 'Identify the verb in: "The students wrote their examinations carefully."',
        options: JSON.stringify([
          { key: 'A', text: 'students' },
          { key: 'B', text: 'examinations' },
          { key: 'C', text: 'wrote' },
          { key: 'D', text: 'carefully' }
        ]),
        correct: 'C',
      },
    ]

    for (const q of questions) {
      await db`
        INSERT INTO questions (school_id, created_by, type, subject, class_level,
                               question_text, options, correct_answer, marks)
        VALUES (${schoolId}, ${teacher1.id}, 'mcq', 'English Language', 'SS2',
                ${q.text}, ${q.options}::jsonb, ${q.correct}, 1)
      `
    }
    console.log(`✅ Created ${questions.length} sample questions`)
  }

  console.log('\n🎉 Seed complete!')
  console.log('\n📋 Login credentials:')
  console.log('   Admin:   admin@greensprings.examify.ng  /  Admin@1234')
  console.log('   Teacher: c.eze@greensprings.examify.ng  /  Teacher@1234')
  console.log('   Student: amara.obi@greensprings.examify.ng  /  Student@1234')
  console.log('\n   Dev header: X-School-Subdomain: greensprings')

  await db.end()
  process.exit(0)
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message)
  process.exit(1)
})
