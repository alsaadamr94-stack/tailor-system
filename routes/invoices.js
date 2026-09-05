const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateInvoice } = require('../utils/zatca');

// GET /api/invoices
router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT i.*, o.order_number, c.name AS customer_name
    FROM invoices i
    JOIN orders o ON o.id = i.order_id
    JOIN customers c ON c.id = o.customer_id
    ORDER BY i.id DESC
  `).all());
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const invoice = db.prepare(`SELECT * FROM invoices WHERE id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  res.json(invoice);
});

// POST /api/invoices/generate  { order_id }
// يولّد فاتورة إلكترونية مبسطة متوافقة هيكلياً مع متطلبات ZATCA المرحلة الثانية
// (UUID, ICV متسلسل، PIH، QR بصيغة TLV/Base64). راجع README لخطوات الربط الفعلي بالهيئة.
router.post('/generate', (req, res) => {
  const { order_id } = req.body;
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(order_id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

  const existing = db.prepare(`SELECT * FROM invoices WHERE order_id=?`).get(order_id);
  if (existing) return res.status(409).json({ error: 'تم إصدار فاتورة لهذا الطلب مسبقاً', invoice: existing });

  const settings = db.prepare(`SELECT * FROM shop_settings WHERE id=1`).get();

  const tx = db.transaction(() => {
    const gen = generateInvoice({ shopSettings: settings, order });

    db.prepare(`
      INSERT INTO invoices
        (order_id, invoice_number, icv, uuid, previous_hash, invoice_hash, qr_base64,
         seller_name, vat_number, total_amount, vat_amount)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      order_id, gen.invoiceNumber, gen.icv, gen.uuid, gen.previousHash, gen.invoiceHash,
      gen.qrBase64, settings.shop_name, settings.vat_number, order.total_amount, order.vat_amount
    );

    db.prepare(`UPDATE shop_settings SET last_icv=?, last_hash=? WHERE id=1`)
      .run(gen.icv, gen.invoiceHash);

    return gen.invoiceNumber;
  });

  try {
    const invoiceNumber = tx();
    res.status(201).json(db.prepare(`SELECT * FROM invoices WHERE invoice_number=?`).get(invoiceNumber));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET/PUT إعدادات المحل (اسم المحل، الرقم الضريبي...)
router.get('/settings/shop', (req, res) => {
  res.json(db.prepare(`SELECT * FROM shop_settings WHERE id=1`).get());
});
router.put('/settings/shop', (req, res) => {
  const { shop_name, vat_number, vat_rate, phone, address } = req.body;
  db.prepare(`
    UPDATE shop_settings SET shop_name=?, vat_number=?, vat_rate=?, phone=?, address=? WHERE id=1
  `).run(shop_name, vat_number, vat_rate, phone, address);
  res.json(db.prepare(`SELECT * FROM shop_settings WHERE id=1`).get());
});

module.exports = router;
