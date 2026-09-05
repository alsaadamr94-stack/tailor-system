// auth.js — تشفير كلمات المرور وإصدار/التحقق من رموز الدخول (JWT)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// يُفضّل ضبط متغير بيئة JWT_SECRET عند النشر الفعلي؛ هذه القيمة الافتراضية كافية للتشغيل المحلي.
const JWT_SECRET = process.env.JWT_SECRET || 'tailor-system-local-secret-change-me';
const TOKEN_TTL = '30d';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحية المدير' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, authMiddleware, requireAdmin };
