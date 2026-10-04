#!/usr/bin/env python3
"""Generates demo-school.sql (run: python gen_demo.py, in this folder): builds (or rebuilds) the Examify demo school.

Everything is deterministic (fixed seed, fixed ids) except dates, which the SQL
works out from the day it is run, so the current term is always "now".
"""
import json, random, uuid, html, os
HERE = os.path.dirname(os.path.abspath(__file__))

R = random.Random(20261004)
NS = uuid.UUID('6f1c1e0e-5d1a-4b7e-9a51-0d3e2c7a9b11')
def uid(*parts): return str(uuid.uuid5(NS, '/'.join(str(p) for p in parts)))
def q(s): return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
def js(o): return q(json.dumps(o, ensure_ascii=False)) + "::jsonb"

SCHOOL = uid('school')
SUB = 'demo'
DOMAIN = 'demo.examify.ng'
PASSWORD = 'Demo@2026'

# ── Classes and subjects ─────────────────────────────────────────────────────
CLASSES = [('JSS1', 'A', 10), ('JSS2', 'A', 8), ('SS1', 'A', 8), ('SS3', 'A', 10)]
JSS_SUBJ = ['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Civic Education', 'Computer Studies']
SS_SUBJ = ['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics']
def subjects_for(level): return JSS_SUBJ if level.startswith('JSS') else SS_SUBJ
SUBJ_CODE = {'English Language': 'ENG', 'Mathematics': 'MTH', 'Basic Science': 'BSC', 'Social Studies': 'SOS',
             'Civic Education': 'CVE', 'Computer Studies': 'CMP', 'Physics': 'PHY', 'Chemistry': 'CHM',
             'Biology': 'BIO', 'Economics': 'ECO'}

# ── Staff ────────────────────────────────────────────────────────────────────
STAFF = [
    # key, role, name, email-local, phone
    ('proprietor', 'proprietor', 'Adewale Ogunleye', 'proprietor', '07000000101'),
    ('admin', 'school_admin', 'Funmilayo Adebayo', 'admin', '07000000102'),
    ('bursar', 'bursar', 'Emeka Okafor', 'bursar', '07000000103'),
    ('bakare', 'teacher', 'Tunde Bakare', 'maths.teacher', '07000000104'),
    ('eze', 'teacher', 'Ngozi Eze', 'class.teacher', '07000000105'),
    ('musa', 'teacher', 'Ibrahim Musa', 'ibrahim.musa', '07000000106'),
    ('sani', 'teacher', 'Halima Sani', 'halima.sani', '07000000107'),
    ('obi', 'teacher', 'Chinedu Obi', 'chinedu.obi', '07000000108'),
    ('adeyemi', 'teacher', 'Bisi Adeyemi', 'bisi.adeyemi', '07000000109'),
]
# teacher → [(class_level, subject)]
TEACHES = {
    'bakare': [(c[0], 'Mathematics') for c in CLASSES],
    'eze': [(c[0], 'English Language') for c in CLASSES],
    'musa': [('JSS1', 'Basic Science'), ('JSS2', 'Basic Science'), ('SS1', 'Physics'), ('SS3', 'Physics')],
    'sani': [('SS1', 'Chemistry'), ('SS3', 'Chemistry'), ('SS1', 'Biology'), ('SS3', 'Biology')],
    'obi': [('JSS1', 'Social Studies'), ('JSS2', 'Social Studies'), ('JSS1', 'Civic Education'),
            ('JSS2', 'Civic Education'), ('SS1', 'Economics'), ('SS3', 'Economics')],
    'adeyemi': [('JSS1', 'Computer Studies'), ('JSS2', 'Computer Studies')],
}
CLASS_TEACHER = {'SS3': 'eze', 'JSS1': 'adeyemi', 'JSS2': 'obi', 'SS1': 'sani'}
def teacher_of(level, subject):
    for t, pairs in TEACHES.items():
        if (level, subject) in pairs: return t
    return 'bakare'

# ── Students and families ────────────────────────────────────────────────────
FIRST_M = ['Chukwudi', 'Tobi', 'Ibrahim', 'Emeka', 'Seyi', 'Musa', 'David', 'Kunle', 'Uche', 'Femi', 'Abdul', 'Segun', 'Obinna', 'Yusuf', 'Daniel', 'Tunde', 'Ikenna', 'Bayo']
FIRST_F = ['Amaka', 'Aisha', 'Funke', 'Ngozi', 'Zainab', 'Bisola', 'Chioma', 'Hauwa', 'Kemi', 'Adaeze', 'Fatima', 'Yetunde', 'Nkechi', 'Halima', 'Tolu', 'Ifeoma', 'Blessing', 'Maryam']
LAST = ['Adeyemi', 'Okonkwo', 'Bello', 'Eze', 'Ogunbiyi', 'Nwosu', 'Abubakar', 'Olawale', 'Okafor', 'Danjuma', 'Akande', 'Uzor',
        'Lawal', 'Chukwu', 'Adeleke', 'Ibe', 'Ojo', 'Mohammed', 'Nnamdi', 'Afolabi', 'Ekwueme', 'Salami', 'Onyeka', 'Balogun', 'Agbaje', 'Ugwu', 'Garba', 'Oyelaran', 'Anyanwu', 'Fashola']
STATES = ['Lagos', 'Ogun', 'Oyo', 'Enugu', 'Anambra', 'Kano', 'Kaduna', 'Rivers', 'Delta', 'Edo', 'Imo', 'Kwara']

students = []   # dicts
used_last = set()
def new_student(level, arm, first, last, gender, email_local=None, ability=None, trend=0.0, attendance=0.93, photo=False):
    i = len(students) + 1
    s = dict(key=f's{i}', id=uid('student', i), level=level, arm=arm, first=first, last=last, gender=gender,
             name=f'{first} {last}', email=f'{email_local or (first + "." + last).lower()}@{DOMAIN}',
             adm=f'NDC/{ {"JSS1": 2026, "JSS2": 2025, "SS1": 2023, "SS3": 2021}[level] }/{i:03d}',
             ability=ability if ability is not None else R.randint(48, 82), trend=trend, attendance=attendance, photo=photo,
             subj_bias={sj: R.randint(-8, 8) for sj in sorted(set(JSS_SUBJ + SS_SUBJ))})
    students.append(s); used_last.add(last)
    return s

