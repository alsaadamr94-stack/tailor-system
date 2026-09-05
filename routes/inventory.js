const express = require('express');
const router = express.Router();
const db = require('../db');

// ---------- الأقمشة ----------
router.get('/fabrics', (req, res) => {
  res.json(db.prepare(`SELECT * FROM fabrics ORDER BY id DESC`).all());
});

router.post('/fabrics', (req, res) => {
  const { name, color, unit, stock_qty, cost_price, sell_price, min_stock_alert } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم القماش مطلوب' });
  const info = db.prepare(`
    INSERT INTO fabrics (name, color, unit, stock_qty, cost_price, sell_price, min_stock_alert)
    VALUES (?,?,?,?,?,?,?)
  `).run(name, color || null, unit || 'meter', stock_qty || 0, cost_price || 0, sell_price || 0, min_stock_alert ?? 5);
  res.status(201).json(db.prepare(`SELECT * FROM fabrics WHERE id=?`).get(info.lastInsertRowid));
});

router.put('/fabrics/:id', (req, res) => {
  const { name, color, unit, stock_qty, cost_price, sell_price, min_stock_alert } = req.body;
  db.prepare(`
    UPDATE fabrics SET name=?, color=?, unit=?, stock_qty=?, cost_price=?, sell_price=?, min_stock_alert=?
    WHERE id=?
  `).run(name, color, unit, stock_qty, cost_price, sell_price, min_stock_alert, req.params.id);
  res.json(db.prepare(`SELECT * FROM fabrics WHERE id=?`).get(req.params.id));
});

// تزويد المخزون (وارد جديد من المورد)
router.post('/fabrics/:id/restock', (req, res) => {
  const { qty } = req.body;
  if (!qty || qty <= 0) return res.status(400).json({ error: 'الكمية غير صالحة' });
  db.prepare(`UPDATE fabrics SET stock_qty = stock_qty + ? WHERE id=?`).run(qty, req.params.id);
  res.json(db.prepare(`SELECT * FROM fabrics WHERE id=?`).get(req.params.id));
});

router.delete('/fabrics/:id', (req, res) => {
  db.prepare(`DELETE FROM fabrics WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- المستلزمات (خيوط، أزرار، حشوات، سحابات) ----------
router.get('/supplies', (req, res) => {
  res.json(db.prepare(`SELECT * FROM supplies ORDER BY id DESC`).all());
});

router.post('/supplies', (req, res) => {
  const { name, type, unit, stock_qty, min_stock_alert } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
  const info = db.prepare(`
    INSERT INTO supplies (name, type, unit, stock_qty, min_stock_alert) VALUES (?,?,?,?,?)
  `).run(name, type, unit || 'piece', stock_qty || 0, min_stock_alert ?? 10);
  res.status(201).json(db.prepare(`SELECT * FROM supplies WHERE id=?`).get(info.lastInsertRowid));
});

router.post('/supplies/:id/restock', (req, res) => {
  const { qty } = req.body;
  if (!qty || qty <= 0) return res.status(400).json({ error: 'الكمية غير صالحة' });
  db.prepare(`UPDATE supplies SET stock_qty = stock_qty + ? WHERE id=?`).run(qty, req.params.id);
  res.json(db.prepare(`SELECT * FROM supplies WHERE id=?`).get(req.params.id));
});

router.delete('/supplies/:id', (req, res) => {
  db.prepare(`DELETE FROM supplies WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// تنبيهات المخزون المنخفض
router.get('/alerts', (req, res) => {
  const fabrics = db.prepare(`SELECT * FROM fabrics WHERE stock_qty <= min_stock_alert`).all();
  const supplies = db.prepare(`SELECT * FROM supplies WHERE stock_qty <= min_stock_alert`).all();
  res.json({ fabrics, supplies });
});

module.exports = router;
