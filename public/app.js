const { useState, useEffect, useCallback, useMemo } = React;

// ============================== أدوات مساعدة ==============================
const API = "/api";

function getToken() { return localStorage.getItem("tailor_token") || ""; }
function setToken(t) { t ? localStorage.setItem("tailor_token", t) : localStorage.removeItem("tailor_token"); }
function getStoredUser() { try { return JSON.parse(localStorage.getItem("tailor_user")); } catch { return null; } }
function setStoredUser(u) { u ? localStorage.setItem("tailor_user", JSON.stringify(u)) : localStorage.removeItem("tailor_user"); }

let onUnauthorized = () => {};

async function api(path, opts = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    setToken(null); setStoredUser(null);
    onUnauthorized();
    throw new Error("انتهت الجلسة، الرجاء تسجيل الدخول مجدداً");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ غير متوقع");
  return data;
}

const money = (n) => `${(Number(n) || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const dateAr = (s) => (s ? new Date(s).toLocaleDateString("ar-SA-u-nu-latn", { year: "numeric", month: "short", day: "numeric" }) : "—");

const STATUS_META = {
  new:          { label: "جديد",           color: "#8A8371", bg: "#F1EEE5" },
  cutting:      { label: "قيد القص",        color: "#9C7A2E", bg: "#F6EEDA" },
  sewing:       { label: "قيد الخياطة",      color: "#7C6224", bg: "#F2E7C9" },
  pressing:     { label: "مرحلة الكوي",      color: "#3F5A46", bg: "#E4EBE5" },
  ready:        { label: "جاهز للاستلام",    color: "#215F6B", bg: "#DDEEF0" },
  delivered:    { label: "تم التسليم",       color: "#2E6B3F", bg: "#E1F0E4" },
  modification: { label: "تعديل",           color: "#8A3324", bg: "#F5E0DB" },
};
const STATUS_ORDER = ["new", "cutting", "sewing", "pressing", "ready", "delivered"];

// ============================== عناصر واجهة عامة ==============================
function Badge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return (
    <span
      className="px-2.5 py-1 rounded-sm text-xs font-bold font-display"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}
    >
      {m.label}
    </span>
  );
}

function Panel({ title, sub, actions, children, className = "" }) {
  return (
    <div className={`bg-panel border border-line rounded-md ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            {title && <h3 className="font-display font-bold text-ink text-[15px]">{title}</h3>}
            {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function Btn({ children, variant = "primary", className = "", ...rest }) {
  const styles = {
    primary: "bg-ink text-canvas hover:bg-brassd",
    brass: "bg-brass text-white hover:bg-brassd",
    ghost: "bg-transparent text-ink border border-line hover:border-ink",
    danger: "bg-transparent text-thread border border-thread/40 hover:bg-thread/5",
  };
  return (
    <button
      className={`px-4 py-2 rounded-sm text-sm font-bold font-display transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full border border-line rounded-sm px-3 py-2 text-sm bg-canvas/40 focus:outline-none focus:ring-2 focus:ring-brass/40 focus:border-brass";

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-ink/50 z-40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className={`bg-panel rounded-md border border-line mt-10 mb-10 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rise-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, []);
  if (!msg) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-sm shadow-lg font-bold text-sm rise-in"
      style={{ background: type === "error" ? "#8A3324" : "#171A21", color: "#EEE9DD" }}
    >
      {msg}
    </div>
  );
}

// سياق تنبيهات بسيط (Toast) عبر props drilling خفيف
let toastFn = () => {};
function notify(msg, type = "ok") { toastFn(msg, type); }

// ============================== الشريط الجانبي ==============================
const NAV_BASE = [
  { key: "dashboard", label: "لوحة التحكم", icon: "◆" },
  { key: "orders", label: "الطلبات وأوراق العمل", icon: "▤" },
  { key: "customers", label: "العملاء والمقاسات", icon: "◈" },
  { key: "inventory", label: "المخزون", icon: "▦" },
  { key: "workers", label: "العمال", icon: "✂" },
  { key: "reports", label: "التقارير المالية", icon: "▥" },
];
const NAV_ADMIN = [
  { key: "users", label: "المستخدمون والصلاحيات", icon: "☺" },
  { key: "settings", label: "إعدادات المحل والفوترة", icon: "⚙" },
];

function Sidebar({ page, setPage, user, onLogout }) {
  const nav = user?.role === "admin" ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;
  return (
    <aside className="w-64 shrink-0 bg-ink text-canvas min-h-screen flex flex-col">
      <div className="px-6 py-7 border-b border-white/10">
        <div className="font-display font-extrabold text-2xl text-canvas">مِقياس</div>
        <div className="text-[11px] text-canvas/50 mt-1 tracking-wide">نظام إدارة الخياطة الرجالية</div>
      </div>
      <nav className="flex-1 py-4">
        {nav.map((n) => (
          <button
            key={n.key}
            onClick={() => setPage(n.key)}
            className={`w-full text-right px-6 py-3 text-sm flex items-center gap-3 border-r-2 transition-colors ${
              page === n.key
                ? "bg-white/[0.07] border-brass text-canvas font-bold"
                : "border-transparent text-canvas/60 hover:text-canvas hover:bg-white/[0.03]"
            }`}
          >
            <span className="text-brass w-4 text-center">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-white/10">
        <div className="text-sm font-bold">{user?.name}</div>
        <div className="text-[11px] text-canvas/50 mb-3">{user?.email} · {user?.role === "admin" ? "مدير" : "موظف"}</div>
        <button onClick={onLogout} className="text-[11px] text-brass hover:text-canvas">تسجيل الخروج</button>
      </div>
    </aside>
  );
}

// ============================== تسجيل الدخول ==============================
function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setToken(res.token); setStoredUser(res.user);
      onLoggedIn(res.user);
    } catch (e2) { setErr(e2.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="bg-panel border border-line rounded-md p-8 w-full max-w-sm rise-in">
        <div className="text-center mb-6">
          <div className="font-display font-extrabold text-3xl text-ink">مِقياس</div>
          <div className="text-xs text-muted mt-1">تسجيل الدخول إلى نظام إدارة المحل</div>
        </div>
        <div className="space-y-4">
          <Field label="البريد الإلكتروني">
            <input type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="كلمة المرور">
            <input type="password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <div className="text-xs text-thread font-bold">{err}</div>}
          <Btn variant="brass" className="w-full" disabled={loading}>{loading ? "جارِ الدخول…" : "دخول"}</Btn>
        </div>
      </form>
    </div>
  );
}

// ============================== المستخدمون والصلاحيات ==============================
function UsersPage({ currentUser }) {
  const [list, setList] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(() => { api("/auth/users").then(setList).catch((e) => notify(e.message, "error")); }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-extrabold">المستخدمون والصلاحيات</h2><p className="text-sm text-muted mt-1">حسابات الدخول للكمبيوتر والجوال معاً</p></div>
        <Btn variant="brass" onClick={() => setShowAdd(true)}>+ مستخدم جديد</Btn>
      </div>

      <Panel>
        <table className="w-full text-sm">
          <thead><tr className="text-right text-muted text-xs border-b border-line"><th className="py-2">الاسم</th><th>البريد الإلكتروني</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-line/60">
                <td className="py-3 font-bold font-display">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === "admin" ? "مدير (كل الصلاحيات)" : "موظف (تشغيلي)"}</td>
                <td>{u.active ? <span className="text-sage font-bold">مفعّل</span> : <span className="text-thread">معطّل</span>}</td>
                <td><button className="text-brass text-xs font-bold" onClick={() => setEditUser(u)}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة مستخدم جديد">
        <UserForm onCancel={() => setShowAdd(false)} onSave={async (d) => {
          try { await api("/auth/users", { method: "POST", body: JSON.stringify(d) }); notify("تمت إضافة المستخدم"); setShowAdd(false); load(); }
          catch (e) { notify(e.message, "error"); }
        }} />
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="تعديل المستخدم">
        {editUser && (
          <UserForm
            initial={editUser}
            isSelf={editUser.id === currentUser.id}
            onCancel={() => setEditUser(null)}
            onSave={async (d) => {
              try { await api(`/auth/users/${editUser.id}`, { method: "PUT", body: JSON.stringify(d) }); notify("تم الحفظ"); setEditUser(null); load(); }
              catch (e) { notify(e.message, "error"); }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function UserForm({ initial, isSelf, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...initial, new_password: "" } : { role: "staff", active: true });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label="الاسم"><input className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
      {!initial && <Field label="البريد الإلكتروني"><input type="email" className={inputCls} value={f.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>}
      <Field label="الصلاحية">
        <select className={inputCls} value={f.role} onChange={(e) => set("role", e.target.value)} disabled={isSelf}>
          <option value="staff">موظف (تشغيلي: طلبات، عملاء، مخزون، عمال)</option>
          <option value="admin">مدير (كل الصلاحيات + المستخدمون والإعدادات)</option>
        </select>
      </Field>
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.active} disabled={isSelf} onChange={(e) => set("active", e.target.checked)} /> الحساب مفعّل
        </label>
      )}
      <Field label={initial ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور"}>
        <input type="password" className={inputCls} value={initial ? f.new_password : f.password || ""} onChange={(e) => set(initial ? "new_password" : "password", e.target.value)} />
      </Field>
      <div className="flex gap-2 justify-end pt-2"><Btn variant="ghost" onClick={onCancel}>إلغاء</Btn><Btn onClick={() => onSave(f)}>حفظ</Btn></div>
    </div>
  );
}

// ============================== لوحة التحكم ==============================
function Dashboard({ setPage }) {
  const [d, setD] = useState(null);
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    api("/reports/dashboard").then(setD).catch((e) => notify(e.message, "error"));
    api("/inventory/alerts").then(setAlerts).catch(() => {});
  }, []);

  if (!d) return <div className="text-muted">جارِ التحميل…</div>;

  const stat = (label, value, accent) => (
    <div className="bg-panel border border-line rounded-md p-5">
      <div className="text-xs text-muted font-bold mb-2">{label}</div>
      <div className="font-display text-3xl font-extrabold" style={{ color: accent || "#171A21" }}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-extrabold">لوحة التحكم</h2>
        <p className="text-sm text-muted mt-1">نظرة سريعة على حركة المحل اليوم</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stat("إجمالي الطلبات", d.totalOrders)}
        {stat("طلبات نشطة", d.activeOrders, "#9C7A2E")}
        {stat("جاهزة للاستلام", d.readyOrders, "#215F6B")}
        {stat("عدد العملاء", d.customersCount)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="الوضع المالي">
          <div className="flex justify-between py-2 border-b border-line/70">
            <span className="text-sm text-muted">إجمالي المحصّل</span>
            <span className="font-display font-bold">{money(d.totalSales)}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-muted">مبالغ مستحقة على العملاء</span>
            <span className="font-display font-bold text-thread">{money(d.totalDueAmount)}</span>
          </div>
        </Panel>

        <Panel title="الطلبات حسب المرحلة">
          <div className="space-y-2">
            {STATUS_ORDER.map((s) => {
              const row = d.byStatus.find((r) => r.status === s);
              const c = row ? row.c : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-28 shrink-0"><Badge status={s} /></div>
                  <div className="flex-1 bg-canvas rounded-sm h-2 overflow-hidden">
                    <div className="h-full bg-brass" style={{ width: `${d.totalOrders ? (c / d.totalOrders) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs font-bold w-5 text-left">{c}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {alerts && (alerts.fabrics.length > 0 || alerts.supplies.length > 0) && (
        <Panel title="تنبيهات المخزون المنخفض" actions={<Btn variant="ghost" onClick={() => setPage("inventory")}>إدارة المخزون</Btn>}>
          <div className="grid md:grid-cols-2 gap-4">
            {alerts.fabrics.map((f) => (
              <div key={"f" + f.id} className="flex justify-between text-sm bg-thread/5 border border-thread/20 rounded-sm px-3 py-2">
                <span>قماش: {f.name} {f.color ? `(${f.color})` : ""}</span>
                <span className="font-bold text-thread">{f.stock_qty} {f.unit === "meter" ? "م" : "يارد"} متبقي</span>
              </div>
            ))}
            {alerts.supplies.map((s) => (
              <div key={"s" + s.id} className="flex justify-between text-sm bg-thread/5 border border-thread/20 rounded-sm px-3 py-2">
                <span>مستلزم: {s.name}</span>
                <span className="font-bold text-thread">{s.stock_qty} {s.unit} متبقي</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

// ============================== العملاء والمقاسات ==============================
const MEASURE_FIELDS = [
  ["thobe_length", "طول الثوب"], ["shoulder", "الكتف"], ["chest", "الصدر"],
  ["waist", "الخصر"], ["sleeve_length", "طول الكم"], ["sleeve_width", "عرض الكم"],
  ["neck", "الرقبة"], ["bottom_width", "الوسع السفلي"],
];
const PREF_FIELDS = [
  ["collar_type", "نوع الياقة / القلبة"], ["pocket_type", "نوع الجيب"],
  ["buttons_type", "نوع الأزرار"], ["embroidery", "التطريز"], ["stitch_type", "نوع الخياطة"],
];

function MeasurementForm({ onSave, onCancel }) {
  const [f, setF] = useState({ label: "مقاس أساسي" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-4">
      <Field label="اسم المقاس (مثال: مقاس الصيف / مقاس رسمي)">
        <input className={inputCls} value={f.label || ""} onChange={(e) => set("label", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {MEASURE_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="number" step="0.5" className={inputCls} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="stitch-divider" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PREF_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className={inputCls} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
      </div>
      <Field label="ملاحظات إضافية">
        <textarea className={inputCls} rows="2" value={f.extra_notes || ""} onChange={(e) => set("extra_notes", e.target.value)} />
      </Field>
      <div className="flex gap-2 justify-end pt-2">
        <Btn variant="ghost" onClick={onCancel}>إلغاء</Btn>
        <Btn onClick={() => onSave(f)}>حفظ المقاس</Btn>
      </div>
    </div>
  );
}

function CustomerForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial || { notify_sms: true, notify_wa: true });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-4">
      <Field label="اسم العميل"><input className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="رقم الهاتف"><input className={inputCls} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="رقم واتساب (إن اختلف)"><input className={inputCls} value={f.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.notify_sms} onChange={(e) => set("notify_sms", e.target.checked)} /> تنبيه SMS عند جهوزية الطلب</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.notify_wa} onChange={(e) => set("notify_wa", e.target.checked)} /> تنبيه واتساب</label>
      </div>
      <Field label="ملاحظات"><textarea className={inputCls} rows="2" value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      <div className="flex gap-2 justify-end pt-2">
        <Btn variant="ghost" onClick={onCancel}>إلغاء</Btn>
        <Btn onClick={() => onSave(f)}>{initial ? "حفظ التعديلات" : "إضافة العميل"}</Btn>
      </div>
    </div>
  );
}

function CustomerDetail({ id, onBack }) {
  const [c, setC] = useState(null);
  const [showMeasureForm, setShowMeasureForm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(() => {
    api(`/customers/${id}`).then(setC).catch((e) => notify(e.message, "error"));
  }, [id]);
  useEffect(load, [load]);

  if (!c) return <div className="text-muted">جارِ التحميل…</div>;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink">→ عودة لقائمة العملاء</button>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold">{c.name}</h2>
          <p className="text-sm text-muted mt-1">{c.phone} {c.whatsapp && c.whatsapp !== c.phone ? `· واتساب: ${c.whatsapp}` : ""}</p>
        </div>
        <Btn variant="ghost" onClick={() => setShowEdit(true)}>تعديل بيانات العميل</Btn>
      </div>

      <Panel
        title="المقاسات المحفوظة"
        sub="يمكن حفظ أكثر من مقاس لنفس العميل واستعادته لاحقاً عند طلب جديد"
        actions={<Btn variant="brass" onClick={() => setShowMeasureForm(true)}>+ إضافة مقاس</Btn>}
      >
        {c.measurements.length === 0 ? (
          <p className="text-sm text-muted">لا توجد مقاسات محفوظة بعد.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {c.measurements.map((m) => (
              <div key={m.id} className="border border-line rounded-sm p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-display font-bold text-sm">{m.label}</span>
                  <span className="text-[11px] text-muted">{dateAr(m.created_at)}</span>
                </div>
                <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-xs">
                  {MEASURE_FIELDS.map(([k, label]) => m[k] != null && m[k] !== "" && (
                    <div key={k}><span className="text-muted">{label}: </span><span className="font-bold">{m[k]}</span></div>
                  ))}
                </div>
                {(m.collar_type || m.pocket_type || m.buttons_type || m.embroidery) && (
                  <div className="text-xs text-muted mt-2 pt-2 border-t border-line/70">
                    {[m.collar_type, m.pocket_type, m.buttons_type, m.embroidery].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="سجل الطلبات">
        {c.orders.length === 0 ? (
          <p className="text-sm text-muted">لا توجد طلبات سابقة.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line">
              <th className="py-2">رقم الطلب</th><th>الحالة</th><th>الإجمالي</th><th>تاريخ الطلب</th>
            </tr></thead>
            <tbody>
              {c.orders.map((o) => (
                <tr key={o.id} className="border-b border-line/60">
                  <td className="py-2 font-bold">{o.order_number}</td>
                  <td><Badge status={o.status} /></td>
                  <td>{money(o.total_amount)}</td>
                  <td className="text-muted">{dateAr(o.order_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Modal open={showMeasureForm} onClose={() => setShowMeasureForm(false)} title="إضافة مقاس جديد" wide>
        <MeasurementForm
          onCancel={() => setShowMeasureForm(false)}
          onSave={async (data) => {
            try { await api(`/customers/${id}/measurements`, { method: "POST", body: JSON.stringify(data) }); notify("تم حفظ المقاس"); setShowMeasureForm(false); load(); }
            catch (e) { notify(e.message, "error"); }
          }}
        />
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="تعديل بيانات العميل">
        <CustomerForm
          initial={c}
          onCancel={() => setShowEdit(false)}
          onSave={async (data) => {
            try { await api(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }); notify("تم الحفظ"); setShowEdit(false); load(); }
            catch (e) { notify(e.message, "error"); }
          }}
        />
      </Modal>
    </div>
  );
}

function CustomersPage() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    api(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`).then(setList).catch((e) => notify(e.message, "error"));
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  if (openId) return <CustomerDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold">العملاء والمقاسات</h2>
          <p className="text-sm text-muted mt-1">سجل شامل لكل عميل ومقاساته وتفضيلاته</p>
        </div>
        <Btn variant="brass" onClick={() => setShowAdd(true)}>+ عميل جديد</Btn>
      </div>

      <input
        className={inputCls + " max-w-sm"}
        placeholder="بحث بالاسم أو رقم الهاتف…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Panel>
        <table className="w-full text-sm">
          <thead><tr className="text-right text-muted text-xs border-b border-line">
            <th className="py-2">الاسم</th><th>الهاتف</th><th>ملاحظات</th><th>تاريخ التسجيل</th><th></th>
          </tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-line/60 hover:bg-canvas/40 cursor-pointer" onClick={() => setOpenId(c.id)}>
                <td className="py-3 font-bold font-display">{c.name}</td>
                <td>{c.phone}</td>
                <td className="text-muted truncate max-w-xs">{c.notes || "—"}</td>
                <td className="text-muted">{dateAr(c.created_at)}</td>
                <td className="text-brass text-left">فتح ←</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-muted">لا يوجد عملاء بعد</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة عميل جديد">
        <CustomerForm
          onCancel={() => setShowAdd(false)}
          onSave={async (data) => {
            try { await api("/customers", { method: "POST", body: JSON.stringify(data) }); notify("تمت إضافة العميل"); setShowAdd(false); load(); }
            catch (e) { notify(e.message, "error"); }
          }}
        />
      </Modal>
    </div>
  );
}

// ============================== الطلبات وأوراق العمل ==============================
function NewOrderForm({ onCreated, onCancel }) {
  const [customers, setCustomers] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [measurements, setMeasurements] = useState([]);
  const [f, setF] = useState({ quantity: 1, tasks: [] });
  const [newMeasure, setNewMeasure] = useState(false);
  const [measureData, setMeasureData] = useState({ label: "مقاس أساسي" });

  useEffect(() => {
    api("/customers").then(setCustomers);
    api("/inventory/fabrics").then(setFabrics);
    api("/workers").then(setWorkers);
  }, []);

  useEffect(() => {
    if (customerId) api(`/customers/${customerId}/measurements`).then(setMeasurements);
    else setMeasurements([]);
  }, [customerId]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fabric = fabrics.find((x) => String(x.id) === String(f.fabric_id));

  const addTask = () => set("tasks", [...(f.tasks || []), { worker_id: "", task_type: "cutting", wage_amount: "" }]);
  const updTask = (i, k, v) => { const t = [...f.tasks]; t[i] = { ...t[i], [k]: v }; set("tasks", t); };
  const rmTask = (i) => set("tasks", f.tasks.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!customerId || !f.total_amount) return notify("العميل والمبلغ الإجمالي مطلوبان", "error");
    try {
      let measurement_id = f.measurement_id;
      if (newMeasure) {
        const saved = await api(`/customers/${customerId}/measurements`, { method: "POST", body: JSON.stringify(measureData) });
        measurement_id = saved.id;
      }
      const payload = { ...f, customer_id: customerId, measurement_id };
      const order = await api("/orders", { method: "POST", body: JSON.stringify(payload) });
      notify(`تم إنشاء الطلب رقم ${order.order_number}`);
      onCreated(order);
    } catch (e) { notify(e.message, "error"); }
  };

  return (
    <div className="space-y-5">
      <Field label="العميل">
        <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">اختر العميل…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
        </select>
      </Field>

      {customerId && (
        <div className="border border-line rounded-sm p-4 bg-canvas/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-muted">المقاس</span>
            <label className="text-xs flex items-center gap-1">
              <input type="checkbox" checked={newMeasure} onChange={(e) => setNewMeasure(e.target.checked)} /> إدخال مقاس جديد
            </label>
          </div>
          {!newMeasure ? (
            <select className={inputCls} value={f.measurement_id || ""} onChange={(e) => set("measurement_id", e.target.value)}>
              <option value="">— بدون مقاس محدد —</option>
              {measurements.map((m) => <option key={m.id} value={m.id}>{m.label} ({dateAr(m.created_at)})</option>)}
            </select>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MEASURE_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <input type="number" step="0.5" className={inputCls} value={measureData[k] || ""} onChange={(e) => setMeasureData((s) => ({ ...s, [k]: e.target.value }))} />
                </Field>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="القماش المستخدم">
          <select className={inputCls} value={f.fabric_id || ""} onChange={(e) => set("fabric_id", e.target.value)}>
            <option value="">— بدون —</option>
            {fabrics.map((fb) => <option key={fb.id} value={fb.id}>{fb.name} {fb.color ? `(${fb.color})` : ""} — متوفر {fb.stock_qty}</option>)}
          </select>
        </Field>
        <Field label={`الكمية المستهلكة ${fabric ? `(${fabric.unit === "meter" ? "متر" : "يارد"})` : ""}`}>
          <input type="number" step="0.1" className={inputCls} value={f.fabric_qty_used || ""} onChange={(e) => set("fabric_qty_used", e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="عدد الأثواب"><input type="number" min="1" className={inputCls} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
        <Field label="الإجمالي (شامل الضريبة)"><input type="number" step="0.01" className={inputCls} value={f.total_amount || ""} onChange={(e) => set("total_amount", e.target.value)} /></Field>
        <Field label="الدفعة المقدمة"><input type="number" step="0.01" className={inputCls} value={f.deposit_amount || ""} onChange={(e) => set("deposit_amount", e.target.value)} /></Field>
      </div>

      <Field label="تاريخ الاستلام المتوقع" hint="اتركه فارغاً ليُحسب تلقائياً بناءً على ضغط العمل الحالي">
        <input type="date" className={inputCls} value={f.expected_delivery_date || ""} onChange={(e) => set("expected_delivery_date", e.target.value)} />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted">توزيع المهام على العمال (اختياري)</span>
          <button onClick={addTask} className="text-xs text-brass font-bold">+ إضافة مهمة</button>
        </div>
        <div className="space-y-2">
          {(f.tasks || []).map((t, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 items-center">
              <select className={inputCls} value={t.worker_id} onChange={(e) => updTask(i, "worker_id", e.target.value)}>
                <option value="">العامل…</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.role})</option>)}
              </select>
              <select className={inputCls} value={t.task_type} onChange={(e) => updTask(i, "task_type", e.target.value)}>
                <option value="cutting">قص</option>
                <option value="sewing">خياطة</option>
                <option value="pressing">كوي</option>
              </select>
              <input type="number" placeholder="الأجرة" className={inputCls} value={t.wage_amount} onChange={(e) => updTask(i, "wage_amount", e.target.value)} />
              <button onClick={() => rmTask(i)} className="text-thread text-xs">حذف</button>
            </div>
          ))}
        </div>
      </div>

      <Field label="ملاحظات"><textarea className={inputCls} rows="2" value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>

      <div className="flex gap-2 justify-end pt-2 border-t border-line">
        <Btn variant="ghost" onClick={onCancel}>إلغاء</Btn>
        <Btn variant="brass" onClick={submit}>إنشاء ورقة العمل</Btn>
      </div>
    </div>
  );
}

function OrderDetail({ id, onBack, onChanged }) {
  const [o, setO] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [modReason, setModReason] = useState("");
  const [showMod, setShowMod] = useState(false);
  const [invoice, setInvoice] = useState(null);

  const load = useCallback(() => {
    api(`/orders/${id}`).then(setO).catch((e) => notify(e.message, "error"));
  }, [id]);
  useEffect(load, [load]);

  if (!o) return <div className="text-muted">جارِ التحميل…</div>;

  const advanceStatus = async (status) => {
    try { await api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); notify("تم تحديث حالة الطلب"); load(); onChanged && onChanged(); }
    catch (e) { notify(e.message, "error"); }
  };
  const addPayment = async () => {
    if (!payAmount) return;
    try { await api(`/orders/${id}/payments`, { method: "POST", body: JSON.stringify({ amount: Number(payAmount) }) }); notify("تم تسجيل الدفعة"); setPayAmount(""); load(); }
    catch (e) { notify(e.message, "error"); }
  };
  const completeTask = async (taskId) => {
    try { await api(`/orders/tasks/${taskId}/complete`, { method: "PATCH" }); load(); } catch (e) { notify(e.message, "error"); }
  };
  const submitMod = async () => {
    try { await api(`/orders/${id}/modification`, { method: "POST", body: JSON.stringify({ reason: modReason }) }); notify("تم تسجيل التعديل"); setShowMod(false); load(); }
    catch (e) { notify(e.message, "error"); }
  };
  const genInvoice = async () => {
    try { const inv = await api("/invoices/generate", { method: "POST", body: JSON.stringify({ order_id: id }) }); setInvoice(inv); notify("تم إصدار الفاتورة الإلكترونية"); }
    catch (e) { notify(e.message, "error"); }
  };

  const currentIdx = STATUS_ORDER.indexOf(o.status);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-muted hover:text-ink no-print">→ عودة لقائمة الطلبات</button>

      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="font-display text-2xl font-extrabold">{o.order_number}</h2>
          <p className="text-sm text-muted mt-1">{o.customer_name} · {o.customer_phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge status={o.status} />
          <Btn variant="ghost" onClick={() => window.print()}>طباعة كارت المعمل</Btn>
        </div>
      </div>

      {/* شريط تتبع مراحل الإنتاج */}
      {o.status !== "modification" && (
        <Panel title="حالة تنفيذ الطلب" className="no-print">
          <div className="flex items-center">
            {STATUS_ORDER.map((s, i) => (
              <React.Fragment key={s}>
                <button
                  onClick={() => advanceStatus(s)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors"
                    style={{
                      borderColor: i <= currentIdx ? "#9C7A2E" : "#DCD3BD",
                      background: i <= currentIdx ? "#9C7A2E" : "transparent",
                      color: i <= currentIdx ? "#fff" : "#8A8371",
                    }}
                  >{i + 1}</div>
                  <span className="text-[11px] text-muted group-hover:text-ink">{STATUS_META[s].label}</span>
                </button>
                {i < STATUS_ORDER.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1" style={{ background: i < currentIdx ? "#9C7A2E" : "#DCD3BD" }} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Btn variant="danger" onClick={() => setShowMod(true)}>تسجيل تعديل على الثوب</Btn>
          </div>
        </Panel>
      )}
      {o.status === "modification" && (
        <Panel title="⚠ هذا الطلب قيد التعديل" className="no-print">
          <p className="text-sm">{o.modification_reason}</p>
          <div className="mt-3"><Btn onClick={() => advanceStatus("sewing")}>إعادة إلى قيد الخياطة</Btn></div>
        </Panel>
      )}

      <div id="print-area" className="grid md:grid-cols-3 gap-4">
        <Panel title="بطاقة القياس (للخياط)" className="md:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 text-sm">
            {o.measurement ? MEASURE_FIELDS.map(([k, label]) => (
              <div key={k}><div className="text-xs text-muted">{label}</div><div className="font-display font-bold text-lg">{o.measurement[k] ?? "—"}</div></div>
            )) : <p className="text-muted col-span-4">لا يوجد مقاس مرتبط بهذا الطلب</p>}
          </div>
          {o.measurement && (
            <div className="mt-4 pt-3 border-t border-line text-xs text-muted grid grid-cols-2 md:grid-cols-4 gap-2">
              {PREF_FIELDS.map(([k, label]) => o.measurement[k] && <div key={k}><b>{label}:</b> {o.measurement[k]}</div>)}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-line text-sm flex justify-between">
            <span>القماش: {o.fabric_name || "—"} {o.fabric_color ? `(${o.fabric_color})` : ""}</span>
            <span>الكمية: {o.fabric_qty_used || 0}</span>
          </div>
          {o.notes && <p className="text-sm mt-2 text-muted">ملاحظات: {o.notes}</p>}
        </Panel>

        <Panel title="بيانات باركود الطلب">
          <div className="text-center py-4">
            <div className="font-display font-extrabold text-3xl tracking-widest">{o.order_number}</div>
            <div className="mt-3 flex justify-center gap-[2px]" aria-hidden="true">
              {o.order_number.split("").map((ch, i) => (
                <div key={i} style={{ width: (ch.charCodeAt(0) % 3) + 1, height: 40 }} className="bg-ink" />
              ))}
            </div>
            <div className="text-xs text-muted mt-2">تاريخ الاستلام المتوقع: {dateAr(o.expected_delivery_date)}</div>
          </div>
        </Panel>
      </div>

      <div className="grid md:grid-cols-2 gap-4 no-print">
        <Panel title="الوضع المالي" actions={<span className="text-xs text-muted">الإجمالي {money(o.total_amount)}</span>}>
          <div className="flex justify-between py-1 text-sm"><span className="text-muted">المدفوع</span><span className="font-bold">{money(o.paid_amount)}</span></div>
          <div className="flex justify-between py-1 text-sm"><span className="text-muted">ضريبة القيمة المضافة</span><span>{money(o.vat_amount)}</span></div>
          <div className="flex justify-between py-1 text-sm border-t border-line mt-1 pt-2"><span className="font-bold">المتبقي</span><span className="font-bold text-thread">{money(o.remaining_amount)}</span></div>

          <div className="flex gap-2 mt-4">
            <input type="number" placeholder="مبلغ الدفعة" className={inputCls} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <Btn onClick={addPayment}>تسجيل دفعة</Btn>
          </div>

          <div className="mt-4 pt-3 border-t border-line">
            {invoice ? (
              <div className="text-sm space-y-1">
                <div className="font-bold text-sage">✓ تم إصدار الفاتورة {invoice.invoice_number}</div>
                <div className="text-xs text-muted break-all">QR (TLV/Base64): {invoice.qr_base64}</div>
              </div>
            ) : (
              <Btn variant="brass" onClick={genInvoice}>إصدار فاتورة إلكترونية (ZATCA)</Btn>
            )}
          </div>
        </Panel>

        <Panel title="سجل مراحل العمل">
          <ul className="space-y-2 text-sm">
            {o.status_history.map((h) => (
              <li key={h.id} className="flex justify-between border-b border-line/60 pb-1">
                <span><Badge status={h.status} /> <span className="text-muted mr-2">{h.note}</span></span>
                <span className="text-xs text-muted">{dateAr(h.changed_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="المهام الموزعة على العمال" className="no-print">
        {o.tasks.length === 0 ? <p className="text-sm text-muted">لا توجد مهام موزعة.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line"><th className="py-2">العامل</th><th>المهمة</th><th>الأجرة</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {o.tasks.map((t) => (
                <tr key={t.id} className="border-b border-line/60">
                  <td className="py-2">{t.worker_name}</td>
                  <td>{t.task_type === "cutting" ? "قص" : t.task_type === "sewing" ? "خياطة" : "كوي"}</td>
                  <td>{money(t.wage_amount)}</td>
                  <td>{t.completed ? <span className="text-sage font-bold">مكتملة</span> : <span className="text-muted">قيد التنفيذ</span>}</td>
                  <td>{!t.completed && <button className="text-brass text-xs font-bold" onClick={() => completeTask(t.id)}>تمييز كمكتملة</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Modal open={showMod} onClose={() => setShowMod(false)} title="تسجيل تعديل على ثوب جاهز">
        <Field label="سبب التعديل"><textarea className={inputCls} rows="3" value={modReason} onChange={(e) => setModReason(e.target.value)} placeholder="مثال: خطأ في مقاس الكم / رغبة العميل بتضييق الخصر" /></Field>
        <div className="flex gap-2 justify-end pt-3"><Btn variant="ghost" onClick={() => setShowMod(false)}>إلغاء</Btn><Btn variant="danger" onClick={submitMod}>تسجيل التعديل</Btn></div>
      </Modal>
    </div>
  );
}

function OrdersPage() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (search) qs.set("search", search);
    api(`/orders?${qs}`).then(setList).catch((e) => notify(e.message, "error"));
  }, [status, search]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  if (openId) return <OrderDetail id={openId} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold">الطلبات وأوراق العمل</h2>
          <p className="text-sm text-muted mt-1">تتبّع كل طلب من الاستلام حتى التسليم</p>
        </div>
        <Btn variant="brass" onClick={() => setShowNew(true)}>+ طلب جديد</Btn>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <button onClick={() => setStatus("")} className={`px-3 py-1.5 rounded-sm text-xs font-bold border ${!status ? "bg-ink text-canvas border-ink" : "border-line text-muted"}`}>الكل</button>
        {STATUS_ORDER.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-sm text-xs font-bold border ${status === s ? "border-brass" : "border-line"}`} style={status === s ? { background: STATUS_META[s].bg, color: STATUS_META[s].color } : {}}>
            {STATUS_META[s].label}
          </button>
        ))}
        <input className={inputCls + " max-w-xs mr-auto"} placeholder="بحث برقم الطلب أو العميل…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Panel>
        <table className="w-full text-sm">
          <thead><tr className="text-right text-muted text-xs border-b border-line">
            <th className="py-2">رقم الطلب</th><th>العميل</th><th>الحالة</th><th>الإجمالي</th><th>المتبقي</th><th>موعد التسليم</th>
          </tr></thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-b border-line/60 hover:bg-canvas/40 cursor-pointer" onClick={() => setOpenId(o.id)}>
                <td className="py-3 font-bold font-display">{o.order_number}</td>
                <td>{o.customer_name}</td>
                <td><Badge status={o.status} /></td>
                <td>{money(o.total_amount)}</td>
                <td className={o.total_amount - o.paid_amount > 0 ? "text-thread font-bold" : "text-sage"}>{money(o.total_amount - o.paid_amount)}</td>
                <td className="text-muted">{dateAr(o.expected_delivery_date)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="6" className="py-6 text-center text-muted">لا توجد طلبات مطابقة</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="طلب جديد (ورقة عمل)" wide>
        <NewOrderForm onCancel={() => setShowNew(false)} onCreated={(o) => { setShowNew(false); load(); setOpenId(o.id); }} />
      </Modal>
    </div>
  );
}

// ============================== المخزون ==============================
function InventoryPage() {
  const [fabrics, setFabrics] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [tab, setTab] = useState("fabrics");
  const [showAddFabric, setShowAddFabric] = useState(false);
  const [showAddSupply, setShowAddSupply] = useState(false);
  const [restock, setRestock] = useState(null); // {kind, id, qty}

  const load = useCallback(() => {
    api("/inventory/fabrics").then(setFabrics);
    api("/inventory/supplies").then(setSupplies);
  }, []);
  useEffect(load, [load]);

  const doRestock = async () => {
    try {
      await api(`/inventory/${restock.kind}/${restock.id}/restock`, { method: "POST", body: JSON.stringify({ qty: Number(restock.qty) }) });
      notify("تم تحديث المخزون"); setRestock(null); load();
    } catch (e) { notify(e.message, "error"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold">المخزون</h2>
          <p className="text-sm text-muted mt-1">الأقمشة ومستلزمات الخياطة</p>
        </div>
        <Btn variant="brass" onClick={() => tab === "fabrics" ? setShowAddFabric(true) : setShowAddSupply(true)}>
          + {tab === "fabrics" ? "إضافة قماش" : "إضافة مستلزم"}
        </Btn>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("fabrics")} className={`px-4 py-2 text-sm font-bold rounded-sm border ${tab === "fabrics" ? "bg-ink text-canvas border-ink" : "border-line text-muted"}`}>الأقمشة</button>
        <button onClick={() => setTab("supplies")} className={`px-4 py-2 text-sm font-bold rounded-sm border ${tab === "supplies" ? "bg-ink text-canvas border-ink" : "border-line text-muted"}`}>المستلزمات</button>
      </div>

      {tab === "fabrics" ? (
        <Panel>
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line">
              <th className="py-2">القماش</th><th>اللون</th><th>الوحدة</th><th>المتوفر</th><th>سعر الشراء</th><th>سعر البيع</th><th></th>
            </tr></thead>
            <tbody>
              {fabrics.map((f) => (
                <tr key={f.id} className={`border-b border-line/60 ${f.stock_qty <= f.min_stock_alert ? "bg-thread/5" : ""}`}>
                  <td className="py-3 font-bold font-display">{f.name}</td>
                  <td>{f.color || "—"}</td>
                  <td>{f.unit === "meter" ? "متر" : "يارد"}</td>
                  <td className={f.stock_qty <= f.min_stock_alert ? "text-thread font-bold" : ""}>{f.stock_qty}</td>
                  <td>{money(f.cost_price)}</td>
                  <td>{money(f.sell_price)}</td>
                  <td><button className="text-brass text-xs font-bold" onClick={() => setRestock({ kind: "fabrics", id: f.id, qty: "" })}>تزويد المخزون</button></td>
                </tr>
              ))}
              {fabrics.length === 0 && <tr><td colSpan="7" className="py-6 text-center text-muted">لا توجد أقمشة مسجّلة</td></tr>}
            </tbody>
          </table>
        </Panel>
      ) : (
        <Panel>
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line">
              <th className="py-2">الاسم</th><th>النوع</th><th>الوحدة</th><th>المتوفر</th><th></th>
            </tr></thead>
            <tbody>
              {supplies.map((s) => (
                <tr key={s.id} className={`border-b border-line/60 ${s.stock_qty <= s.min_stock_alert ? "bg-thread/5" : ""}`}>
                  <td className="py-3 font-bold font-display">{s.name}</td>
                  <td>{{ thread: "خيوط", button: "أزرار", lining: "حشوات", zipper: "سحابات", other: "أخرى" }[s.type] || s.type}</td>
                  <td>{s.unit}</td>
                  <td className={s.stock_qty <= s.min_stock_alert ? "text-thread font-bold" : ""}>{s.stock_qty}</td>
                  <td><button className="text-brass text-xs font-bold" onClick={() => setRestock({ kind: "supplies", id: s.id, qty: "" })}>تزويد المخزون</button></td>
                </tr>
              ))}
              {supplies.length === 0 && <tr><td colSpan="5" className="py-6 text-center text-muted">لا توجد مستلزمات مسجّلة</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

      <Modal open={!!restock} onClose={() => setRestock(null)} title="تزويد المخزون">
        <Field label="الكمية الواردة"><input type="number" className={inputCls} value={restock?.qty || ""} onChange={(e) => setRestock((s) => ({ ...s, qty: e.target.value }))} /></Field>
        <div className="flex gap-2 justify-end pt-3"><Btn variant="ghost" onClick={() => setRestock(null)}>إلغاء</Btn><Btn onClick={doRestock}>تأكيد</Btn></div>
      </Modal>

      <Modal open={showAddFabric} onClose={() => setShowAddFabric(false)} title="إضافة قماش جديد">
        <FabricForm onCancel={() => setShowAddFabric(false)} onSave={async (d) => { try { await api("/inventory/fabrics", { method: "POST", body: JSON.stringify(d) }); notify("تمت الإضافة"); setShowAddFabric(false); load(); } catch (e) { notify(e.message, "error"); } }} />
      </Modal>
      <Modal open={showAddSupply} onClose={() => setShowAddSupply(false)} title="إضافة مستلزم جديد">
        <SupplyForm onCancel={() => setShowAddSupply(false)} onSave={async (d) => { try { await api("/inventory/supplies", { method: "POST", body: JSON.stringify(d) }); notify("تمت الإضافة"); setShowAddSupply(false); load(); } catch (e) { notify(e.message, "error"); } }} />
      </Modal>
    </div>
  );
}

function FabricForm({ onSave, onCancel }) {
  const [f, setF] = useState({ unit: "meter" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label="اسم القماش"><input className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="اللون"><input className={inputCls} value={f.color || ""} onChange={(e) => set("color", e.target.value)} /></Field>
        <Field label="الوحدة">
          <select className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            <option value="meter">متر</option><option value="yard">يارد</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="الكمية الابتدائية"><input type="number" className={inputCls} value={f.stock_qty || ""} onChange={(e) => set("stock_qty", e.target.value)} /></Field>
        <Field label="سعر الشراء"><input type="number" className={inputCls} value={f.cost_price || ""} onChange={(e) => set("cost_price", e.target.value)} /></Field>
        <Field label="سعر البيع"><input type="number" className={inputCls} value={f.sell_price || ""} onChange={(e) => set("sell_price", e.target.value)} /></Field>
      </div>
      <Field label="حد التنبيه عند انخفاض المخزون"><input type="number" className={inputCls} value={f.min_stock_alert || ""} onChange={(e) => set("min_stock_alert", e.target.value)} /></Field>
      <div className="flex gap-2 justify-end pt-2"><Btn variant="ghost" onClick={onCancel}>إلغاء</Btn><Btn onClick={() => onSave(f)}>حفظ</Btn></div>
    </div>
  );
}

function SupplyForm({ onSave, onCancel }) {
  const [f, setF] = useState({ type: "thread", unit: "piece" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label="الاسم"><input className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع">
          <select className={inputCls} value={f.type} onChange={(e) => set("type", e.target.value)}>
            <option value="thread">خيوط</option><option value="button">أزرار</option>
            <option value="lining">حشوات</option><option value="zipper">سحابات</option><option value="other">أخرى</option>
          </select>
        </Field>
        <Field label="الوحدة"><input className={inputCls} value={f.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الكمية الابتدائية"><input type="number" className={inputCls} value={f.stock_qty || ""} onChange={(e) => set("stock_qty", e.target.value)} /></Field>
        <Field label="حد التنبيه"><input type="number" className={inputCls} value={f.min_stock_alert || ""} onChange={(e) => set("min_stock_alert", e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 justify-end pt-2"><Btn variant="ghost" onClick={onCancel}>إلغاء</Btn><Btn onClick={() => onSave(f)}>حفظ</Btn></div>
    </div>
  );
}

// ============================== العمال ==============================
function WorkersPage() {
  const [list, setList] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [dues, setDues] = useState(null);

  const load = useCallback(() => { api("/reports/worker-dues").then(setDues); api("/workers").then(setList); }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-extrabold">العمال</h2><p className="text-sm text-muted mt-1">توزيع المهام وحساب الأجور بالقطعة</p></div>
        <Btn variant="brass" onClick={() => setShowAdd(true)}>+ عامل جديد</Btn>
      </div>

      <Panel title="إنتاجية ومستحقات العمال">
        <table className="w-full text-sm">
          <thead><tr className="text-right text-muted text-xs border-b border-line">
            <th className="py-2">الاسم</th><th>الدور</th><th>مهام مكتملة</th><th>إجمالي المهام</th><th>مستحق الصرف</th><th>قيد التنفيذ</th>
          </tr></thead>
          <tbody>
            {(dues || []).map((w) => (
              <tr key={w.id} className="border-b border-line/60">
                <td className="py-3 font-bold font-display">{w.name}</td>
                <td>{{ cutter: "قصاص", tailor: "خياط", presser: "مكوجي" }[w.role] || w.role}</td>
                <td>{w.completed_tasks}</td>
                <td>{w.total_tasks}</td>
                <td className="font-bold text-sage">{money(w.total_due)}</td>
                <td className="text-muted">{money(w.pending_amount)}</td>
              </tr>
            ))}
            {(!dues || dues.length === 0) && <tr><td colSpan="6" className="py-6 text-center text-muted">لا يوجد عمال مسجّلون</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="إضافة عامل جديد">
        <WorkerForm onCancel={() => setShowAdd(false)} onSave={async (d) => { try { await api("/workers", { method: "POST", body: JSON.stringify(d) }); notify("تمت الإضافة"); setShowAdd(false); load(); } catch (e) { notify(e.message, "error"); } }} />
      </Modal>
    </div>
  );
}

function WorkerForm({ onSave, onCancel }) {
  const [f, setF] = useState({ role: "tailor" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="space-y-3">
      <Field label="الاسم"><input className={inputCls} value={f.name || ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الدور">
          <select className={inputCls} value={f.role} onChange={(e) => set("role", e.target.value)}>
            <option value="cutter">قصاص</option><option value="tailor">خياط</option><option value="presser">مكوجي</option>
          </select>
        </Field>
        <Field label="الهاتف"><input className={inputCls} value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
      </div>
      <Field label="الأجرة الافتراضية بالقطعة"><input type="number" className={inputCls} value={f.wage_per_piece || ""} onChange={(e) => set("wage_per_piece", e.target.value)} /></Field>
      <div className="flex gap-2 justify-end pt-2"><Btn variant="ghost" onClick={onCancel}>إلغاء</Btn><Btn onClick={() => onSave(f)}>حفظ</Btn></div>
    </div>
  );
}

// ============================== التقارير ==============================
function ReportsPage() {
  const [sales, setSales] = useState(null);
  const [fabricProfit, setFabricProfit] = useState([]);
  const [vat, setVat] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    const qs = new URLSearchParams(); if (from) qs.set("from", from); if (to) qs.set("to", to);
    api(`/reports/sales?${qs}`).then(setSales);
    api(`/reports/vat?${qs}`).then(setVat);
    api("/reports/fabric-profit").then(setFabricProfit);
  }, [from, to]);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div><h2 className="font-display text-2xl font-extrabold">التقارير المالية</h2><p className="text-sm text-muted mt-1">المبيعات، أرباح الأقمشة، والضريبة</p></div>

      <div className="flex gap-3 items-end">
        <Field label="من تاريخ"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="تقرير المبيعات" sub={sales ? `الإجمالي: ${money(sales.total)}` : ""}>
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line"><th className="py-2">الطلب</th><th>العميل</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
            <tbody>
              {(sales?.rows || []).slice(0, 15).map((r) => (
                <tr key={r.id} className="border-b border-line/60"><td className="py-2 font-bold">{r.order_number}</td><td>{r.customer_name}</td><td>{money(r.amount)}</td><td className="text-muted">{dateAr(r.payment_date)}</td></tr>
              ))}
              {(sales?.rows || []).length === 0 && <tr><td colSpan="4" className="py-6 text-center text-muted">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel title="تقرير ضريبة القيمة المضافة" sub={vat ? `إجمالي الضريبة: ${money(vat.totalVat)}` : ""}>
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted text-xs border-b border-line"><th className="py-2">الطلب</th><th>الإجمالي</th><th>الضريبة</th></tr></thead>
            <tbody>
              {(vat?.rows || []).slice(0, 15).map((r) => (
                <tr key={r.order_number} className="border-b border-line/60"><td className="py-2 font-bold">{r.order_number}</td><td>{money(r.total_amount)}</td><td>{money(r.vat_amount)}</td></tr>
              ))}
              {(vat?.rows || []).length === 0 && <tr><td colSpan="3" className="py-6 text-center text-muted">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="أرباح الأقمشة" sub="تقديري بناءً على الاستهلاك الفعلي لكل طلب">
        <table className="w-full text-sm">
          <thead><tr className="text-right text-muted text-xs border-b border-line"><th className="py-2">القماش</th><th>الكمية المستهلكة</th><th>ربح الوحدة</th><th>الربح التقديري</th></tr></thead>
          <tbody>
            {fabricProfit.map((f) => (
              <tr key={f.id} className="border-b border-line/60">
                <td className="py-2 font-bold">{f.name} {f.color ? `(${f.color})` : ""}</td>
                <td>{f.total_used}</td>
                <td>{money(f.sell_price - f.cost_price)}</td>
                <td className="font-bold text-sage">{money(f.estimated_profit)}</td>
              </tr>
            ))}
            {fabricProfit.length === 0 && <tr><td colSpan="4" className="py-6 text-center text-muted">لا توجد بيانات</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ============================== الإعدادات ==============================
function SettingsPage() {
  const [s, setS] = useState(null);
  useEffect(() => { api("/invoices/settings/shop").then(setS); }, []);
  if (!s) return <div className="text-muted">جارِ التحميل…</div>;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try { await api("/invoices/settings/shop", { method: "PUT", body: JSON.stringify(s) }); notify("تم حفظ الإعدادات"); }
    catch (e) { notify(e.message, "error"); }
  };
  return (
    <div className="space-y-6 max-w-xl">
      <div><h2 className="font-display text-2xl font-extrabold">إعدادات المحل والفوترة</h2><p className="text-sm text-muted mt-1">تُستخدم هذه البيانات في الفاتورة الإلكترونية (ZATCA)</p></div>
      <Panel>
        <div className="space-y-3">
          <Field label="اسم المحل / المؤسسة"><input className={inputCls} value={s.shop_name} onChange={(e) => set("shop_name", e.target.value)} /></Field>
          <Field label="الرقم الضريبي"><input className={inputCls} value={s.vat_number} onChange={(e) => set("vat_number", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="نسبة الضريبة"><input type="number" step="0.01" className={inputCls} value={s.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} /></Field>
            <Field label="الهاتف"><input className={inputCls} value={s.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          </div>
          <Field label="العنوان"><input className={inputCls} value={s.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <div className="flex justify-end pt-2"><Btn variant="brass" onClick={save}>حفظ الإعدادات</Btn></div>
        </div>
      </Panel>
      <Panel title="حالة ربط ZATCA (المرحلة الثانية)">
        <p className="text-sm text-muted leading-6">
          النظام يولّد فواتير مبسطة متوافقة هيكلياً (UUID، عدّاد تسلسلي ICV، تجزئة الفاتورة السابقة PIH، ورمز QR بصيغة TLV/Base64).
          للتفعيل الفعلي مع الهيئة، يلزم استكمال: توثيق الجهاز (CSID Onboarding)، توليد XML بصيغة UBL 2.1 وتوقيعه، وربط
          Reporting API الحقيقي — راجع ملف README المرفق مع المشروع لتفاصيل خطوات الربط.
        </p>
      </Panel>
    </div>
  );
}

// ============================== جذر التطبيق ==============================
function App() {
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(getStoredUser());
  toastFn = (msg, type) => setToast({ msg, type });
  onUnauthorized = () => setUser(null);

  const logout = () => { setToken(null); setStoredUser(null); setUser(null); };

  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  const pages = {
    dashboard: <Dashboard setPage={setPage} />,
    orders: <OrdersPage />,
    customers: <CustomersPage />,
    inventory: <InventoryPage />,
    workers: <WorkersPage />,
    reports: <ReportsPage />,
    users: user.role === "admin" ? <UsersPage currentUser={user} /> : <Dashboard setPage={setPage} />,
    settings: user.role === "admin" ? <SettingsPage /> : <Dashboard setPage={setPage} />,
  };

  return (
    <div className="flex min-h-screen">
      <div className="no-print"><Sidebar page={page} setPage={setPage} user={user} onLogout={logout} /></div>
      <main className="flex-1 p-8 max-w-6xl">{pages[page]}</main>
      <Toast msg={toast?.msg} type={toast?.type} onDone={() => setToast(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
