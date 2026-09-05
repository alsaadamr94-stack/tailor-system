const express = require('express');
const router = express.Router();
const db = require('../db');

const STATUS_FLOW = ['new', 'cutting', 'sewing', 'pressing', 'ready', 'delivered'];
const STATUS_LABELS_AR = {
  new: 'جديد',
  cutting: 'قيد القص',
  sewing: 'قيد الخياطة',
  pressing: 'مرحلة الكوي',
  ready: 'جاهز للاستلام',
  delivered: 'تم التسليم',
  modification: 'تعديل',
};

function nextOrderNumber() {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM orders`).get();
  const seq = row.c + 1;
  const year = new Date().getFullYear();
  return `WO-${year}-${String(seq).padStart(5, '0')}`;
}

// حساب تاريخ الاستلام المتوقع تلقائياً بناءً على ضغط العمل
// (عدد الطلبات النشطة حالياً × متوسط أيام التنفيذ لكل طلب)
function estimateDeliveryDate() {
  const active = db.prepare(
    `SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('delivered')`
  ).get().c;
  const AVG_DAYS_PER_ORDER = 0.7; // كل طلب نشط يضيف ~0.7 يوم ضغط عمل
  const BASE_DAYS = 3; // الحد الأدنى لتنفيذ ثوب واحد
  const days = Math.ceil(BASE_DAYS + active * AVG_DAYS_PER_ORDER);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

router.get('/meta/status-labels', (req, res) => res.json(STATUS_LABELS_AR));

// GET /api/orders?status=&customer_id=&search=
router.get('/', (req, res) => {
  const { status, customer_id, search } = req.query;
  let sql = `
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
           f.name AS fabric_name,
           (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid_amount
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN fabrics f ON f.id = o.fabric_id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND o.status = ?`; params.push(status); }
  if (customer_id) { sql += ` AND o.customer_id = ?`; params.push(customer_id); }
  if (search) { sql += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ` ORDER BY o.id DESC`;
  res.json(db.prepare(sql).all(...params));
});

// GET /api/orders/:id  (تفاصيل كاملة: عميل، مقاس، مهام، دفعات، سجل الحالة)
router.get('/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
           f.name AS fabric_name, f.color AS fabric_color
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN fabrics f ON f.id = o.fabric_id
    WHERE o.id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

  order.measurement = order.measurement_id
    ? db.prepare(`SELECT * FROM measurements WHERE id=?`).get(order.measurement_id)
    : null;
  order.tasks = db.prepare(`
    SELECT ot.*, w.name AS worker_name, w.role AS worker_role
    FROM order_tasks ot JOIN workers w ON w.id = ot.worker_id
    WHERE ot.order_id = ? ORDER BY ot.id`).all(req.params.id);
  order.payments = db.prepare(`SELECT * FROM payments WHERE order_id=? ORDER BY id`).all(req.params.id);
  order.status_history = db.prepare(`SELECT * FROM order_status_history WHERE order_id=? ORDER BY id`).all(req.params.id);
  order.paid_amount = order.payments.reduce((s, p) => s + p.amount, 0);
  order.remaining_amount = order.total_amount - order.paid_amount;
  res.json(order);
});

// POST /api/orders  — إنشاء طلب جديد (يخصم القماش من المخزون تلقائياً)
router.post('/', (req, res) => {
  const b = req.body;
  if (!b.customer_id || !b.total_amount) {
    return res.status(400).json({ error: 'العميل والمبلغ الإجمالي مطلوبان' });
  }

  const tx = db.transaction(() => {
    // خصم القماش من المخزون
    if (b.fabric_id && b.fabric_qty_used) {
      const fabric = db.prepare(`SELECT * FROM fabrics WHERE id=?`).get(b.fabric_id);
      if (!fabric) throw new Error('القماش غير موجود');
      if (fabric.stock_qty < b.fabric_qty_used) {
        throw new Error(`المخزون غير كافٍ من قماش "${fabric.name}" (المتوفر: ${fabric.stock_qty})`);
      }
      db.prepare(`UPDATE fabrics SET stock_qty = stock_qty - ? WHERE id=?`)
        .run(b.fabric_qty_used, b.fabric_id);
    }

    const orderNumber = nextOrderNumber();
    const deliveryDate = b.expected_delivery_date || estimateDeliveryDate();
    const vat = b.vat_amount ?? Math.round((b.total_amount - (b.discount_amount || 0)) * 0.15 * 100) / 100;

    const info = db.prepare(`
      INSERT INTO orders
        (order_number, customer_id, measurement_id, fabric_id, fabric_qty_used, quantity,
         expected_delivery_date, status, total_amount, deposit_amount, discount_amount,
         vat_amount, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      orderNumber, b.customer_id, b.measurement_id || null, b.fabric_id || null,
      b.fabric_qty_used || 0, b.quantity || 1, deliveryDate, 'new',
      b.total_amount, b.deposit_amount || 0, b.discount_amount || 0, vat, b.notes || null
    );
    const orderId = info.lastInsertRowid;

    db.prepare(`INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'new', 'تم إنشاء الطلب')`)
      .run(orderId);

    if (b.deposit_amount) {
      db.prepare(`INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, 'cash', 'دفعة مقدمة عند إنشاء الطلب')`)
        .run(orderId, b.deposit_amount);
    }

    // توزيع مهام أولية على العمال إن أُرسلت
    if (Array.isArray(b.tasks)) {
      const insertTask = db.prepare(
        `INSERT INTO order_tasks (order_id, worker_id, task_type, wage_amount) VALUES (?,?,?,?)`
      );
      for (const t of b.tasks) insertTask.run(orderId, t.worker_id, t.task_type, t.wage_amount || 0);
    }

    return orderId;
  });

  try {
    const orderId = tx();
    res.status(201).json(db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/orders/:id/status  — تحديث حالة الطلب (تتبع مراحل الإنتاج)
router.patch('/:id/status', (req, res) => {
  const { status, note } = req.body;
  if (!STATUS_LABELS_AR[status]) return res.status(400).json({ error: 'حالة غير صالحة' });
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

  db.prepare(`UPDATE orders SET status=? WHERE id=?`).run(status, req.params.id);
  db.prepare(`INSERT INTO order_status_history (order_id, status, note) VALUES (?,?,?)`)
    .run(req.params.id, status, note || `تغيير الحالة إلى: ${STATUS_LABELS_AR[status]}`);

  res.json(db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id));
});

// POST /api/orders/:id/modification — تسجيل "تعديل على ثوب جاهز"
router.post('/:id/modification', (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'سبب التعديل مطلوب' });
  db.prepare(`UPDATE orders SET status='modification', is_modification=1, modification_reason=? WHERE id=?`)
    .run(reason, req.params.id);
  db.prepare(`INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'modification', ?)`)
    .run(req.params.id, `تعديل: ${reason}`);
  res.json(db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id));
});

