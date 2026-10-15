"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Variant = { variant_id: string; size: string | null; quantity: number | null; active: boolean };
type Product = {
  product_id: string;
  erp_name: string | null;
  sku: string;
  color: string | null;
  image_url: string | null;
  price: number | null;
  sizes: Variant[];
  issues: string[];
  ready: boolean;
  easyorders_matches: number;
};
type Catalog = {
  ok: boolean;
  message?: string;
  summary?: { erp_products: number; erp_variants: number; ready: number };
  products?: Product[];
};
type Draft = { title: string; color_name: string; description: string; visible_details: string[] };
type SavedDraft = Draft & { image_url: string; approved: boolean; updated_at: string };
type DraftMap = Record<string, SavedDraft>;

const SAVED_KEY = "adora-easyorders-title-reviews-v1";

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : "تعذر إكمال الطلب. حاول مجددًا.";
}

export default function AdoraProductReviewPage() {
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const stopRequested = useRef(false);
  const draftRef = useRef<DraftMap>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SAVED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DraftMap;
        draftRef.current = parsed;
        setDrafts(parsed);
      }
    } catch {
      setNotice("تعذر قراءة مسودات المراجعة المحفوظة في هذا المتصفح.");
    } finally {
      setDraftsLoaded(true);
    }

    let live = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (live) { setLoggedIn(Boolean(data.user)); setLoadingAuth(false); } })
      .catch(() => { if (live) setLoadingAuth(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!draftsLoaded) return;
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(drafts));
    } catch {
      setNotice("تعذر حفظ المسودات محليًا. صدّر الملف قبل إغلاق الصفحة.");
    }
  }, [drafts, draftsLoaded]);

  function storeDraft(productId: string, draft: SavedDraft) {
    const next = { ...draftRef.current, [productId]: draft };
    draftRef.current = next;
    setDrafts(next);
  }

  function currentDraft(product: Product): SavedDraft | null {
    const saved = drafts[product.product_id];
    return saved && saved.image_url === product.image_url ? saved : null;
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    if (error || !data.session) {
      setNotice("تعذر تسجيل الدخول إلى حساب ERP.");
    } else {
      setLoggedIn(true);
      setPassword("");
    }
  }

  async function getAccessToken(): Promise<string> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) throw new Error("انتهت جلسة الدخول. يرجى تسجيل الدخول مجددًا.");
    return session.access_token;
  }

  async function loadCatalog() {
    setLoadingCatalog(true);
    setNotice("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/integrations/easyorders/catalog-preflight", {
        method: "GET",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      });
      const data: Catalog = await response.json();
      if (!response.ok || !data.ok || !data.products) {
        throw new Error(data.message || "تعذر قراءة المنتجات.");
      }
      setCatalog(data.products);
      setNotice("تم تحميل " + data.products.length + " منتجًا من Adora. لم يُرسل شيء إلى EasyOrders.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function generate(product: Product, fromBatch = false): Promise<boolean> {
    setBusyProductId(product.product_id);
    if (!fromBatch) setNotice("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/integrations/easyorders/suggest-product", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ product_id: product.product_id }),
        cache: "no-store",
      });
      const result: { ok?: boolean; message?: string; draft?: Draft } = await response.json();
      if (!response.ok || !result.ok || !result.draft) {
        throw new Error(result.message || "لم يتم توليد الاسم.");
      }

      const proposed = result.draft;
      storeDraft(product.product_id, {
        title: proposed.title,
        color_name: proposed.color_name,
        description: proposed.description,
        visible_details: proposed.visible_details,
        image_url: product.image_url || "",
        approved: false,
        updated_at: new Date().toISOString(),
      });
      if (!fromBatch) setNotice("تم تحليل الصورة. راجع الاسم والوصف ثم اضغط موافقة.");
      return true;
    } catch (error) {
      setNotice("المنتج " + product.sku + ": " + errorMessage(error));
      return false;
    } finally {
      setBusyProductId(null);
    }
  }

  async function generateRemaining() {
    if (runningAll) return;
    stopRequested.current = false;
    setRunningAll(true);
    setNotice("");
    const remaining = catalog.filter(p => p.ready && p.image_url && (
      !draftRef.current[p.product_id] ||
      draftRef.current[p.product_id].image_url !== p.image_url
    ));
    let completed = 0;
    for (const product of remaining) {
      if (stopRequested.current) break;
      setProgress("تحليل " + (completed + 1) + " من " + remaining.length + " — " + product.sku);
      const worked = await generate(product, true);
      if (!worked) break;
      completed += 1;
    }
    setProgress("");
    setRunningAll(false);
    setNotice("تم إنشاء " + completed + " اقتراحًا. بقيت جميع الاقتراحات بانتظار موافقتك.");
  }

  function edit(product: Product, field: "title" | "color_name" | "description", value: string) {
    const current = draftRef.current[product.product_id];
    if (!current || current.image_url !== product.image_url) return;
    storeDraft(product.product_id, {
      ...current,
      [field]: value,
      approved: false,
      updated_at: new Date().toISOString(),
    });
  }

  function approve(product: Product) {
    const current = draftRef.current[product.product_id];
    if (!current || current.image_url !== product.image_url ||
      !current.title.trim() || !current.color_name.trim() || !current.description.trim()) return;

    storeDraft(product.product_id, {
      ...current, approved: true, updated_at: new Date().toISOString(),
    });
  }

  function revoke(product: Product) {
    const current = draftRef.current[product.product_id];
    if (current) storeDraft(product.product_id, { ...current, approved: false });
  }

  function exportApproved() {
    const selected = catalog.flatMap(p => {
      const draft = draftRef.current[p.product_id];
      if (!draft || !draft.approved || draft.image_url !== p.image_url) return [];
      return [{
        erp_product_id: p.product_id,
        sku: p.sku,
        display_title: draft.title,
        display_color: draft.color_name,
        display_description: draft.description,
        approved_at: draft.updated_at,
        source_image_url: p.image_url,
        quantity_by_variant: p.sizes,
        sale_price_snapshot: p.price,
      }];
    });
    if (selected.length === 0) {
      setNotice("لا توجد أسماء معتمدة لتصديرها.");
      return;
    }
    const blob = new Blob([JSON.stringify({
      store: "Adora",
      kind: "preview_only_approved_product_copy",
      approved_products: selected,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "adora-approved-product-titles.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("تم تصدير أسماء المنتجات المعتمدة، دون إرسالها إلى EasyOrders.");
  }

  const drafted = catalog.filter(p => currentDraft(p)).length;
  const approved = catalog.filter(p => currentDraft(p)?.approved).length;
  const pending = catalog.filter(p => p.ready && !currentDraft(p)).length;

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 px-3 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <a href="/integrations/easyorders/catalog" className="text-sm text-neutral-400 underline">
            العودة إلى تدقيق الكتالوج
          </a>
          <h1 className="text-2xl font-bold sm:text-3xl">مراجعة أسماء منتجات Adora</h1>
          <p className="leading-7 text-neutral-300">
            يحلل الذكاء الاصطناعي الصورة الرئيسية لكل منتج، ويقترح الاسم ودرجة اللون والوصف.
            يمكنك تعديلها ثم اعتمادها. لا يغيّر النظام أسماء ERP ولا ينشر المنتجات في EasyOrders في هذه المرحلة.
          </p>
          <p className="text-sm text-amber-300">
            المسودات والموافقات محفوظة مؤقتًا داخل هذا المتصفح فقط. استخدم «تصدير المعتمد»
            قبل تغيير الهاتف أو مسح بيانات المتصفح. الربط الدائم والنشر سيُضافان بعد مراجعتك.
          </p>
        </header>

        {loadingAuth ? <p>جاري التحقق من حساب ERP...</p> : !loggedIn ? (
          <form onSubmit={login} className="max-w-md space-y-3 rounded-xl border border-neutral-800 p-4">
            <input type="email" dir="ltr" required placeholder="البريد الإلكتروني" aria-label="البريد الإلكتروني"
              className="w-full rounded-lg bg-neutral-800 p-3 text-left"
              value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" dir="ltr" required placeholder="كلمة المرور" aria-label="كلمة المرور"
              className="w-full rounded-lg bg-neutral-800 p-3 text-left"
              value={password} onChange={e => setPassword(e.target.value)} />
            <button type="submit" className="rounded-lg bg-white px-5 py-3 font-semibold text-black">تسجيل الدخول</button>
          </form>
        ) : <>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={loadingCatalog || runningAll} onClick={loadCatalog}
              className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">
              {loadingCatalog ? "جاري التحميل..." : "تحميل منتجات Adora"}
            </button>
            <button type="button" disabled={runningAll || pending === 0} onClick={generateRemaining}
              className="rounded-lg border border-white px-5 py-3 font-semibold disabled:opacity-40">
              {runningAll ? "جاري تحليل الصور..." : "تحليل الصور التي لم تُحلّل بعد"}
            </button>
            {runningAll && <button type="button" onClick={() => { stopRequested.current = true; }}
              className="rounded-lg border border-amber-400 px-5 py-3 text-amber-300">
              إيقاف بعد الصورة الحالية
            </button>}
            <button type="button" disabled={approved === 0} onClick={exportApproved}
              className="rounded-lg border border-neutral-500 px-5 py-3 disabled:opacity-40">
              تصدير الأسماء المعتمدة ({approved})
            </button>
          </div>
          {catalog.length > 0 && <p className="rounded-lg bg-neutral-900 p-3 text-sm">
            المنتجات: {catalog.length} | تم تحليل: {drafted} | معتمد: {approved} | لم يُحلل: {pending}
          </p>}
          {progress && <p role="status" className="text-blue-300">{progress}</p>}
          {notice && <p role="status" className="rounded-lg border border-neutral-700 p-3 text-sm">{notice}</p>}

          <div className="space-y-4">
            {catalog.map(product => {
              const draft = currentDraft(product);
              return <section key={product.product_id}
                className="grid gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 md:grid-cols-[230px_1fr]">
                <div className="space-y-2">
                  {product.image_url ? <img src={product.image_url} alt={"صورة منتج " + product.sku}
                    className="aspect-[3/4] w-full rounded-lg bg-neutral-800 object-contain" />
                    : <div className="rounded-lg bg-neutral-800 p-6">لا توجد صورة</div>}
                  <p className="text-sm text-neutral-300">ERP: {product.erp_name}</p>
                  <p className="font-mono text-xs text-neutral-400" dir="ltr">{product.sku}</p>
                  <p className="text-xs text-neutral-400">اللون الداخلي: {product.color} | السعر: {product.price} د.ل</p>
                  <p className="text-xs text-neutral-400">
                    {product.sizes.map(s => s.size + ": " + s.quantity).join(" | ")}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">اسم العرض في EasyOrders</h2>
                    <span className={draft?.approved ? "text-sm text-green-300" : "text-sm text-amber-300"}>
                      {draft?.approved ? "✓ معتمد" : draft ? "بانتظار موافقتك" : "لم يُحلل"}
                    </span>
                  </div>
                  {product.issues.length > 0 &&
                    <p className="text-sm text-amber-300">مشاكل البيانات: {product.issues.join("، ")}</p>}
                  {draft ? <>
                    <label className="block text-sm">
                      الاسم التجاري
                      <input dir="rtl" value={draft.title} onChange={e => edit(product, "title", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-white" />
                    </label>
                    <label className="block text-sm">
                      درجة اللون التسويقية
                      <input dir="rtl" value={draft.color_name} onChange={e => edit(product, "color_name", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-white" />
                    </label>
                    <label className="block text-sm">
                      وصف المنتج
                      <textarea rows={3} dir="rtl" value={draft.description}
                        onChange={e => edit(product, "description", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-white" />
                    </label>
                    <p className="text-xs text-neutral-400">تفاصيل رأتها AI: {draft.visible_details.join("، ") || "لم تُذكر"}</p>
                  </> : <p className="text-sm text-neutral-400">اضغط تحليل الصورة لاقتراح اسم ووصف بناءً على صورة المنتج نفسها.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!product.ready || runningAll || busyProductId !== null}
                      onClick={() => generate(product)}
                      className="rounded-lg border border-neutral-500 px-4 py-2 text-sm disabled:opacity-40">
                      {busyProductId === product.product_id ? "جاري التحليل..." : draft ? "إعادة تحليل الصورة" : "تحليل الصورة"}
                    </button>
                    {draft && !draft.approved && <button type="button"
                      onClick={() => approve(product)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold">
                      موافقة على الاسم والوصف
                    </button>}
                    {draft?.approved && <button type="button"
                      onClick={() => revoke(product)}
                      className="rounded-lg border border-amber-500 px-4 py-2 text-sm">
                      إلغاء الموافقة
                    </button>}
                  </div>
                </div>
              </section>;
            })}
          </div>
        </>}
      </div>
    </main>
  );
}
