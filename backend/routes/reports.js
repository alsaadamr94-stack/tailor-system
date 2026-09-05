const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/reports/dashboard  — ملخص سريع للوحة التحكم
router.get('/dashboard', (req, res) => {
  const totalOrders = db.prepare(`SELECT COUNT(*) c FROM orders`).get().c;
  const activeOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status != 'delivered'`).get().c;
  const readyOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status = 'ready'`).get().c;
  const totalSales = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM payments`).get().s;
  const totalDueAmount = db.prepare(`
    SELECT COALESCE(SUM(o.total_amount),0) - COALESCE((SELECT SUM(amount) FROM payments),0) AS s
    FROM orders o`).get().s;
  const byStatus = db.prepare(`SELECT status, COUNT(*) c FROM orders GROUP BY status`).all();
  const lowStockFabrics = db.prepare(`SELECT COUNT(*) c FROM fabrics WHERE stock_qty <= min_stock_alert`).get().c;
  const customersCount = db.prepare(`SELECT COUNT(*) c FROM customers`).get().c;

  res.json({
    totalOrders, activeOrders, readyOrders, totalSales,
    totalDueAmount, byStatus, lowStockFabrics, customersCount,
  });
});

// GET /api/reports/sales?from=&to=
router.get('/sales', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT p.*, o.order_number, c.name AS customer_name
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             JOIN customers c ON c.id = o.customer_id
             WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND date(p.payment_date) >= date(?)`; params.push(from); }
  if (to) { sql += ` AND date(p.payment_date) <= date(?)`; params.push(to); }
  sql += ` ORDER BY p.payment_date DESC`;
  const rows = db.prepare(sql).all(...params);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  res.json({ rows, total });
});

// GET /api/reports/fabric-profit  — أرباح الأقمشة (سعر البيع - سعر الشراء) × الاستهلاك
router.get('/fabric-profit', (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.name, f.color, f.cost_price, f.sell_price,
           COALESCE(SUM(o.fabric_qty_used), 0) AS total_used,
           COALESCE(SUM(o.fabric_qty_used), 0) * (f.sell_price - f.cost_price) AS estimated_profit
    FROM fabrics f
    LEFT JOIN orders o ON o.fabric_id = f.id
    GROUP BY f.id
    ORDER BY estimated_profit DESC
  `).all();
  res.json(rows);
});

// GET /api/reports/worker-dues  — إنتاجية ومستحقات جميع العمال
router.get('/worker-dues', (req, res) => {
  const rows = db.prepare(`
    SELECT w.id, w.name, w.role,
           COUNT(ot.id) AS total_tasks,
           SUM(CASE WHEN ot.completed=1 THEN 1 ELSE 0 END) AS completed_tasks,
           COALESCE(SUM(CASE WHEN ot.completed=1 THEN ot.wage_amount ELSE 0 END), 0) AS total_due,
           COALESCE(SUM(CASE WHEN ot.completed=0 THEN ot.wage_amount ELSE 0 END), 0) AS pending_amount
    FROM workers w
    LEFT JOIN order_tasks ot ON ot.worker_id = w.id
    GROUP BY w.id
    ORDER BY total_due DESC
  `).all();
  res.json(rows);
});

// GET /api/reports/vat  — تقرير ضريبة القيمة المضافة
router.get('/vat', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT order_number, order_date, total_amount, vat_amount FROM orders WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND date(order_date) >= date(?)`; params.push(from); }
  if (to) { sql += ` AND date(order_date) <= date(?)`; params.push(to); }
  const rows = db.prepare(sql).all(...params);
  const totalVat = rows.reduce((s, r) => s + (r.vat_amount || 0), 0);
  res.json({ rows, totalVat });
});

module.exports = router;