// ---------- المهام (توزيع العمل على العمال) ----------

// POST /api/orders/:id/tasks
router.post('/:id/tasks', (req, res) => {
  const { worker_id, task_type, wage_amount } = req.body;
  if (!worker_id || !task_type) return res.status(400).json({ error: 'العامل ونوع المهمة مطلوبان' });
  const info = db.prepare(
    `INSERT INTO order_tasks (order_id, worker_id, task_type, wage_amount) VALUES (?,?,?,?)`
  ).run(req.params.id, worker_id, task_type, wage_amount || 0);
  res.status(201).json(db.prepare(`SELECT * FROM order_tasks WHERE id=?`).get(info.lastInsertRowid));
});

// PATCH /api/orders/tasks/:taskId/complete
router.patch('/tasks/:taskId/complete', (req, res) => {
  db.prepare(`UPDATE order_tasks SET completed=1, completed_at=datetime('now') WHERE id=?`)
    .run(req.params.taskId);
  res.json({ ok: true });
});

// ---------- الدفعات ----------

// POST /api/orders/:id/payments
router.post('/:id/payments', (req, res) => {
  const { amount, method, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'قيمة الدفعة غير صالحة' });
  db.prepare(`INSERT INTO payments (order_id, amount, method, note) VALUES (?,?,?,?)`)
    .run(req.params.id, amount, method || 'cash', note || null);
  const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE order_id=?`)
    .get(req.params.id).s;
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id);
  res.status(201).json({ paid_amount: paid, remaining_amount: order.total_amount - paid });
});

module.exports = router;
