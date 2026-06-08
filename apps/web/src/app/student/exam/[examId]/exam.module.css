.loadingScreen, .errorScreen, .resultScreen {
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1rem;
  padding: 2rem; text-align: center;
}
.spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.errorIcon { font-size: 2.5rem; }
.errorScreen h2 { font-size: 1.25rem; font-weight: 600; }
.errorScreen p { color: var(--text-secondary); max-width: 380px; }
.retryBtn { margin-top: 0.5rem; padding: 0.75rem 1.5rem; background: var(--brand); color: white; border-radius: var(--radius-md); font-weight: 500; }

/* Result screen */
.resultCard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 2.5rem 2rem; max-width: 400px; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1.25rem; }
.resultBadge { font-size: 3rem; }
.resultTitle { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
.scoreCircle { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 1.5rem 2.5rem; background: var(--bg); border-radius: var(--radius-lg); }
.scoreNum { font-size: 3rem; font-weight: 600; letter-spacing: -0.04em; color: var(--brand); }
.scoreLabel { font-size: 0.9rem; color: var(--text-secondary); }
.passLabel { font-size: 0.95rem; font-weight: 500; }
.passGreen { color: var(--brand); }
.passFail { color: var(--text-secondary); }
.resultNote { font-size: 0.9rem; color: var(--text-secondary); }
.doneBtn { width: 100%; padding: 0.875rem; background: var(--brand); color: white; border-radius: var(--radius-md); font-weight: 500; font-size: 0.95rem; }
.passed, .failed { filter: none; }

/* Exam layout */
.examPage { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }

.topBar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  position: sticky;
  top: 0;
  z-index: 20;
}

