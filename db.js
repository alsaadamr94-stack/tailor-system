// db.js — إعداد قاعدة البيانات والمخطط الكامل (Schema)
// نستخدم SQLite (better-sqlite3) لأنها لا تحتاج سيرفر منفصل ويمكن تشغيلها فوراً.
// المخطط مصمم بحيث يمكن نقله لاحقاً بسهولة إلى PostgreSQL (أنواع الأعمدة متوافقة منطقياً).

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'tailor.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- ==========================================================
-- 1. العملاء (Customers)
-- ==========================================================
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  whatsapp      TEXT,
  notify_sms    INTEGER NOT NULL DEFAULT 1,
  notify_wa     INTEGER NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 2. مقاسات العملاء (نسخ متعددة لكل عميل — لاستعادة مقاس سابق)
-- ==========================================================
CREATE TABLE IF NOT EXISTS measurements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label             TEXT NOT NULL DEFAULT 'مقاس أساسي',
  thobe_length      REAL,   -- طول الثوب
  shoulder          REAL,   -- الكتف
  chest             REAL,   -- الصدر
  waist             REAL,   -- الخصر
  sleeve_length     REAL,   -- طول الكم
  sleeve_width      REAL,   -- عرض الكم
  neck              REAL,   -- الرقبة
  bottom_width      REAL,   -- الوسع السفلي
  collar_type       TEXT,   -- نوع الياقة / القلبة
  pocket_type       TEXT,   -- نوع الجيب
  buttons_type      TEXT,   -- نوع الأزرار
  embroidery        TEXT,   -- التطريز
  stitch_type       TEXT,   -- نوع الخياطة (يدوية/مكينة)
  extra_notes       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 3. الأقمشة (Fabrics) — المخزون
-- ==========================================================
CREATE TABLE IF NOT EXISTS fabrics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  color           TEXT,
  unit            TEXT NOT NULL DEFAULT 'meter', -- meter / yard
  stock_qty       REAL NOT NULL DEFAULT 0,
  cost_price      REAL NOT NULL DEFAULT 0,       -- سعر الشراء للوحدة
  sell_price      REAL NOT NULL DEFAULT 0,       -- سعر البيع للوحدة
  min_stock_alert REAL NOT NULL DEFAULT 5,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 4. مستلزمات الخياطة (خيوط، أزرار، حشوات، سحابات...)
-- ==========================================================
CREATE TABLE IF NOT EXISTS supplies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,  -- thread / button / lining / zipper / other
  unit            TEXT NOT NULL DEFAULT 'piece',
  stock_qty       REAL NOT NULL DEFAULT 0,
  min_stock_alert REAL NOT NULL DEFAULT 10,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 5. العمال (القصاص، الخياط، المكوجي...)
-- ==========================================================
CREATE TABLE IF NOT EXISTS workers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,  -- cutter / tailor / presser
  phone          TEXT,
  wage_per_piece REAL NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 6. الطلبات / أوراق العمل (Orders / Work Orders)
-- ==========================================================
CREATE TABLE IF NOT EXISTS orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number           TEXT NOT NULL UNIQUE,  -- رقم تسلسلي + باركود
  customer_id            INTEGER NOT NULL REFERENCES customers(id),
  measurement_id         INTEGER REFERENCES measurements(id),
  fabric_id              INTEGER REFERENCES fabrics(id),
  fabric_qty_used        REAL DEFAULT 0,
  quantity               INTEGER NOT NULL DEFAULT 1,  -- عدد الأثواب في الطلب
  order_date             TEXT NOT NULL DEFAULT (datetime('now')),
  expected_delivery_date TEXT,
  status                 TEXT NOT NULL DEFAULT 'new',
    -- new -> cutting -> sewing -> pressing -> ready -> delivered  (أو modification)
  total_amount           REAL NOT NULL DEFAULT 0,
  deposit_amount         REAL NOT NULL DEFAULT 0,
  discount_amount        REAL NOT NULL DEFAULT 0,
  vat_amount             REAL NOT NULL DEFAULT 0,
  notes                  TEXT,
  is_modification        INTEGER NOT NULL DEFAULT 0,
  modification_reason    TEXT,
  original_order_id      INTEGER REFERENCES orders(id),
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- سجل تتبع تغيّر الحالة (Workflow Tracking)
CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- توزيع المهام على العمال لحساب الأجور بالقطعة
CREATE TABLE IF NOT EXISTS order_tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  worker_id     INTEGER NOT NULL REFERENCES workers(id),
  task_type     TEXT NOT NULL,  -- cutting / sewing / pressing
  wage_amount   REAL NOT NULL DEFAULT 0,
  completed     INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 7. الدفعات (المقدمة + الدفعات عند الاستلام)
-- ==========================================================
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount        REAL NOT NULL,
  method         TEXT NOT NULL DEFAULT 'cash', -- cash / card / transfer
  payment_date  TEXT NOT NULL DEFAULT (datetime('now')),
  note          TEXT
);

-- ==========================================================
-- 8. الفواتير الإلكترونية (ZATCA - المرحلة الثانية)
-- ==========================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id),
  invoice_number    TEXT NOT NULL UNIQUE,
  icv               INTEGER NOT NULL,          -- Invoice Counter Value
  uuid              TEXT NOT NULL,
  previous_hash     TEXT NOT NULL,             -- PIH
  invoice_hash      TEXT NOT NULL,
  qr_base64         TEXT NOT NULL,
  seller_name       TEXT NOT NULL,
  vat_number        TEXT NOT NULL,
  total_amount      REAL NOT NULL,
  vat_amount        REAL NOT NULL,
  zatca_status      TEXT NOT NULL DEFAULT 'pending', -- pending / reported / cleared / failed
  issued_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==========================================================
-- 9. المستخدمون (تسجيل الدخول والصلاحيات)
-- ==========================================================
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff', -- admin / staff
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_measurements_customer ON measurements(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON order_tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_worker ON order_tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- إعدادات المحل (اسم المحل، الرقم الضريبي... تُستخدم في الفوترة)
CREATE TABLE IF NOT EXISTS shop_settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  shop_name    TEXT NOT NULL DEFAULT 'مؤسسة الخياطة الرجالية',
  vat_number   TEXT NOT NULL DEFAULT '300000000000003',
  vat_rate     REAL NOT NULL DEFAULT 0.15,
  phone        TEXT,
  address      TEXT,
  last_icv     INTEGER NOT NULL DEFAULT 0,
  last_hash    TEXT NOT NULL DEFAULT '0'
);
INSERT OR IGNORE INTO shop_settings (id) VALUES (1);
`);

module.exports = db;