# The demo's own characters first
chidinma = new_student('SS3', 'A', 'Chidinma', 'Okeke', 'Female', email_local='student', ability=74, trend=1.5, attendance=0.97, photo=True)
kelechi = new_student('JSS1', 'A', 'Kelechi', 'Okeke', 'Male', ability=66, trend=1.0, attendance=0.95, photo=True)
daniel = new_student('SS3', 'A', 'Daniel', 'Ibe', 'Male', ability=58, trend=-1.0, attendance=0.9)        # owes fees this term
struggling = new_student('SS3', 'A', 'Musa', 'Garba', 'Male', ability=36, trend=-1.5, attendance=0.7)     # needs attention
improver = new_student('JSS2', 'A', 'Zainab', 'Abubakar', 'Female', ability=52, trend=4.0, attendance=0.94, photo=True)
decliner = new_student('SS1', 'A', 'Tobi', 'Akande', 'Male', ability=70, trend=-4.0, attendance=0.86)
low_att = new_student('JSS1', 'A', 'Hauwa', 'Danjuma', 'Female', ability=55, trend=0, attendance=0.6)

counts = {c[0]: sum(1 for s in students if s['level'] == c[0]) for c in CLASSES}
for level, arm, n in CLASSES:
    while counts[level] < n:
        g = R.choice(['Male', 'Female'])
        while True:
            first = R.choice(FIRST_M if g == 'Male' else FIRST_F)
            last = R.choice([l for l in LAST if l not in used_last] or LAST)
            if (first, last) not in {(x['first'], x['last']) for x in students}: break
        new_student(level, arm, first, last, g, photo=(R.random() < 0.15))
        counts[level] += 1

# Parents: one per family; the Okekes share one
parents = []
def new_parent(name, email_local, phone, kids, rel):
    p = dict(id=uid('parent', len(parents) + 1), name=name, email=f'{email_local}@{DOMAIN}', phone=phone, kids=kids, rel=rel)
    parents.append(p); return p
new_parent('Emmanuel Okeke', 'parent', '07000000201', [chidinma, kelechi], 'Father')
for s in students:
    if s['last'] == 'Okeke': continue
    title = R.choice(['Mr.', 'Mrs.'])
    staff_names = {nm for _, _, nm, _, _ in STAFF}
    while True:
        pf = R.choice(FIRST_M if title == 'Mr.' else FIRST_F)
        if f'{pf} {s["last"]}' not in staff_names and pf != s['first']: break
    new_parent(f'{pf} {s["last"]}', f'parent.{s["first"].lower()}.{s["last"].lower()}', f'0700000{len(parents) + 300:04d}', [s], 'Father' if title == 'Mr.' else 'Mother')
parent_of = {k['id']: p for p in parents for k in p['kids']}

# ── Terms (SQL works out the dates) ─────────────────────────────────────────
TERMS = [  # key, session (prev/cur), name, number, start expr, end expr
    ('t1', 'prev', 'First Term', 1, 'v_cur_start - 315', 'v_cur_start - 231'),
    ('t2', 'prev', 'Second Term', 2, 'v_cur_start - 210', 'v_cur_start - 126'),
    ('t3', 'prev', 'Third Term', 3, 'v_cur_start - 105', 'v_cur_start - 28'),
    ('cur', 'cur', 'First Term', 1, 'v_cur_start', 'v_cur_start + 84'),
]
TERM_ID = {t[0]: uid('term', t[0]) for t in TERMS}
TERM_INDEX = {'t1': 0, 't2': 1, 't3': 2, 'cur': 3}

def clamp(v, lo, hi): return max(lo, min(hi, v))
BOUNDS = [('A', 75, 'Excellent'), ('B', 65, 'Very Good'), ('C', 55, 'Good'), ('D', 45, 'Fair'), ('E', 40, 'Pass'), ('F', 0, 'Fail')]
def grade(total):
    for g, mn, rm in BOUNDS:
        if total >= mn: return g, rm
    return 'F', 'Fail'

COMMENTS = {'A': 'Excellent work. Keep it up.', 'B': 'Very good effort.', 'C': 'Good. Aim higher next term.',
            'D': 'Fair. More practice needed.', 'E': 'Just passed. Needs to work harder.', 'F': 'Needs serious improvement.'}

results = []
for s in students:
    for tk in ['t1', 't2', 't3', 'cur']:
        for sj in subjects_for(s['level']):
            if tk == 'cur':
                if s['level'] == 'SS3' and sj == 'Mathematics': continue          # the teacher enters these live
                if s['level'] in ('JSS2', 'SS1') and sj not in ('English Language', 'Mathematics', 'Basic Science', 'Physics'): continue
            mean = s['ability'] + s['subj_bias'][sj] + s['trend'] * TERM_INDEX[tk] * 2 + (TERM_INDEX[tk] - 2) * 2.2   # the school improves term on term
            total = clamp(round(R.gauss(mean, 6)), 18, 98)
            ca = clamp(round(total * 0.4 + R.uniform(-3, 3)), 5, 40)
            exam = clamp(total - ca, 8, 60)
            total = ca + exam
            g, rm = grade(total)
            results.append(dict(student=s, term=tk, subject=sj, ca=ca, exam=exam, total=total, grade=g, remark=rm,
                                comment=COMMENTS[g] if R.random() < 0.5 else None,
                                teacher=teacher_of(s['level'], sj)))

# ── Fees ─────────────────────────────────────────────────────────────────────
def fee_items(level, tk):
    tuition = 85000 if level.startswith('JSS') else 95000
    items = [('Tuition', tuition, True), ('Development Levy', 15000, True), ('PTA Levy', 5000, True),
             ('School Bus', 30000, False)]
    if level == 'SS3' and tk == 'cur': items.append(('WAEC & NECO Registration', 45000, True))
    return items
fee_structs = []
for level, _, _ in CLASSES:
    for tk in ['t1', 't2', 't3', 'cur']:
        for name, amount, mand in fee_items(level, tk):
            fee_structs.append(dict(id=uid('fee', level, tk, name), level=level, term=tk, name=name, amount=amount, mand=mand))
bus_riders = [s for s in students if R.random() < 0.2] + [kelechi]
bus_ids = {s['id'] for s in bus_riders}

payments = []  # student, fee, amount, method, day offset from term start
def pay(s, f, amount, day):
    method = R.choices(['cash', 'bank_transfer', 'pos'], [4, 4, 2])[0]
    payments.append(dict(id=uid('pay', len(payments)), student=s, fee=f, amount=amount, method=method, day=day))