.progress { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
.progressText { font-size: 0.8rem; color: var(--text-secondary); }
.progressBar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.progressFill { height: 100%; background: var(--brand); border-radius: 2px; transition: width 0.3s var(--ease); }

.timer { font-family: var(--font-mono); font-size: 1.2rem; font-weight: 500; color: var(--text-primary); padding: 0.375rem 0.875rem; border-radius: var(--radius-md); border: 1.5px solid var(--border); background: var(--bg); transition: all 0.3s; }
.timerWarn { border-color: #fbbf24; color: #92400e; background: #fffbeb; }
.timerDanger { border-color: var(--danger); color: var(--danger); background: var(--danger-light); animation: pulse-border 1s ease-in-out infinite; }
@keyframes pulse-border { 0%,100% { border-color: var(--danger); } 50% { border-color: #fca5a5; } }

.topRight { display: flex; align-items: center; gap: 0.375rem; }
.syncDot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.syncSaved { background: var(--brand); }
.syncSaving { background: var(--accent); animation: pulse 1s ease-in-out infinite; }
.syncOffline { background: var(--danger); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.syncLabel { font-size: 0.78rem; color: var(--text-tertiary); }

.cheatWarning { background: var(--warning-light); border-bottom: 1px solid #fde68a; color: #92400e; font-size: 0.85rem; font-weight: 500; padding: 0.625rem 1.5rem; text-align: center; }

.examBody { flex: 1; max-width: 1100px; width: 100%; margin: 0 auto; padding: 2rem 1.5rem; display: grid; grid-template-columns: 1fr 220px; gap: 1.5rem; align-items: start; }

@media (max-width: 720px) {
  .examBody { grid-template-columns: 1fr; }
  .navigator { order: -1; }
}

/* Question panel */
.questionPanel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
.questionNum { font-size: 0.8rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.questionImage { width: 100%; max-height: 280px; object-fit: contain; border-radius: var(--radius-md); border: 1px solid var(--border); }
.questionText { font-size: 1.1rem; line-height: 1.65; color: var(--text-primary); font-weight: 400; }

.options { display: flex; flex-direction: column; gap: 0.75rem; }
.option { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem 1.25rem; background: var(--bg); border: 1.5px solid var(--border); border-radius: var(--radius-md); text-align: left; transition: all 0.15s; }
.option:hover:not(:disabled) { border-color: var(--brand); background: var(--brand-light); }
.optionSelected { border-color: var(--brand) !important; background: var(--brand-light) !important; }
.optionKey { width: 28px; height: 28px; border-radius: 50%; background: var(--surface); border: 1.5px solid var(--border-strong); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; flex-shrink: 0; color: var(--text-secondary); }
.optionSelected .optionKey { background: var(--brand); border-color: var(--brand); color: white; }
.optionText { font-size: 0.95rem; color: var(--text-primary); line-height: 1.5; padding-top: 2px; }

.navButtons { display: flex; gap: 0.75rem; justify-content: space-between; margin-top: 0.5rem; }
.navBtn { padding: 0.75rem 1.25rem; border: 1.5px solid var(--border); border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); transition: all 0.15s; }
.navBtn:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
.navBtn:disabled { opacity: 0.35; cursor: not-allowed; }
.navBtnPrimary { padding: 0.75rem 1.5rem; background: var(--brand); color: white; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; transition: background 0.15s; }
.navBtnPrimary:hover { background: var(--brand-dark); }
.submitBtn { padding: 0.75rem 1.5rem; background: var(--danger); color: white; border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; transition: opacity 0.15s; }
.submitBtn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Navigator sidebar */
.navigator { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; position: sticky; top: 72px; }
.navTitle { font-size: 0.8rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.875rem; }
.navGrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.375rem; margin-bottom: 1rem; }
.navCell { width: 100%; aspect-ratio: 1; border-radius: var(--radius-sm); border: 1.5px solid var(--border); font-size: 0.75rem; font-weight: 500; color: var(--text-tertiary); transition: all 0.1s; }
.navCell:hover { border-color: var(--brand); color: var(--brand); }
.navCurrent { border-color: var(--brand) !important; background: var(--brand) !important; color: white !important; }
.navAnswered { background: var(--brand-light); border-color: var(--brand); color: var(--brand-dark); }

.navLegend { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.25rem; }
.navLegend span { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-secondary); }
.dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
.dotAnswered { background: var(--brand-light); border: 1.5px solid var(--brand); }
.dotUnanswered { background: transparent; border: 1.5px solid var(--border); }

.submitSideBtn { width: 100%; padding: 0.75rem; background: var(--danger); color: white; border-radius: var(--radius-md); font-size: 0.85rem; font-weight: 500; transition: opacity 0.15s; }
.submitSideBtn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── INSTRUCTIONS SCREEN ──────────────────────────────────────────────────── */
.instructionsScreen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: var(--bg); }
.instructionsCard { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 2.5rem 2rem; width: 100%; max-width: 600px; }
.instructionsHeader { text-align: center; margin-bottom: 1.75rem; }
.instructionsIcon { font-size: 3rem; margin-bottom: 0.75rem; }
.instructionsTitle { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; color: var(--text-primary); margin-bottom: 0.375rem; }
.instructionsSubtitle { font-size: 0.9rem; color: var(--text-secondary); }

.examInfoGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.75rem; }
.examInfoItem { background: var(--bg); border-radius: var(--radius-md); padding: 0.875rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.examInfoLabel { font-size: 0.72rem; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.examInfoValue { font-size: 1rem; font-weight: 600; color: var(--text-primary); }

.instructionsList { margin-bottom: 1.75rem; }
.instructionsListTitle { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; }
.instructionsList ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.instructionsList li { display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.875rem; color: var(--text-secondary); line-height: 1.5; }
.instructionBullet { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

.customInstructions { margin-top: 1.25rem; background: var(--brand-light); border: 1px solid var(--brand); border-radius: var(--radius-md); padding: 1rem; }
.customInstructions h3 { font-size: 0.825rem; font-weight: 600; color: var(--brand-dark); margin-bottom: 0.5rem; }
.customInstructions p { font-size: 0.875rem; color: var(--brand-dark); line-height: 1.6; }

.instructionsFooter { display: flex; gap: 0.875rem; justify-content: space-between; }
.backBtn { padding: 0.75rem 1.25rem; border: 1.5px solid var(--border); border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); background: transparent; cursor: pointer; transition: all 0.15s; }
.backBtn:hover { background: var(--bg); }
.startBtn { flex: 1; padding: 0.875rem; background: var(--brand); color: white; font-size: 0.95rem; font-weight: 600; border-radius: var(--radius-md); border: none; cursor: pointer; transition: background 0.15s; }
.startBtn:hover { background: var(--brand-dark); }

/* ── CONFIRM DIALOG ───────────────────────────────────────────────────────── */
.confirmBackdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.confirmDialog { background: var(--surface); border-radius: var(--radius-xl); padding: 2rem; width: 100%; max-width: 420px; text-align: center; border: 1px solid var(--border); }
.confirmIcon { font-size: 2.5rem; margin-bottom: 0.75rem; }
.confirmTitle { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; }
.confirmMsg { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 1.5rem; }
.confirmActions { display: flex; gap: 0.75rem; }
.confirmCancel { flex: 1; padding: 0.75rem; border: 1.5px solid var(--border); border-radius: var(--radius-md); font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); background: transparent; cursor: pointer; }
.confirmCancel:hover { background: var(--bg); }
.confirmSubmit { flex: 1; padding: 0.75rem; background: var(--brand); color: white; font-size: 0.875rem; font-weight: 600; border-radius: var(--radius-md); border: none; cursor: pointer; }
.confirmSubmit:hover { background: var(--brand-dark); }

/* ── UNANSWERED WARNING ───────────────────────────────────────────────────── */
.unansweredWarning { font-size: 0.75rem; color: var(--warning); background: var(--warning-light); border-radius: var(--radius-sm); padding: 0.375rem 0.625rem; text-align: center; margin-bottom: 0.5rem; }

/* ── ANSWER REVIEW ────────────────────────────────────────────────────────── */
.reviewSection { width: 100%; margin-top: 1.5rem; text-align: left; }
.reviewTitle { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; text-align: center; }
.reviewList { display: flex; flex-direction: column; gap: 0.75rem; max-height: 400px; overflow-y: auto; padding-right: 0.25rem; }
.reviewItem { display: flex; gap: 0.875rem; padding: 0.875rem; border-radius: var(--radius-md); border: 1.5px solid var(--border); }
.reviewCorrect { background: var(--brand-light); border-color: var(--brand); }
.reviewWrong { background: var(--danger-light); border-color: var(--danger); }
.reviewNum { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; background: white; }
.reviewCorrect .reviewNum { color: var(--brand); }
.reviewWrong .reviewNum { color: var(--danger); }
.reviewContent { flex: 1; }
.reviewQ { font-size: 0.825rem; color: var(--text-primary); font-weight: 500; margin-bottom: 0.375rem; line-height: 1.4; }
.reviewAnswer { font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.2rem; }
.reviewCorrectAnswer { font-size: 0.78rem; color: var(--brand-dark); font-weight: 500; }
