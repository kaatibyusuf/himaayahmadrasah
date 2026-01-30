/* server.js */
require('dotenv').config();
const express = require('express');
const app = express();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

app.use(express.json());
app.use(cors());

// DB pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'himaayah',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helpers
const signToken = (user) => jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET || 'secret123', { expiresIn: '8h' });

async function query(sql, params=[]) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Middleware
async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Auth required' });
  const token = auth.split(' ')[1];
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req,res,next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (req.user.role !== role && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

/* ROUTES */

// Health
app.get('/api/health', (req,res) => res.json({ ok: true }));

// Auth: register (student)
app.post('/api/auth/register', async (req,res) => {
  const { name, email, password, role='student' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const hashed = await bcrypt.hash(password, 10);
  try {
    const r = await query('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)',[name,email,hashed,role]);
    const userId = r.insertId;
    // create student profile row if student
    if (role === 'student') {
      await query('INSERT INTO students(user_id,student_number) VALUES(?,?)',[userId, 'S' + Date.now().toString().slice(-6)]);
    }
    const user = { id: userId, email, role };
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Email exists or DB error' });
  }
});

// Auth: login
app.post('/api/auth/login', async (req,res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing' });
  const rows = await query('SELECT * FROM users WHERE email=?',[email]);
  const user = rows[0];
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Get current user
app.get('/api/me', authMiddleware, async (req,res) => {
  const rows = await query('SELECT id,name,email,role FROM users WHERE id=?',[req.user.id]);
  res.json(rows[0]);
});

/* Students endpoints */
app.get('/api/students', authMiddleware, requireRole('teacher'), async (req,res) => {
  const rows = await query('SELECT s.*, u.email, u.name FROM students s JOIN users u ON s.user_id = u.id');
  res.json(rows);
});
app.get('/api/students/:id', authMiddleware, async (req,res) => {
  const id = req.params.id;
  // students can get their own profile, teachers/admins can get any
  const rows = await query('SELECT s.*, u.email, u.name FROM students s JOIN users u ON s.user_id = u.id WHERE s.id=?',[id]);
  if (!rows[0]) return res.status(404).json({ error:'Not found' });
  if (req.user.role === 'student') {
    // verify mapping
    const urows = await query('SELECT u.id FROM users u WHERE u.id=?',[req.user.id]);
    // if logged in user's id isn't same as the student->user_id then forbid
    const srow = await query('SELECT user_id from students where id=?',[id]);
    if (srow[0] && srow[0].user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error:'Forbidden' });
  }
  res.json(rows[0]);
});

/* Payments */
app.post('/api/payments', authMiddleware, async (req,res) => {
  const { student_id, user_email, purpose, method, amount, reference, meta } = req.body;
  const r = await query('INSERT INTO payments(student_id,user_email,purpose,method,amount,reference,status,meta) VALUES(?,?,?,?,?,?,"SUCCESS",?)',
    [student_id || null, user_email || req.user.email, purpose, method, amount || 0, reference || '', JSON.stringify(meta || {})]);
  const rec = await query('SELECT * FROM payments WHERE id=?',[r.insertId]);
  res.json(rec[0]);
});

app.get('/api/payments', authMiddleware, requireRole('teacher'), async (req,res) => {
  const rows = await query('SELECT p.*, s.student_number, u.email as student_email FROM payments p LEFT JOIN students s ON p.student_id = s.id LEFT JOIN users u ON s.user_id = u.id ORDER BY p.created_at DESC');
  res.json(rows);
});

/* Subjects & exams */
app.get('/api/subjects', authMiddleware, async (req,res) => {
  const rows = await query('SELECT * FROM subjects');
  res.json(rows);
});

app.get('/api/exams', authMiddleware, async (req,res) => {
  const rows = await query('SELECT e.*, s.name_en AS subject_name, c.name as class_name FROM exams e LEFT JOIN subjects s ON e.subject_id=s.id LEFT JOIN classes c ON e.class_id=c.id');
  res.json(rows);
});

app.get('/api/exams/:examId/questions', authMiddleware, async (req,res) => {
  const examId = req.params.examId;
  const rows = await query('SELECT id, question_text, question_text_ar, q_type, options, marks FROM questions WHERE exam_id=?',[examId]);
  res.json(rows);
});

/* Submit exam attempt (student) */
app.post('/api/exams/:examId/submit', authMiddleware, async (req,res) => {
  const examId = req.params.examId;
  const { answers } = req.body; // expected JSON object { questionId: answer, ... }
  // basic save - grading to be done by teacher/admin or automatic for MCQs if available
  // require student profile
  const srows = await query('SELECT id FROM students WHERE user_id=?',[req.user.id]);
  if (!srows[0]) return res.status(403).json({ error: 'Student profile required' });
  const studentId = srows[0].id;
  // store result record
  const r = await query('INSERT INTO results(student_id,exam_id,answers) VALUES(?,?,?)',[studentId, examId, JSON.stringify(answers)]);
  const inserted = await query('SELECT * FROM results WHERE id=?',[r.insertId]);
  res.json({ ok: true, result: inserted[0] });
});

/* Admin grading endpoint - compute marks, grade & save */
app.post('/api/results/:resultId/grade', authMiddleware, requireRole('teacher'), async (req,res) => {
  const resultId = req.params.resultId;
  const { total_marks, percentage, grade } = req.body;
  await query('UPDATE results SET total_marks=?, percentage=?, grade=?, graded_by=?, graded_at=NOW() WHERE id=?',[total_marks, percentage, grade, req.user.id, resultId]);
  const updated = await query('SELECT * FROM results WHERE id=?',[resultId]);
  res.json(updated[0]);
});

/* Export report example (admin) */
app.get('/api/export/student/:studentId/report', authMiddleware, requireRole('teacher'), async (req,res) => {
  const studentId = req.params.studentId;
  const student = await query('SELECT s.*, u.name, u.email FROM students s JOIN users u ON s.user_id = u.id WHERE s.id=?',[studentId]);
  if (!student[0]) return res.status(404).json({ error: 'Not found' });
  const results = await query('SELECT r.*, e.title as exam_title FROM results r LEFT JOIN exams e ON r.exam_id=e.id WHERE r.student_id=?',[studentId]);
  // return JSON — front-end can produce PDF
  res.json({ student: student[0], results });
});

/* Simple admin: create exam/question (teacher/admin) */
app.post('/api/exams', authMiddleware, requireRole('teacher'), async (req,res) => {
  const { title, subject_id, class_id, duration_minutes } = req.body;
  const r = await query('INSERT INTO exams(title,subject_id,class_id,duration_minutes) VALUES(?,?,?,?)',[title,subject_id,class_id,duration_minutes]);
  const exam = await query('SELECT * FROM exams WHERE id=?',[r.insertId]);
  res.json(exam[0]);
});

app.post('/api/exams/:examId/questions', authMiddleware, requireRole('teacher'), async (req,res) => {
  const examId = req.params.examId;
  const { question_text, question_text_ar, q_type, options, answer, marks } = req.body;
  const r = await query('INSERT INTO questions(exam_id,question_text,question_text_ar,q_type,options,answer,marks) VALUES(?,?,?,?,?,?,?)',
    [examId,question_text,question_text_ar,q_type, JSON.stringify(options || null), answer || null, marks || 1]);
  const q = await query('SELECT * FROM questions WHERE id=?',[r.insertId]);
  res.json(q[0]);
});

/* Start server */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Server listening on', PORT));
