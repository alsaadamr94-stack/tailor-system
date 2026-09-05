const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT * FROM workers ORDER BY id DESC`).all());
});

router.post('/', (req, res) => {
  const { name, role, phone, wage_per_piece } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'الاسم والدور مطلوبان' });
  const info = db.prepare(
    `INSERT INTO workers (name, role, phone, wage_per_piece) VALUES (?,?,?,?)`
  ).run(name, role, phone || null, wage_per_piece || 0);
  res.status(201).json(db.prepare(`SELECT * FROM workers WHERE id=?`).get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, role, phone, wage_per_piece, active } = req.body;
  db.prepare(
    `UPDATE workers SET name=?, role=?, phone=?, wage_per_piece=?, active=? WHERE id=?`
  ).run(name, role, phone, wage_per_piece, active ? 1 : 0, req.params.id);
  res.json(db.prepare(`SELECT * FROM workers WHERE id=?`).get(req.params.id));
});

// مستحقات عامل معين (المهام المكتملة × الأجر)
router.get('/:id/dues', (req, res) => {
  const rows = db.prepare(`
    SELECT ot.*, o.order_number FROM order_tasks ot
    JOIN orders o ON o.id = ot.order_id
    WHERE ot.worker_id = ? ORDER BY ot.id DESC
  `).all(req.params.id);
  const totalDue = rows.filter(r => r.completed).reduce((s, r) => s + r.wage_amount, 0);
  const totalPending = rows.filter(r => !r.completed).reduce((s, r) => s + r.wage_amount, 0);
  res.json({ tasks: rows, total_due: totalDue, total_pending: totalPending });
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM workers WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