for s in students:
    for f in fee_structs:
        if f['level'] != s['level']: continue
        if not f['mand'] and s['id'] not in bus_ids: continue
        if f['term'] != 'cur':
            r = R.random()
            if s is struggling and f['term'] == 't3' and f['name'] == 'Tuition': pay(s, f, f['amount'] // 2, R.randint(10, 40))
            elif r < 0.94: pay(s, f, f['amount'], R.randint(1, 30))
            elif r < 0.98: pay(s, f, f['amount'] // 2, R.randint(5, 40))
        else:
            if s is daniel: continue                                     # owes everything this term
            if s is chidinma:                                            # parent sees a balance to pay online
                if f['name'] in ('Tuition', 'PTA Levy'): pay(s, f, f['amount'], R.randint(2, 12))
                continue
            habit = s.setdefault('cur_habit', R.choices(['full', 'part', 'little'], [64, 26, 10])[0])
            if habit == 'full': pay(s, f, f['amount'], R.randint(1, 25))
            elif habit == 'part' and f['name'] != 'Development Levy': pay(s, f, f['amount'], R.randint(3, 25))
            elif habit == 'little' and f['name'] == 'Tuition': pay(s, f, f['amount'] // 2, R.randint(3, 25))

# ── Question bank and exams ──────────────────────────────────────────────────
def mcq(text, opts, ans, topic, expl=None, diff='medium'):
    return dict(type='mcq', text=text, options=[{'key': k, 'text': t} for k, t in zip('ABCD', opts)], answer=ans, topic=topic, expl=expl, diff=diff, marks=1)
SS3_MATHS = [
    mcq('Solve for x: 3x − 7 = 11', ['4', '6', '18', '−6'], 'B', 'Linear equations', '3x = 18, so x = 6.', 'easy'),
    mcq('What is the value of log₁₀ 1000?', ['2', '3', '10', '100'], 'B', 'Logarithms', '10³ = 1000.', 'easy'),
    mcq('Find the gradient of the line joining (2, 3) and (6, 11).', ['2', '4', '8', '½'], 'A', 'Coordinate geometry', '(11 − 3) ÷ (6 − 2) = 2.'),
    mcq('Differentiate y = 4x³ with respect to x.', ['12x²', '4x²', '12x³', 'x⁴'], 'A', 'Calculus', 'dy/dx = 3 × 4x² = 12x².'),
    mcq('The sum of the interior angles of a hexagon is', ['360°', '540°', '720°', '1080°'], 'C', 'Geometry', '(6 − 2) × 180° = 720°.'),
    mcq('If P(A) = 0.3, what is the probability that A does not happen?', ['0.3', '0.7', '1.3', '0'], 'B', 'Probability', '1 − 0.3 = 0.7.', 'easy'),
    mcq('Simplify (2³ × 2⁴) ÷ 2⁵', ['2', '4', '8', '16'], 'B', 'Indices', '2^(3+4−5) = 2² = 4.'),
    mcq('Find the 10th term of the sequence 3, 7, 11, 15, …', ['39', '40', '43', '47'], 'A', 'Sequences and series', 'a + 9d = 3 + 36 = 39.'),
    mcq('The roots of x² − 5x + 6 = 0 are', ['2 and 3', '−2 and −3', '1 and 6', '−1 and 6'], 'A', 'Quadratic equations', '(x − 2)(x − 3) = 0.'),
    mcq('Find the mean of 4, 8, 6, 10 and 12.', ['6', '8', '10', '40'], 'B', 'Statistics', '40 ÷ 5 = 8.', 'easy'),
    dict(type='true_false', text='The square root of 144 is 12.', options=[{'key': 'True', 'text': 'True'}, {'key': 'False', 'text': 'False'}], answer='True', topic='Indices', expl=None, diff='easy', marks=1),
    dict(type='fill_blank', text='A triangle with all three sides equal is called an ______ triangle.', options=None, answer='equilateral', topic='Geometry', expl='All sides equal: equilateral.', diff='easy', marks=1),
    dict(type='fill_blank', text='The value of π correct to 2 decimal places is ______.', options=None, answer='3.14', topic='Mensuration', expl=None, diff='easy', marks=1),
    dict(type='short_answer', text='What is 15% of 200?', options=None, answer='30', topic='Percentages', expl='0.15 × 200 = 30.', diff='easy', marks=1),
    dict(type='essay', text='A trader bought goods for ₦40,000 and sold them for ₦50,000. Calculate the percentage profit, showing your working.', options=None, answer='', topic='Commercial arithmetic', expl='Profit ₦10,000; 10,000 ÷ 40,000 × 100 = 25%. Award 1 mark for the profit, 2 for the percentage with working.', diff='medium', marks=3),
]
JSS1_MATHS = [
    mcq('What is ½ + ¼?', ['¾', '⅔', '⅓', '1'], 'A', 'Fractions', None, 'easy'),
    mcq('Write 0.25 as a fraction.', ['¼', '½', '2/5', '25'], 'A', 'Fractions', None, 'easy'),
    mcq('What is ⅔ of 18?', ['6', '9', '12', '27'], 'C', 'Fractions'),
    mcq('Which fraction is the largest?', ['½', '⅓', '¾', '⅝'], 'C', 'Fractions'),
    mcq('Simplify 12/16.', ['¾', '⅔', '⅘', '½'], 'A', 'Fractions', None, 'easy'),
    mcq('What is 3 × ⅕?', ['⅗', '3/15', '15', '⅓'], 'A', 'Fractions'),
    mcq('Convert 1½ to an improper fraction.', ['3/2', '2/3', '1/2', '5/2'], 'A', 'Fractions'),
    mcq('What is 1 − ⅜?', ['⅝', '⅜', '⅞', '½'], 'A', 'Fractions'),
]
SS3_ENG = [
    mcq('Choose the word opposite in meaning to "generous".', ['kind', 'stingy', 'wealthy', 'humble'], 'B', 'Antonyms', None, 'easy'),
    mcq('Choose the correctly spelt word.', ['accomodation', 'accommodation', 'acommodation', 'accommadation'], 'B', 'Spelling'),
    mcq('"He has been ill ___ Monday."', ['for', 'since', 'from', 'by'], 'B', 'Prepositions'),
    mcq('Identify the figure of speech: "The wind whispered through the trees."', ['Simile', 'Metaphor', 'Personification', 'Hyperbole'], 'C', 'Figures of speech'),
    mcq('Choose the word nearest in meaning to "commence".', ['end', 'begin', 'delay', 'repeat'], 'B', 'Synonyms', None, 'easy'),
    mcq('"Neither the teacher nor the students ___ present."', ['was', 'were', 'is', 'has'], 'B', 'Concord'),
]
def qrows(lst, subject, level, creator, tag):
    out = []
    for i, x in enumerate(lst):
        out.append(dict(x, id=uid('q', tag, i), subject=subject, level=level, creator=creator))
    return out
Q_SS3_MATHS = qrows(SS3_MATHS, 'Mathematics', 'SS3', 'bakare', 'ss3m')
Q_JSS1_MATHS = qrows(JSS1_MATHS, 'Mathematics', 'JSS1', 'bakare', 'jss1m')
Q_SS3_ENG = qrows(SS3_ENG, 'English Language', 'SS3', 'eze', 'ss3e')
ALL_Q = Q_SS3_MATHS + Q_JSS1_MATHS + Q_SS3_ENG

# Live exam for the demo: 3 MCQ, 1 fill-in, 1 essay
LIVE_QS = [Q_SS3_MATHS[0], Q_SS3_MATHS[2], Q_SS3_MATHS[8], Q_SS3_MATHS[11], Q_SS3_MATHS[14]]
EXAMS = [
    dict(id=uid('exam', 'live'), key='live', title='SS3 Mathematics Quick Test', subject='Mathematics', level='SS3', creator='bakare',
         qs=LIVE_QS, duration=10, pass_mark=50, status='active', start='now() - interval \'1 day\'', end='now() + interval \'21 days\'',
         instructions='Answer all five questions. You have 10 minutes. Question 5 is marked by your teacher.'),
    dict(id=uid('exam', 'jss1'), key='jss1', title='JSS1 Mathematics: Fractions', subject='Mathematics', level='JSS1', creator='bakare',
         qs=Q_JSS1_MATHS, duration=20, pass_mark=50, status='completed', start="v_cur_start + 10 + time '09:00'", end="v_cur_start + 10 + time '11:00'",
         instructions='Answer all questions.'),
    dict(id=uid('exam', 'eng'), key='eng', title='SS3 English Language Test', subject='English Language', level='SS3', creator='eze',
         qs=Q_SS3_ENG, duration=15, pass_mark=50, status='completed', start="v_cur_start + 17 + time '10:00'", end="v_cur_start + 17 + time '12:00'",
         instructions='Answer all questions.'),
]
sessions = []
def sit(exam, s, skill, live=False):
    answers, score, total, manual = {}, 0, 0, {}
    for qq in exam['qs']:
        total += qq['marks']
        right = R.random() < skill
        if qq['type'] == 'essay':
            answers[qq['id']] = 'Profit = 50,000 − 40,000 = ₦10,000. Percentage profit = 10,000 ÷ 40,000 × 100 = 25%.' if right else 'Profit is 10,000 so the percentage is 10%.'
            m = 3 if right else 1
            manual[qq['id']] = {'marks': m, 'comment': 'Well done.' if right else 'Profit is divided by cost price.', 'by': 'TEACHER'}
            score += m
        elif qq['type'] in ('fill_blank', 'short_answer'):
            answers[qq['id']] = qq['answer'] if right else 'isosceles'
            score += qq['marks'] if right else 0
        else:
            keys = [o['key'] for o in qq['options']]
            a = qq['answer'] if right else R.choice([k for k in keys if k != qq['answer']])
            answers[qq['id']] = a
            score += qq['marks'] if right else 0
    pct = round(score / total * 100, 2)
    away = R.choice([0, 0, 0, 0, 12, 35])
    sessions.append(dict(id=uid('session', exam['key'], s['id']), exam=exam, student=s, answers=answers, score=score, auto=score - sum(m['marks'] for m in manual.values()),
                         pct=pct, passed=pct >= exam['pass_mark'], manual=manual, away=away, switches=1 if away else 0,
                         order=[qq['id'] for qq in exam['qs']]))
for s in students:
    skill = clamp(s['ability'] / 100 + 0.05, 0.2, 0.95)
    if s['level'] == 'JSS1': sit(EXAMS[1], s, skill)
    if s['level'] == 'SS3':
        sit(EXAMS[2], s, skill)
        if s is not chidinma and R.random() < 0.7: sit(EXAMS[0], s, skill)

# ── JAMB ─────────────────────────────────────────────────────────────────────
JAMB_CHOICES = {
    chidinma['id']: ['English Language', 'Mathematics', 'Physics', 'Chemistry'],
}
SS3 = [s for s in students if s['level'] == 'SS3']
combos = [['English Language', 'Mathematics', 'Physics', 'Chemistry'], ['English Language', 'Mathematics', 'Economics', 'Government'],
          ['English Language', 'Biology', 'Chemistry', 'Physics'], ['English Language', 'Economics', 'Commerce', 'Accounting']]
for s in SS3:
    JAMB_CHOICES.setdefault(s['id'], R.choice(combos))

# ── SQL ──────────────────────────────────────────────────────────────────────
out = []
w = out.append
def avatar(s):
    colors = ['#1a6b4a', '#1e40af', '#7e22ce', '#b45309', '#be185d', '#0f766e']
    c = colors[int(s['id'].replace('-', ''), 16) % len(colors)]
    initials = (s['first'][0] + s['last'][0]).upper()
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'>"
           f"<rect width='240' height='240' fill='{c}'/><circle cx='120' cy='96' r='48' fill='rgba(255,255,255,0.85)'/>"
           f"<path d='M40 240c0-52 36-84 80-84s80 32 80 84z' fill='rgba(255,255,255,0.85)'/>"
           f"<text x='120' y='112' font-family='Arial,sans-serif' font-size='40' font-weight='700' text-anchor='middle' fill='{c}'>{initials}</text></svg>")
    import base64
    return 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()

STAFF_ID = {k: uid('staff', k) for k, *_ in STAFF}

w(open(os.path.join(HERE, 'header.sql')).read())
w("DO $demo$")
w("DECLARE")
w(f"  v_school uuid := '{SCHOOL}';")
w("  v_today date := current_date;")
w("  v_cur_start date := current_date - 35;")
w("  v_year int := extract(year from current_date)::int;")
w("  v_cur_session text; v_prev_session text;")
w("  v_pw text;")
w("  t record; tn text; pass int := 0; progress boolean; todo text[]; retry text[]; last_err text := '';")
w("  n bigint;")
w("BEGIN")
w("""  -- Safety: never touch a real school
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'is_demo') THEN
    RAISE EXCEPTION 'Run migration 022_demo_school.sql first.';
  END IF;
  IF EXISTS (SELECT 1 FROM schools WHERE subdomain = 'demo' AND id <> v_school) THEN
    RAISE EXCEPTION 'Another school already uses the address "demo". Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM schools WHERE id = v_school AND NOT is_demo) THEN
    RAISE EXCEPTION 'The demo school id belongs to a real school. Nothing was changed.';
  END IF;
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL AND to_regprocedure('public.crypt(text,text)') IS NULL THEN
    RAISE EXCEPTION 'The pgcrypto extension is needed (it is on by default in Supabase).';
  END IF;
  PERFORM set_config('search_path', 'public, extensions', true);
""")
# school row (upsert)
w(f"""  INSERT INTO schools (id, name, subdomain, address, phone, email, subscription_tier, max_students, is_active,
                       sections, is_demo, finance_approval_threshold, payment_preference, subscription_expires_at)
  VALUES (v_school, 'Navura Demo College', '{SUB}', '14 Adeola Odeku Street, Victoria Island, Lagos', '07000000100',
          'office@{DOMAIN}', 'premium', 1000, true, ARRAY['secondary'], true, 20000, 'direct', now() + interval '10 years')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subdomain = EXCLUDED.subdomain, address = EXCLUDED.address,
    phone = EXCLUDED.phone, email = EXCLUDED.email, subscription_tier = 'premium', max_students = 1000, is_active = true,
    sections = EXCLUDED.sections, is_demo = true, finance_approval_threshold = 20000, logo_url = NULL,
    subscription_expires_at = EXCLUDED.subscription_expires_at;
""")
# wipe
w("""  -- ── Clear everything the demo school holds ─────────────────────────────
  PERFORM set_config('examify.demo_reset', 'on', true);
  -- rows that point at the demo school's people from tables without a school_id
  FOR t IN
    SELECT cl.relname AS tbl, a.attname AS col
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
    WHERE co.contype = 'f' AND ns.nspname = 'public' AND array_length(co.conkey, 1) = 1
      AND co.confrelid = 'public.users'::regclass
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                      WHERE ic.table_schema = 'public' AND ic.table_name = cl.relname AND ic.column_name = 'school_id')
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM users WHERE school_id = $1)', t.tbl, t.col) USING v_school;
  END LOOP;
  SELECT array_agg(c.table_name::text) INTO todo FROM information_schema.columns c
  JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'school_id' AND c.table_name <> 'users';
  todo := todo || ARRAY['users'];
  LOOP
    pass := pass + 1; progress := false; retry := '{}';
    FOREACH tn IN ARRAY todo LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE school_id = $1', tn) USING v_school;
        progress := true;
      EXCEPTION WHEN foreign_key_violation THEN
        retry := retry || tn; last_err := SQLERRM;
      END;
    END LOOP;
    EXIT WHEN cardinality(retry) = 0;
    IF NOT progress OR pass > 25 THEN
      RAISE EXCEPTION 'Could not clear the demo school: %. Nothing was changed.', last_err;
    END IF;
    todo := retry;
  END LOOP;
  PERFORM set_config('examify.demo_reset', 'off', true);

  -- ── Build it again ─────────────────────────────────────────────────────
  v_pw := crypt('""" + PASSWORD + """', gen_salt('bf', 10));
  IF extract(month from v_today) >= 8 THEN
    v_cur_session := v_year || '/' || (v_year + 1); v_prev_session := (v_year - 1) || '/' || v_year;
  ELSE
    v_cur_session := (v_year - 1) || '/' || v_year; v_prev_session := (v_year - 2) || '/' || (v_year - 1);
  END IF;
""")
SESS_PREV, SESS_CUR = uid('session', 'prev'), uid('session', 'cur')
w(f"""  INSERT INTO academic_sessions (id, school_id, name, is_active) VALUES
    ('{SESS_PREV}', v_school, v_prev_session, false), ('{SESS_CUR}', v_school, v_cur_session, true);""")
w("  INSERT INTO terms (id, school_id, session_id, name, term_number, start_date, end_date, is_active) VALUES")
w(",\n".join(f"    ('{TERM_ID[k]}', v_school, '{SESS_PREV if ss == 'prev' else SESS_CUR}', {q(nm)}, {num}, {a}, {b}, {'true' if k == 'cur' else 'false'})"
             for k, ss, nm, num, a, b in TERMS) + ";")
w("""  INSERT INTO result_configs (school_id, ca_weight, exam_weight, show_position) VALUES (v_school, 40, 60, true);
  INSERT INTO curriculum_settings (school_id, curriculum_type, academic_year) VALUES (v_school, 'nigerian', v_cur_session);""")

# curriculum subjects
cs_rows = []
for i, sj in enumerate(['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Civic Education', 'Computer Studies', 'Physics', 'Chemistry', 'Biology', 'Economics']):
    levels = [c[0] for c in CLASSES if sj in subjects_for(c[0])]
    cat = 'core' if sj in ('English Language', 'Mathematics', 'Civic Education') else 'elective'
    cs_rows.append(f"    ('{uid('cs', sj)}', v_school, {q(sj)}, {q(SUBJ_CODE[sj])}, ARRAY[{', '.join(q(l) for l in levels)}], '{cat}', 'nigerian', true, {i + 1})")
w("  INSERT INTO curriculum_subjects (id, school_id, name, code, class_levels, category, curriculum_type, is_active, sort_order) VALUES\n" + ",\n".join(cs_rows) + ";")

# users
urows = []
for k, role, name, local, phone in STAFF:
    urows.append(f"    ('{STAFF_ID[k]}', v_school, '{role}', '{local}@{DOMAIN}', '{phone}', {q(name)}, v_pw, NULL, NULL, NULL, NULL, NULL, false)")
for s in students:
    dob_years = {'JSS1': 11, 'JSS2': 12, 'SS1': 14, 'SS3': 16}[s['level']]
    dob = f"v_today - {dob_years * 365 + R.randint(0, 300)}"
    urows.append(f"    ('{s['id']}', v_school, 'student', {q(s['email'])}, NULL, {q(s['name'])}, v_pw, {q(s['adm'])}, {q(s['level'])}, {q(s['arm'])}, NULL, {q(avatar(s)) if s['photo'] else 'NULL'}, false)")
    s['dob'] = dob
for p in parents:
    kids = ', '.join(f"'{k['id']}'" for k in p['kids'])
    urows.append(f"    ('{p['id']}', v_school, 'parent', {q(p['email'])}, {q(p['phone'])}, {q(p['name'])}, v_pw, NULL, NULL, NULL, ARRAY[{kids}]::uuid[], NULL, false)")
w("  INSERT INTO users (id, school_id, role, email, phone, full_name, password_hash, admission_no, class_level, class_arm, parent_of, photo_url, must_change_password) VALUES\n" + ",\n".join(urows) + ";")
w("  UPDATE users SET date_of_birth = d.dob FROM (VALUES\n" + ",\n".join(f"    ('{s['id']}'::uuid, ({s['dob']})::date)" for s in students) + "\n  ) AS d(id, dob) WHERE users.id = d.id;")

prow = []
for s in students:
    p = parent_of[s['id']]
    prow.append(f"    (v_school, '{s['id']}', ({s['dob']})::date, {q(s['gender'].lower())}, 'Nigerian', {q(R.choice(STATES))}, {q(str(R.randint(2, 48)) + ' ' + R.choice(['Allen Avenue, Ikeja', 'Ogunlana Drive, Surulere', 'Admiralty Way, Lekki', 'Isaac John Street, GRA Ikeja', 'Bode Thomas Street, Surulere', 'Opebi Road, Ikeja']) + ', Lagos')}, {q(s['level'])}, {q(p['name'])}, {q(p['phone'])}, {q(p['rel'])})")
w("  INSERT INTO student_profiles (school_id, student_id, date_of_birth, gender, nationality, state_of_origin, home_address, entry_class, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship) VALUES\n" + ",\n".join(prow) + ";")
w("  INSERT INTO parent_student_links (school_id, parent_id, student_id, relationship) VALUES\n" + ",\n".join(
    f"    (v_school, '{p['id']}', '{k['id']}', {q(p['rel'])})" for p in parents for k in p['kids']) + ";")
w("  INSERT INTO class_teachers (school_id, teacher_id, class_level, class_arm) VALUES\n" + ",\n".join(
    f"    (v_school, '{STAFF_ID[t]}', '{lvl}', 'A')" for lvl, t in CLASS_TEACHER.items()) + ";")
w("  INSERT INTO teacher_subject_assignments (school_id, teacher_id, class_level, class_arm, subject) VALUES\n" + ",\n".join(
    f"    (v_school, '{STAFF_ID[t]}', '{lvl}', 'A', {q(sj)})" for t, pairs in TEACHES.items() for lvl, sj in pairs) + ";")

# results
def approved(tk): return f"({dict(t1='v_cur_start - 230', t2='v_cur_start - 125', t3='v_cur_start - 27', cur='v_today - 2')[tk]})::timestamptz"
rrows = []
for r in results:
    rrows.append(f"    (v_school, '{TERM_ID[r['term']]}', '{r['student']['id']}', {q(r['subject'])}, {r['ca']}, {r['exam']}, '{r['grade']}', {q(r['remark'])}, {q(r['comment'])}, '{STAFF_ID[r['teacher']]}', {repr(STAFF_ID['admin'])}, {approved(r['term'])})")
w("  INSERT INTO student_results (school_id, term_id, student_id, subject, ca_score, exam_score, grade, remark, teacher_comment, entered_by, approved_by, approved_at) VALUES\n" + ",\n".join(rrows) + ";")

# attendance: generated in SQL from each student's usual rate
arows = ",\n".join(f"    ('{s['id']}'::uuid, '{s['level']}', {s['attendance']}, '{STAFF_ID[CLASS_TEACHER[s['level']]]}'::uuid)" for s in students)
w(f"""  INSERT INTO attendance_records (school_id, term_id, student_id, class_level, class_arm, date, status, marked_by)
  SELECT v_school, tm.id, st.sid, st.lvl, 'A', d::date,
         CASE WHEN (abs(hashtext(st.sid::text || d::date::text)) % 1000) < st.rate * 1000 THEN 'present'
              WHEN (abs(hashtext(d::date::text || st.sid::text)) % 5) = 0 THEN 'late'
              ELSE 'absent' END,
         st.marker
  FROM (VALUES
{arows}
  ) AS st(sid, lvl, rate, marker)
  CROSS JOIN terms tm
  CROSS JOIN LATERAL generate_series(tm.start_date, LEAST(tm.end_date, v_today - 1), interval '1 day') d
  WHERE tm.school_id = v_school AND extract(isodow from d) < 6;""")

# fees
w("  INSERT INTO fee_structures (id, school_id, term_id, class_level, name, amount, is_mandatory) VALUES\n" + ",\n".join(
    f"    ('{f['id']}', v_school, '{TERM_ID[f['term']]}', '{f['level']}', {q(f['name'])}, {f['amount']}, {'true' if f['mand'] else 'false'})" for f in fee_structs) + ";")
erows = []
for s in bus_riders:
    for f in fee_structs:
        if f['level'] == s['level'] and f['name'] == 'School Bus':
            erows.append(f"    (v_school, '{f['id']}', '{s['id']}', '{STAFF_ID['bursar']}')")
w("  INSERT INTO fee_optional_enrollments (school_id, fee_structure_id, student_id, created_by) VALUES\n" + ",\n".join(erows) + ";")

TERM_START = {'t1': 'v_cur_start - 315', 't2': 'v_cur_start - 210', 't3': 'v_cur_start - 105', 'cur': 'v_cur_start'}
prows = []
for i, p in enumerate(payments):
    day_expr = f"LEAST(({TERM_START[p['fee']['term']]}) + {p['day']}, v_today - 1)"
    par = parent_of[p['student']['id']]
    ref = f"'TRF{R.randint(10000000, 99999999)}'" if p['method'] == 'bank_transfer' else 'NULL'
    bank = q(R.choice(['GTBank', 'Access Bank', 'Zenith Bank', 'First Bank', 'UBA'])) if p['method'] == 'bank_transfer' else 'NULL'
    prows.append(f"    ('{p['id']}'::uuid, '{p['fee']['id']}'::uuid, '{p['student']['id']}'::uuid, {p['amount']}, '{p['method']}', ({day_expr})::date, {q(par['name'])}, {bank}, {ref}, {i})")
w("""  CREATE TEMP TABLE _demo_pay ON COMMIT DROP AS
  SELECT * FROM (VALUES
""" + ",\n".join(prows) + """
  ) AS p(id, fee_id, student_id, amount, method, paid_on, payer, bank, ref, ord);
  INSERT INTO fee_payments (id, school_id, fee_structure_id, student_id, amount_paid, payment_method, receipt_number, payment_date,
                            recorded_by, payer_name, payer_bank, transfer_reference, status, created_at)
  SELECT p.id, v_school, p.fee_id, p.student_id, p.amount, p.method,
         'RCP-' || lpad((row_number() OVER (PARTITION BY extract(year from p.paid_on) ORDER BY p.paid_on, p.ord))::text, 5, '0')
                || '-' || extract(year from p.paid_on)::int,
         p.paid_on, '""" + STAFF_ID['bursar'] + """', p.payer, p.bank, p.ref, 'success', p.paid_on + time '10:00' + (p.ord % 300) * interval '1 minute'
  FROM _demo_pay p;
  INSERT INTO receipt_counters (school_id, year, last_no)
  SELECT v_school, extract(year from paid_on)::int, count(*) FROM _demo_pay GROUP BY 1, 2
  ON CONFLICT (school_id, year) DO UPDATE SET last_no = EXCLUDED.last_no;
  INSERT INTO fee_audit_log (school_id, actor_id, actor_role, action, entity_type, entity_id, after_data, via_grant, created_at)
  SELECT v_school, '""" + STAFF_ID['bursar'] + """', 'bursar', 'payment.recorded', 'fee_payment', fp.id,
         jsonb_build_object('studentId', fp.student_id, 'feeStructureId', fp.fee_structure_id, 'amount', fp.amount_paid,
                            'method', fp.payment_method, 'paymentDate', fp.payment_date, 'receiptNo', fp.receipt_number),
         false, fp.created_at
  FROM fee_payments fp WHERE fp.school_id = v_school AND fp.payment_date >= v_cur_start ORDER BY fp.created_at;""")

# questions and exams
qrows_sql = []
for x in ALL_Q:
    qrows_sql.append(f"    ('{x['id']}', v_school, '{STAFF_ID[x['creator']]}', '{x['type']}', {q(x['subject'])}, '{x['level']}', {q(x['topic'])}, {q(x['text'])}, "
                     f"{js(x['options']) if x['options'] else 'NULL'}, {q(x['answer'])}, {q(x['expl'])}, {x['marks']}, '{x['diff']}', true)")
w("  INSERT INTO questions (id, school_id, created_by, type, subject, class_level, topic, question_text, options, correct_answer, explanation, marks, difficulty, is_active) VALUES\n" + ",\n".join(qrows_sql) + ";")
erows = []
for e in EXAMS:
    total = sum(x['marks'] for x in e['qs'])
    ids = ', '.join(f"'{x['id']}'" for x in e['qs'])
    erows.append(f"    ('{e['id']}', v_school, '{STAFF_ID[e['creator']]}', {q(e['title'])}, {q(e['subject'])}, '{e['level']}', ARRAY['A'], {q(e['instructions'])}, "
                 f"{e['duration']}, {total}, {e['pass_mark']}, ARRAY[{ids}]::uuid[], {e['start']}, {e['end']}, '{e['status']}', true, true, true)")
w("  INSERT INTO exams (id, school_id, created_by, title, subject, class_level, class_arms, instructions, duration_minutes, total_marks, pass_mark, question_ids, scheduled_at, ends_at, status, randomise_questions, randomise_options, show_result_after) VALUES\n" + ",\n".join(erows) + ";")
srows = []
for ss in sessions:
    e = ss['exam']
    start = "now() - interval '20 hours'" if e['key'] == 'live' else e['start'].replace("time '09:00'", "time '09:05'").replace("time '10:00'", "time '10:05'")
    manual = {k: dict(v, by=STAFF_ID[e['creator']]) for k, v in ss['manual'].items()}
    order = ', '.join(f"'{x}'" for x in ss['order'])
    manual_sql = js(manual) if manual else "'{}'::jsonb"
    marker_sql = ("'" + STAFF_ID[e['creator']] + "'") if manual else 'NULL'
    marked_at_sql = ("(" + start + ") + interval '2 hours'") if manual else 'NULL'
    passed_sql = 'true' if ss['passed'] else 'false'
    took = R.randint(5, e['duration'] - 1)
    srows.append(f"    ('{ss['id']}', v_school, '{e['id']}', '{ss['student']['id']}', 'submitted', ARRAY[{order}]::uuid[], {js(ss['answers'])}, {ss['score']}, {ss['pct']}, "
                 f"{passed_sql}, ({start}), ({start}) + interval '{took} minutes', ({start}) + interval '{e['duration']} minutes', "
                 f"{ss['switches']}, {ss['away']}, 'complete', {ss['auto']}, {manual_sql}, {marker_sql}, {marked_at_sql})")
w("  INSERT INTO exam_sessions (id, school_id, exam_id, student_id, status, question_order, answers, score, percentage, passed, started_at, submitted_at, server_deadline, tab_switches, time_away_seconds, marking_status, auto_score, manual_marks, marked_by, marked_at) VALUES\n" + ",\n".join(srows) + ";")

# announcements
w(f"""  INSERT INTO announcements (school_id, title, body, audience, posted_by, created_at) VALUES
    (v_school, 'Mid-term break', 'Mid-term break runs from Thursday to the following Monday. Classes resume on Tuesday at 7:45am.', 'all', '{STAFF_ID['admin']}', now() - interval '6 days'),
    (v_school, 'Second instalment of fees', 'Parents are reminded that the balance of this term''s fees is due by the end of the month. You can pay online from the parent portal.', 'parents', '{STAFF_ID['bursar']}', now() - interval '3 days'),
    (v_school, 'Scores for continuous assessment', 'Teachers: please enter all CA scores on Examify by Friday so report cards can be prepared.', 'teachers', '{STAFF_ID['admin']}', now() - interval '1 day');""")

# JAMB
jrows = []
for s in SS3:
    subs = JAMB_CHOICES[s['id']]
    target = 300 if s is chidinma else R.choice([220, 240, 250, 260, 280])
    quiet = 1 if s is chidinma else (26 if s is struggling else R.randint(0, 12))
    attempted = 180 if s is chidinma else R.randint(15, 160)
    correct = int(attempted * clamp(s['ability'] / 100 + 0.05, 0.3, 0.9))
    names = ', '.join(q(x) for x in subs)
    jrows.append(f"""  INSERT INTO jamb_student_profiles (school_id, student_id, selected_subjects, target_score, exam_date, daily_goal_questions,
      current_streak, longest_streak, last_study_date, total_questions_attempted, total_correct, total_xp)
  SELECT v_school, '{s['id']}', ARRAY(SELECT id FROM jamb_subjects WHERE name IN ({names}) ORDER BY is_compulsory DESC, name), {target},
      v_today + 190, 20, {6 if s is chidinma else R.randint(0, 4)}, {12 if s is chidinma else R.randint(2, 9)}, v_today - {quiet}, {attempted}, {correct}, {correct * 10};
  INSERT INTO jamb_topic_progress (school_id, student_id, topic_id, questions_attempted, questions_correct, mastery_pct, last_attempted_at)
  SELECT v_school, '{s['id']}', tp.id, x.att, x.cor, round(x.cor::numeric / x.att * 100), now() - ({quiet} + (abs(hashtext(tp.id::text)) % 9)) * interval '1 day'
  FROM (SELECT jt.id, row_number() OVER (PARTITION BY jt.subject_id ORDER BY jt.id) rn FROM jamb_topics jt
        JOIN jamb_subjects js ON js.id = jt.subject_id WHERE js.name IN ({names})) tp
  CROSS JOIN LATERAL (SELECT 10 AS att, least(10, greatest(1, round({s['ability'] / 10.0} + ((abs(hashtext(tp.id::text || '{s['id']}')) % 5) - 2))))::int AS cor) x
  WHERE tp.rn <= 4;""")
w("\n".join(jrows))
# Finished quick mocks: Chidinma plus a few classmates
mock_students = [chidinma] + [s for s in SS3 if s is not chidinma][:4]
for s in mock_students:
    skill = 0.68 if s is chidinma else clamp(s['ability'] / 100, 0.3, 0.85)
    names = ', '.join(q(x) for x in JAMB_CHOICES[s['id']])
    days = 4 if s is chidinma else R.randint(3, 20)
    w(f"""  WITH subj AS (SELECT id, is_compulsory FROM jamb_subjects WHERE name IN ({names})),
  picks AS (
    SELECT q.subject_id, q.id, q.correct_option,
           row_number() OVER (PARTITION BY q.subject_id ORDER BY md5(q.id::text || '{s['id']}')) AS rn
    FROM jamb_past_questions q JOIN subj ON subj.id = q.subject_id),
  paper AS (
    SELECT p.* FROM picks p JOIN subj ON subj.id = p.subject_id
    WHERE p.rn <= CASE WHEN subj.is_compulsory THEN 15 ELSE 10 END),
  marked AS (
    SELECT paper.*, CASE WHEN (abs(hashtext(paper.id::text || 'ans{s['id']}')) % 100) < {int(skill * 100)}
                         THEN correct_option
                         ELSE (ARRAY['a','b','c','d'])[(position(correct_option in 'abcd') % 4) + 1] END AS given
    FROM paper),
  per AS (
    SELECT m.subject_id, js.name, count(*) FILTER (WHERE given = correct_option) AS correct, count(*) AS total
    FROM marked m JOIN jamb_subjects js ON js.id = m.subject_id GROUP BY m.subject_id, js.name)
  INSERT INTO jamb_mock_attempts (school_id, student_id, mode, subjects, question_ids, answers, started_at, ends_at, submitted_at,
                                  correct, total, score_by_subject, utme_score)
  SELECT v_school, '{s['id']}', 'short',
         (SELECT array_agg(id ORDER BY is_compulsory DESC) FROM subj),
         (SELECT jsonb_object_agg(subject_id, ids) FROM (SELECT subject_id, jsonb_agg(id ORDER BY rn) ids FROM paper GROUP BY subject_id) z),
         (SELECT jsonb_object_agg(id, given) FROM marked),
         now() - interval '{days} days' - interval '40 minutes', now() - interval '{days} days' - interval '10 minutes',
         now() - interval '{days} days' - interval '12 minutes',
         (SELECT sum(correct) FROM per), (SELECT sum(total) FROM per),
         (SELECT jsonb_agg(jsonb_build_object('subjectId', subject_id, 'name', name, 'correct', correct, 'total', total,
                                               'answered', total, 'score', round(correct::numeric / total * 100)))
            FROM per),
         (SELECT sum(round(correct::numeric / total * 100)) FROM per)
  WHERE (SELECT count(*) FROM subj) = 4;""")

w("""
  RAISE NOTICE 'Demo school ready.';
END $demo$;
""")
w(open(os.path.join(HERE, 'footer.sql')).read())

open(os.path.join(HERE, 'demo-school.sql'), 'w').write("\n".join(out))

# Summary for the guide
summary = dict(
    students=len(students), parents=len(parents), results=len(results), payments=len(payments), questions=len(ALL_Q), sessions=len(sessions),
    accounts=[(role, name, f'{local}@{DOMAIN}') for k, role, name, local, _ in STAFF] +
             [('student (SS3 A)', chidinma['name'], chidinma['email']), ('parent', parents[0]['name'], parents[0]['email'])],
    debtor=daniel['name'], attention=struggling['name'], improver=improver['name'], decliner=decliner['name'], low_att=low_att['name'],
)
json.dump(summary, open(os.path.join(HERE, 'summary.json'), 'w'), indent=1)

# Import spreadsheet: 5 more SS3 Mathematics questions
import csv
rows = [
    ['type', 'subject', 'class_level', 'topic', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'answer', 'explanation', 'marks', 'difficulty'],
    ['mcq', 'Mathematics', 'SS3', 'Indices', 'Evaluate 8^(2/3)', '2', '4', '8', '16', 'B', 'Cube root of 8 is 2; 2² = 4.', '1', 'medium'],
    ['mcq', 'Mathematics', 'SS3', 'Sets', 'If A = {1, 2, 3} and B = {2, 3, 4}, find A ∩ B.', '{1, 4}', '{2, 3}', '{1, 2, 3, 4}', '{ }', 'B', 'Common elements are 2 and 3.', '1', 'easy'],
    ['mcq', 'Mathematics', 'SS3', 'Trigonometry', 'What is sin 30°?', '½', '√3/2', '1', '0', 'A', 'sin 30° = 0.5.', '1', 'easy'],
    ['true_false', 'Mathematics', 'SS3', 'Number bases', '101 in base two is equal to 5 in base ten.', '', '', '', '', 'True', '1×4 + 0×2 + 1 = 5.', '1', 'easy'],
    ['fill_blank', 'Mathematics', 'SS3', 'Mensuration', 'The area of a circle is π multiplied by the ______ squared.', '', '', '', '', 'radius', 'A = πr².', '1', 'easy'],
]
with open(os.path.join(HERE, 'demo-questions-import.csv'), 'w', newline='', encoding='utf-8') as f:
    csv.writer(f).writerows(rows)
print(json.dumps(summary, indent=1))
