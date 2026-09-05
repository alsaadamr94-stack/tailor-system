const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword, signToken, authMiddleware, requireAdmin } = require('../utils/auth');

// POST /api/auth/login  (عام - بدون حماية)
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(String(email).toLowerCase().trim());
  if (!user || !user.active) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// GET /api/auth/me  (يتحقق من صلاحية الجلسة الحالية)
router.get('/me', authMiddleware, (req, res) => res.json(req.user));

// PUT /api/auth/change-password  (أي مستخدم يغيّر كلمة مروره الخاصة)
router.put('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
  if (!verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(new_password), req.user.id);
  res.json({ ok: true });
});

// ---------- إدارة المستخدمين (للمدير فقط) ----------

router.get('/users', authMiddleware, requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT id, name, email, role, active, created_at FROM users ORDER BY id`).all());
});

router.post('/users', authMiddleware, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبة' });
  try {
    const info = db.prepare(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)`
    ).run(name, String(email).toLowerCase().trim(), hashPassword(password), role === 'admin' ? 'admin' : 'staff');
    res.status(201).json(db.prepare(`SELECT id, name, email, role, active FROM users WHERE id=?`).get(info.lastInsertRowid));
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id', authMiddleware, requireAdmin, (req, res) => {
  const { name, role, active, new_password } = req.body;
  db.prepare(`UPDATE users SET name=?, role=?, active=? WHERE id=?`)
    .run(name, role === 'admin' ? 'admin' : 'staff', active ? 1 : 0, req.params.id);
  if (new_password) {
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(new_password), req.params.id);
  }
  res.json(db.prepare(`SELECT id, name, email, role, active FROM users WHERE id=?`).get(req.params.id));
});

router.delete('/users/:id', authMiddleware, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
  db.prepare(`DELETE FROM users WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
