"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const COLORS = [
  "أسود",
  "أبيض",
  "كحلي",
  "وردي",
  "موف",
  "بيج",
  "رمادي",
  "أحمر",
  "أخضر",
  "بني",
  "سماوي",
  "زيتي",
  "كيوي",
  "فسفوري",
  "بني غامق",
  "فوشيا",
  "نود",
  "برغندي",
  "أزرق",
  "بنفسجي",
  "جيشي",
  "موف هادي",
  "كريمي",
  "بطاطي",
  "بيبي بلو",
  "قهوي غامق",
  "بني محروق",
  "نيروزي",
  "برتقالي",
  "أصفر",
  "كشميري",
  "زهري",
  "عنابي",
];

const SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  ...Array.from({ length: 25 }, (_, i) => String(i + 36)),
];

const PRODUCT_TYPES = ["بيجامة", "عباية", "بدلة", "حقيبة", "حذاء", "أخرى"];

export default function NewProductPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [storeId, setStoreId] = useState("");
  const [sku, setSku] = useState("");
  const [designCode, setDesignCode] = useState("");
  const [agentCode, setAgentCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeHint, setCodeHint] = useState("");
  const [brandName, setBrandName] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [visualFeatures, setVisualFeatures] = useState("");
  const [productType, setProductType] = useState("");
  const [color, setColor] = useState("");
  const [knownColors, setKnownColors] = useState<string[]>(COLORS);
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [fabric, setFabric] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const [sizeRows, setSizeRows] = useState(
    SIZES.map((size) => ({ size, quantity: "" }))
  );

  const selectedSizeRows = useMemo(() => {
    return sizeRows.filter((row) => Number(row.quantity) > 0);
  }, [sizeRows]);

  useEffect(() => {
    async function loadStores() {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");

      if (error) {
        setMessage("تعذر تحميل المتاجر: " + error.message);
        return;
      }

      setStores(data || []);
    }

    loadStores();
    (async () => {
      const { data, error } = await supabase.from("product_variants").select("color").limit(10000);
      if (!error && data) setKnownColors([...new Set([...COLORS, ...data.map(row => String(row.color || "").trim()).filter(Boolean)])]);
    })();
  }, []);

  useEffect(() => {
    const design = designCode.trim().toUpperCase();
    if (!/^[A-Z]$/.test(design)) {
      setAgentCode("");
      setCodeHint("");
      return;
    }
    let canceled = false;
    (async () => {
      setCodeLoading(true);
      setCodeHint("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("سجّل الدخول لقراءة الأكواد");
        const response = await fetch("/api/agent/product-codes?next_design=" + encodeURIComponent(design), {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "تعذر اقتراح الكود");
        if (canceled) return;
        setAgentCode(result.suggested_code);
        if (result.existing_brand) {
          setBrandName(result.existing_brand);
          setCodeHint("هذا التصميم مسجل بالفعل؛ البراند محدد تلقائيًا.");
        } else {
          setBrandName("");
          setCodeHint("تصميم جديد؛ اكتب اسم البراند.");
        }
      } catch (error) {
        if (!canceled) { setAgentCode(""); setCodeHint(error instanceof Error ? error.message : "تعذر اقتراح الكود"); }
      } finally { if (!canceled) setCodeLoading(false); }
    })();
    return () => { canceled = true; };
  }, [designCode]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("الملف المختار يجب أن يكون صورة");
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage("");
  }

  function updateSizeQuantity(size: string, quantity: string) {
    setSizeRows((prev) =>
      prev.map((row) => (row.size === size ? { ...row, quantity } : row))
    );
  }

  function resetForm() {
    setSku("");
    setDesignCode("");
    setAgentCode("");
    setBrandName("");
    setCodeHint("");
    setName("");
    setModel("");
    setDescription("");
    setVisualFeatures("");
    setProductType("");
    setColor("");
    setCostPrice("");
    setSalePrice("");
    setFabric("");
    setImageFile(null);

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setPreview("");
    setSizeRows(SIZES.map((size) => ({ size, quantity: "" })));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (saving) return;

    setMessage("");

    const isPajama = true;
    const normalizedAgentCode = agentCode.trim().toUpperCase();
    const effectiveDesignCode = designCode.trim().toUpperCase();
    if (!/^[A-Z]$/.test(effectiveDesignCode) || !brandName.trim() || codeLoading || !agentCode) {
      setMessage("اختر حرف التصميم أولًا وانتظر ظهور الكود التلقائي، ثم اكتب اسم البراند");
      return;
    }

    const requiredMissing =
      !storeId ||
      !effectiveDesignCode ||
      !name.trim() ||
      !productType ||
      !color ||
      !fabric.trim() ||

      !costPrice ||
      !salePrice ||
      !imageFile;

    if (requiredMissing) {
      setMessage(
        "يجب تعبئة المتجر، كود التصميم، اسم المنتج، النوع، اللون، الخامة، وصف المنتج، العلامات المميزة للـAI، التكلفة، سعر البيع، وصورة المنتج"
      );
      return;
    }

    if (selectedSizeRows.length === 0) {
      setMessage("يجب إدخال كمية لمقاس واحد على الأقل");
      return;
    }

    const numericCostPrice = Number(costPrice);
    const numericSalePrice = Number(salePrice);

    if (
      !Number.isFinite(numericCostPrice) ||
      numericCostPrice < 0 ||
      !Number.isFinite(numericSalePrice) ||
      numericSalePrice < 0
    ) {
      setMessage("التكلفة وسعر البيع يجب أن يكونا أرقامًا صحيحة");
      return;
    }

    setSaving(true);
    setMessage("جاري حفظ المنتج...");
    if (isPajama) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("يجب تسجيل الدخول بحساب المدير لإضافة بيجامة مع كود Adora");
        const response = await fetch("/api/agent/product-codes", {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error("تعذر التحقق من الأكواد الحالية قبل الحفظ");
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from("profiles")
          .select("role,is_active").eq("id", user?.id || "").single();
        if (profile?.role !== "admin" || !profile.is_active) {
          throw new Error("إضافة البيجامات مع الأكواد تتطلب صلاحية المدير");
        }
        const conflictingDesign = (result.codes || []).find((c: { design_code: string; brand_name: string }) =>
          c.design_code === effectiveDesignCode &&
          c.brand_name.trim().toLocaleLowerCase() !== brandName.trim().toLocaleLowerCase()
        );
        if (conflictingDesign) throw new Error("حرف التصميم مرتبط ببراند آخر");
      } catch (preflightError) {
        setMessage(preflightError instanceof Error ? preflightError.message : "تعذر التحقق من الكود");
        setSaving(false);
        return;
      }
    }

    const finalSku = sku.trim() || `PRD-${Date.now()}`;
    let uploadedFileName = "";
    let writeAttempted = false;
    let writeRejected = false;
    try {
      const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      uploadedFileName = `${Date.now()}-${finalSku}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(uploadedFileName, imageFile, { cacheControl:"3600", upsert:false });
      if (uploadError) throw new Error("خطأ في رفع الصورة: " + uploadError.message);
      const imageUrl = supabase.storage.from("product-images")
        .getPublicUrl(uploadedFileName).data.publicUrl;

      const {data:{session}} = await supabase.auth.getSession();
      if (!session) throw new Error("انتهت جلسة تسجيل الدخول");
      writeAttempted = true;
      const response = await fetch("/api/agent/catalog-write", {
        method:"POST",
        headers: { Authorization:`Bearer ${session.access_token}`, "Content-Type":"application/json" },
        body:JSON.stringify({action:"create",product:{
          store_id:storeId,sku:finalSku,design_code:effectiveDesignCode,
          brand_name:brandName.trim(),color:color.trim(),
          name:name.trim(),model:model.trim(),description:description.trim(),
          visual_features:visualFeatures.trim(),product_type:productType,
          fabric:fabric.trim(),image_url:imageUrl,cost_price:numericCostPrice,
          sale_price:numericSalePrice,
          sizes:selectedSizeRows.map(row=>({size:row.size,quantity:Number(row.quantity)})),
        }}),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(
        result.error === "CATALOG_MIGRATION_REQUIRED"
          ? "يجب تركيب ترحيل قاعدة البيانات قبل حفظ المنتجات بالنظام الجديد"
          : result.error || "فشل حفظ المنتج"
        );
      }
      setMessage(`تم حفظ المنتج والمقاسات والكود ${result.code} معًا بنجاح`);
      resetForm();
      uploadedFileName = "";
    } catch(error) {
      // Do not delete the image after an ambiguous network failure: the DB may have committed.
      if (uploadedFileName && (!writeAttempted || writeRejected)) {
        await supabase.storage.from("product-images").remove([uploadedFileName]);
      }
      setMessage(error instanceof Error ? error.message : "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">إضافة منتج إلى المخزون</h1>
          <p className="mt-2 text-neutral-400">
            أدخل بيانات اللون الحالي بدقة. استخدم نفس كود التصميم لكل ألوان نفس التصميم.
          </p>
        </div>

        <a
          href="/products"
          className="rounded-xl border border-neutral-700 px-5 py-3"
        >
          عرض المنتجات
        </a>
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-6xl grid-cols-1 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">البيانات الأساسية</h2>
          <p className="mb-4 text-sm text-neutral-400">جميع الحقول ظاهرة من البداية. نفس النموذج يحفظ المنتج والمقاسات والمخزون ويربط الكود مع جدول الأكواد.</p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">نوع المنتج *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                required
              >
                <option value="">اختر نوع المنتج</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">المتجر *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                required
              >
                <option value="">اختر المتجر</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">الكود الداخلي (SKU)</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="الكود الداخلي (SKU) — اختياري"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">حرف التصميم *</span>
              <input className="rounded-xl bg-neutral-800 p-4 uppercase" dir="ltr"
                value={designCode} maxLength={1} required placeholder="D"
                onChange={(e) => setDesignCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1))} />
              <span className="text-xs text-neutral-400">اكتب حرف التصميم مباشرة دون الحاجة لاختيار نوع المنتج.</span>
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">كود المنتج المقترح تلقائيًا</span>
              <input className="rounded-xl bg-neutral-800 p-4 text-neutral-300" disabled dir="ltr"
                value={codeLoading ? "..." : agentCode} placeholder="يظهر عند كتابة حرف التصميم" />
              <span className="text-xs text-neutral-400">{codeHint || "الرقم النهائي يثبت عند الحفظ؛ يمنع تكرار الكود."}</span>
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">اسم البراند *</span>
              <input className="rounded-xl bg-neutral-800 p-4" value={brandName}
                onChange={(e) => setBrandName(e.target.value)} placeholder="Dior / Fendi / Victoria" required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">اسم المنتج *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: بدلة لينو"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">الموديل / القصة</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="اختياري - مثال: Oversize"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">الخامة *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: لينو / ستان / قطن"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">اللون * — اختر أو اكتب لونًا جديدًا</span>
              <input className="rounded-xl bg-neutral-800 p-4" list="adora-product-colors"
                value={color} onChange={(e) => setColor(e.target.value)} required
                placeholder="اختر من القائمة أو اكتب لونًا جديدًا" />
              <datalist id="adora-product-colors">
                {knownColors.map((c) => <option key={c} value={c} />)}
              </datalist>
              <span className="text-xs text-neutral-400">الألوان الجديدة تُحفظ مع المنتج والمقاسات، وتظهر لاحقًا في الاقتراحات.</span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-2 text-xl font-bold">وصف ومواصفات المنتج</h2>
          <p className="mb-4 text-sm text-neutral-400">
            الوصف والعلامات البصرية اختياريان لجميع المنتجات؛ الكود يحدد التصميم واللون.
          </p>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">وصف المنتج (اختياري)</span>
              <textarea
                className="min-h-28 rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: بدلة لينو بقصة واسعة، ياقة V، رابطة جانبية، بدون أزرار ظاهرة، بنطال واسع"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required={false}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">العلامات البصرية (اختياري)</span>
              <textarea
                className="min-h-24 rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: ياقة V | رابطة جانبية | بدون أزرار | أكمام واسعة | بنطال واسع"
                value={visualFeatures}
                onChange={(e) => setVisualFeatures(e.target.value)}
                required={false}
              />
              <span className="text-xs text-neutral-500">
                اكتب فقط العلامات البصرية التي تميز التصميم. لا تكرر اللون هنا.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">السعر</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">تكلفة القطعة *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="تكلفة القطعة"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">سعر البيع *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="سعر البيع"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="mb-3 block font-bold">صورة المنتج / اللون *</label>
          <p className="mb-4 text-sm text-neutral-400">
            ضع أوضح صورة للون المنتج؛ سيعرضها الـAgent ضمن ألوان هذا التصميم.
          </p>

          <input type="file" accept="image/*" onChange={handleImageChange} required />

          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="mt-4 h-64 w-64 rounded-xl object-cover"
            />
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">المقاسات والكميات</h2>
              <p className="mt-1 text-sm text-neutral-400">
                اكتب الكمية فقط للمقاسات المتوفرة. المقاسات الفارغة لن تُحفظ.
              </p>
            </div>

            <p className="rounded-xl bg-neutral-800 px-4 py-2 text-sm">
              المقاسات المدخلة: {selectedSizeRows.length}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {sizeRows.map((row) => (
              <div key={row.size} className="rounded-xl bg-neutral-800 p-3">
                <label className="mb-2 block font-bold">{row.size}</label>
                <input
                  className="w-full rounded-lg bg-neutral-900 p-3"
                  type="number"
                  min="0"
                  placeholder="الكمية"
                  value={row.quantity}
                  onChange={(e) => updateSizeQuantity(row.size, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-950/30 p-4 text-yellow-300">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-white p-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ المنتج في المخزون"}
        </button>
      </form>
    </main>
  );
}
