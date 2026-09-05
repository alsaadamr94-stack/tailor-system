// server.js — نقطة تشغيل الخلفية (Backend API)
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const db = require('./db');
const { hashPassword, authMiddleware } = require('./utils/auth');

// ---------- زرع حساب المدير الافتراضي عند أول تشغيل ----------
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'alsaadamr94@gmail.com';
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'Tailor@2026';
const usersCount = db.prepare(`SELECT COUNT(*) c FROM users`).get().c;
if (usersCount === 0) {
  db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,'admin')`)
    .run('المدير', ADMIN_EMAIL.toLowerCase().trim(), hashPassword(ADMIN_DEFAULT_PASSWORD));
  console.log('----------------------------------------------------------');
  console.log('تم إنشاء حساب المدير الافتراضي:');
  console.log(`  البريد الإلكتروني : ${ADMIN_EMAIL}`);
  console.log(`  كلمة المرور       : ${ADMIN_DEFAULT_PASSWORD}`);
  console.log('  الرجاء تسجيل الدخول ثم تغيير كلمة المرور فوراً من الإعدادات.');
  console.log('----------------------------------------------------------');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth')); // تسجيل الدخول عام؛ إدارة المستخدمين محمية داخلياً

// كل ما بعد هذا السطر يتطلب تسجيل دخول صالح
app.use('/api', authMiddleware);

app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/invoices', require('./routes/invoices'));

// تقديم الواجهة الأمامية (Frontend) كملفات ثابتة من نفس السيرفر
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ نظام إدارة محل الخياطة يعمل على: http://localhost:${PORT}`);
});
