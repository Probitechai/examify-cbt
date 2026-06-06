'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './results.module.css'

const MOCK_RESULTS = [
  { studentName: 'Amara Obi', admissionNo: 'GS/2024/001', classLevel: 'SS2', classArm: 'A', score: 82, percentage: 82, passed: true, status: 'submitted' },
  { studentName: 'Tunde Adeyemi', admissionNo: 'GS/2024/002', classLevel: 'SS2', classArm: 'A', score: 74, percentage: 74, passed: true, status: 'submitted' },
  { studentName: 'Ngozi Eze', admissionNo: 'GS/2024/003', classLevel: 'SS2', classArm: 'B', score: 91, percentage: 91, passed: true, status: 'submitted' },
  { studentName: 'Emeka Nwosu', admissionNo: 'GS/2024/004', classLevel: 'SS2', classArm: 'A', score: 43, percentage: 43, passed: false, status: 'submitted' },
  { studentName: 'Halima Sule', admissionNo: 'GS/2024/005', classLevel: 'SS2', classArm: 'B', score: 67, percentage: 67, passed: true, status: 'submitted' },
  { studentName: 'Chidi Okafor', admissionNo: 'GS/2024/006', classLevel: 'SS2', classArm: 'A', score: 55, percentage: 55, passed: true, status: 'submitted' },
  { studentName: 'Aisha Musa', admissionNo: 'GS/2024/007', classLevel: 'SS2', classArm: 'B', score: 38, percentage: 38, passed: false, status: 'submitted' },
  { studentName: 'Obinna Eze', admissionNo: 'GS/2024/008', classLevel: 'SS2', classArm: 'A', score: 0, percentage: 0, passed: false, status: 'in_progress' },
]

export default function ResultsPage() {
  const router = useRouter()
  const [sort, setSort] = useState<'percentage' | 'name'>('percentage')
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')

  const submitted = MOCK_RESULTS.filter(r => r.status === 'submitted')
  const stats = {
    total: MOCK_RESULTS.length,
    submitted: submitted.length,
    passed: submitted.filter(r => r.passed).length,
    failed: submitted.filter(r => !r.passed).length,
    avg: Math.round(submitted.reduce((s, r) => s + r.percentage, 0) / (submitted.length || 1)),
    highest: Math.max(...submitted.map(r => r.percentage)),
    lowest: Math.min(...submitted.map(r => r.percentage)),
  }

  const filtered = MOCK_RESULTS
    .filter(r => filter === 'all' || (filter === 'passed' ? r.passed : !r.passed))
    .sort((a, b) => sort === 'percentage' ? b.percentage - a.percentage : a.studentName.localeCompare(b.studentName))

  function getScoreColor(pct: number) {
    if (pct >= 70) return styles.scoreHigh
    if (pct >= 50) return styles.scoreMid
    return styles.scoreLow
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Results</h1>
          <p className={styles.subtitle}>Third Term English Examination · SS2</p>
        </div>
        <button className={styles.exportBtn}>↓ Export CSV</button>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statCard}><p className={styles.statLabel}>Submitted</p><p className={styles.statValue}>{stats.submitted}<span>/{stats.total}</span></p></div>
        <div className={styles.statCard}><p className={styles.statLabel}>Pass rate</p><p className={`${styles.statValue} ${styles.statGreen}`}>{Math.round((stats.passed / (stats.submitted || 1)) * 100)}%</p></div>
        <div className={styles.statCard}><p className={styles.statLabel}>Class average</p><p className={styles.statValue}>{stats.avg}%</p></div>
        <div className={styles.statCard}><p className={styles.statLabel}>Highest score</p><p className={`${styles.statValue} ${styles.statGreen}`}>{stats.highest}%</p></div>
        <div className={styles.statCard}><p className={styles.statLabel}>Lowest score</p><p className={`${styles.statValue} ${styles.statRed}`}>{stats.lowest}%</p></div>
        <div className={styles.statCard}><p className={styles.statLabel}>Failed</p><p className={`${styles.statValue} ${styles.statRed}`}>{stats.failed}</p></div>
      </div>

      <div className={styles.controls}>
        <div className={styles.filterRow}>
          {(['all', 'passed', 'failed'] as const).map(f => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All students' : f === 'passed' ? 'Passed' : 'Failed'}
            </button>
          ))}
        </div>
        <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value as 'percentage' | 'name')}>
          <option value="percentage">Sort by score</option>
          <option value="name">Sort by name</option>
        </select>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span>Rank</span>
          <span>Student</span>
          <span>Adm. No.</span>
          <span>Class</span>
          <span>Score</span>
          <span>Result</span>
          <span>Status</span>
        </div>
        {filtered.map((r, i) => (
          <div key={r.admissionNo} className={styles.tableRow}>
            <span className={styles.rank}>{r.status === 'submitted' ? i + 1 : '—'}</span>
            <span className={styles.nameCell}>
              <span className={styles.rowAvatar}>{r.studentName.charAt(0)}</span>
              <span className={styles.studentName}>{r.studentName}</span>
            </span>
            <span className={styles.cell}>{r.admissionNo}</span>
            <span className={styles.cell}>{r.classLevel} {r.classArm}</span>
            <span>
              {r.status === 'submitted' ? (
                <div className={styles.scoreWrap}>
                  <div className={styles.scoreBar}>
                    <div className={`${styles.scoreFill} ${getScoreColor(r.percentage)}`} style={{ width: `${r.percentage}%` }} />
                  </div>
                  <span className={`${styles.scorePct} ${getScoreColor(r.percentage)}`}>{r.percentage}%</span>
                </div>
              ) : <span className={styles.cell}>—</span>}
            </span>
            <span>
              {r.status === 'submitted' ? (
                <span className={`${styles.resultPill} ${r.passed ? styles.passed : styles.failed}`}>
                  {r.passed ? 'Pass' : 'Fail'}
                </span>
              ) : '—'}
            </span>
            <span>
              <span className={`${styles.statusPill} ${r.status === 'submitted' ? styles.statusDone : styles.statusPending}`}>
                {r.status === 'submitted' ? 'Submitted' : 'In progress'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
