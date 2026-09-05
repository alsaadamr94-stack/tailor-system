const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/customers?search=
router.get('/', (req, res) => {
  const { search } = req.query;
  let rows;
  if (search) {
    rows = db.prepare(
      `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC`
    ).all(`%${search}%`, `%${search}%`);
  } else {
    rows = db.prepare(`SELECT * FROM customers ORDER BY id DESC`).all();
  }
  res.json(rows);
});

// GET /api/customers/:id  (مع مقاساته وطلباته)
router.get('/:id', (req, res) => {
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'العميل غير موجود' });
  const measurements = db.prepare(
    `SELECT * FROM measurements WHERE customer_id = ? ORDER BY id DESC`
  ).all(req.params.id);
  const orders = db.prepare(
    `SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC`
  ).all(req.params.id);
  res.json({ ...customer, measurements, orders });
});

// POST /api/customers
router.post('/', (req, res) => {
  const { name, phone, whatsapp, notify_sms, notify_wa, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'الاسم والهاتف مطلوبان' });
  try {
    const info = db.prepare(
      `INSERT INTO customers (name, phone, whatsapp, notify_sms, notify_wa, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, phone, whatsapp || phone, notify_sms ? 1 : 0, notify_wa ? 1 : 0, notes || null);
    const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(customer);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'رقم الهاتف مسجّل مسبقاً لعميل آخر' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', (req, res) => {
  const { name, phone, whatsapp, notify_sms, notify_wa, notes } = req.body;
  db.prepare(
    `UPDATE customers SET name=?, phone=?, whatsapp=?, notify_sms=?, notify_wa=?, notes=? WHERE id=?`
  ).run(name, phone, whatsapp, notify_sms ? 1 : 0, notify_wa ? 1 : 0, notes || null, req.params.id);
  res.json(db.prepare(`SELECT * FROM customers WHERE id=?`).get(req.params.id));
});

// DELETE /api/customers/:id
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM customers WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- المقاسات ----------

// POST /api/customers/:id/measurements  (حفظ مقاس جديد أو نسخة محدّثة)
router.post('/:id/measurements', (req, res) => {
  const c = req.params.id;
  const m = req.body;
  const info = db.prepare(`
    INSERT INTO measurements
      (customer_id, label, thobe_length, shoulder, chest, waist, sleeve_length,
       sleeve_width, neck, bottom_width, collar_type, pocket_type, buttons_type,
       embroidery, stitch_type, extra_notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    c, m.label || 'مقاس أساسي', m.thobe_length, m.shoulder, m.chest, m.waist,
    m.sleeve_length, m.sleeve_width, m.neck, m.bottom_width, m.collar_type,
    m.pocket_type, m.buttons_type, m.embroidery, m.stitch_type, m.extra_notes
  );
  res.status(201).json(db.prepare(`SELECT * FROM measurements WHERE id=?`).get(info.lastInsertRowid));
});

// GET /api/customers/:id/measurements
router.get('/:id/measurements', (req, res) => {
  res.json(db.prepare(`SELECT * FROM measurements WHERE customer_id=? ORDER BY id DESC`).all(req.params.id));
});

module.exports = router;
