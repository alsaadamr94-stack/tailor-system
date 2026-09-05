// zatca.js — أدوات مساعدة لتوليد عناصر الفاتورة الإلكترونية المبسطة (ZATCA Phase 2)
// ملاحظة: هذا تنفيذ مبسّط (Simplified Invoice - B2C) يغطي:
//   - توليد UUID
//   - عداد الفاتورة (ICV) وربطها بتشفير الفاتورة السابقة (PIH)
//   - بناء QR بصيغة TLV (Tag-Length-Value) ثم Base64
// للانتقال للإنتاج الفعلي يلزم لاحقاً: توليد CSR/CSID مع البوابة الرسمية،
// وتوقيع XML بصيغة UBL 2.1 وإرساله عبر Reporting/Clearance API الحقيقي.

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// يبني عنصر TLV واحد: Tag(1 byte) + Length(1 byte) + Value(UTF-8 bytes)
function tlv(tag, value) {
  const valueBuffer = Buffer.from(String(value), 'utf8');
  const tagBuffer = Buffer.from([tag]);
  const lenBuffer = Buffer.from([valueBuffer.length]);
  return Buffer.concat([tagBuffer, lenBuffer, valueBuffer]);
}

/**
 * يبني QR Code بصيغة TLV/Base64 المطلوبة من ZATCA لفاتورة مبسطة.
 * الحقول: 1) اسم البائع 2) الرقم الضريبي 3) الطابع الزمني (ISO)
 *         4) إجمالي الفاتورة شامل الضريبة 5) قيمة الضريبة
 */
function buildZatcaQr({ sellerName, vatNumber, timestampISO, totalWithVat, vatAmount }) {
  const buffers = [
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, timestampISO),
    tlv(4, Number(totalWithVat).toFixed(2)),
    tlv(5, Number(vatAmount).toFixed(2)),
  ];
  return Buffer.concat(buffers).toString('base64');
}

/**
 * ينشئ فاتورة إلكترونية مبسطة كاملة (بدون اتصال فعلي بالهيئة — جاهزة للربط لاحقاً)
 */
function generateInvoice({ shopSettings, order }) {
  const uuid = uuidv4();
  const icv = shopSettings.last_icv + 1;
  const previousHash = shopSettings.last_hash;
  const timestampISO = new Date().toISOString();

  const totalWithVat = order.total_amount;
  const vatAmount = order.vat_amount;

  const qrBase64 = buildZatcaQr({
    sellerName: shopSettings.shop_name,
    vatNumber: shopSettings.vat_number,
    timestampISO,
    totalWithVat,
    vatAmount,
  });

  // تجزئة الفاتورة الحالية (مبسّط: نجمّع الحقول الأساسية بدل XML UBL كامل)
  const invoiceHash = sha256(
    `${uuid}|${icv}|${previousHash}|${timestampISO}|${totalWithVat}|${vatAmount}`
  );

  const invoiceNumber = `INV-${String(icv).padStart(6, '0')}`;

  return {
    invoiceNumber,
    uuid,
    icv,
    previousHash,
    invoiceHash,
    qrBase64,
    timestampISO,
  };
}

module.exports = { buildZatcaQr, generateInvoice, sha256 };
