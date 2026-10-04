
-- What was built
SELECT 'students' AS item, count(*)::text AS value FROM users WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo') AND role = 'student'
UNION ALL SELECT 'staff and parents', count(*)::text FROM users WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo') AND role <> 'student'
UNION ALL SELECT 'results', count(*)::text FROM student_results WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo')
UNION ALL SELECT 'attendance marks', count(*)::text FROM attendance_records WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo')
UNION ALL SELECT 'fee payments', count(*)::text FROM fee_payments WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo')
UNION ALL SELECT 'JAMB mocks', count(*)::text FROM jamb_mock_attempts WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo')
UNION ALL SELECT 'open exam ends', to_char(max(ends_at), 'DD Mon YYYY HH24:MI') FROM exams WHERE school_id = (SELECT id FROM schools WHERE subdomain = 'demo') AND status = 'active';
