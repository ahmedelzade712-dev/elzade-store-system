"use client";

import {useState} from "react";
import {supabase} from "@/lib/supabase";

type Result = {
  ok?:boolean;passed?:boolean;store?:string;product_count?:number;
  linked_count?:number;checked_requests?:number;failed_checks?:number;
  failures?:string[];warning?:string|null;error?:string;
  active_code_count?:number;
  missing_products?:Array<{id:string;name:string;reason:string}>;
  inactive_code_products?:Array<{id:string;name:string;code?:string;reason:string}>;
};

export default function CatalogLiveCheckPage() {
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Result|null>(null);
  async function run() {
    if(busy)return;
    setBusy(true);
    setResult(null);
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error("يجب تسجيل الدخول أولًا بحساب المدير");
      const response=await fetch("/api/agent/catalog-live-check",{
        headers:{Authorization:"Bearer "+session.access_token},
        cache:"no-store"
      });
      const json=await response.json();
      if(!response.ok||!json.ok) throw new Error(json.error||"تعذر إكمال الاختبار");
      setResult(json);
    } catch(error) {
      setResult({ok:false,error:error instanceof Error?error.message:"فشل الاختبار"});
    } finally {
      setBusy(false);
    }
  }
  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-6 text-white md:p-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <a href="/products" className="text-neutral-300 underline">العودة إلى المنتجات</a>
        <h1 className="text-3xl font-semibold">فحص كتالوج Adora النهائي</h1>
        <p className="text-neutral-300">
          اختبار قراءة فقط، يستخدم وظيفة البحث الحقيقية وجميع منتجات Adora المسجلة.
          لا ينشئ منتجات أو طلبات، ولا يعدّل الأكواد أو الأسعار أو المخزون.
        </p>
        <button onClick={run} disabled={busy}
          className="rounded-xl bg-white px-6 py-3 font-medium text-black disabled:opacity-60">
          {busy?"جاري فحص الأكواد والأسعار والمقاسات والبحث...":"تشغيل الفحص النهائي"}
        </button>
        {result && (
          <section className="space-y-4 rounded-xl border border-neutral-700 bg-neutral-900 p-5">
            {result.ok ? (
              <>
                <h2 className={"text-xl font-bold "+(result.passed?"text-green-400":"text-red-300")}>
                  {result.passed?"اجتاز جميع الفحوصات":"توجد نتائج تحتاج مراجعة"}
                </h2>
                <p>المنتجات النشطة: {result.product_count} — الأكواد المرتبطة: {result.linked_count} — الأكواد المفعّلة: {result.active_code_count}</p>
                {(result.missing_products||[]).length>0 && (
                  <div className="rounded-lg border border-red-500 p-3">
                    <p className="font-bold text-red-300">منتجات بدون كود</p>
                    {(result.missing_products||[]).map(p=><p key={p.id}>{p.name} — {p.id}</p>)}
                  </div>
                )}
                {(result.inactive_code_products||[]).length>0 && (
                  <div className="rounded-lg border border-yellow-500 p-3">
                    <p className="font-bold text-yellow-300">منتجات مرتبطة بأكواد غير مفعّلة</p>
                    {(result.inactive_code_products||[]).map(p=><p key={p.id}>{p.name} — {p.code}</p>)}
                  </div>
                )}
                <p>طلبات البحث المفحوصة: {result.checked_requests} — الأخطاء: {result.failed_checks}</p>
                {result.warning && <p className="text-yellow-300">{result.warning}</p>}
                {(result.failures||[]).length>0 && (
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {result.failures!.map((x,i)=><li key={i}>{x}</li>)}
                  </ul>
                )}
              </>
            ) : <p className="text-red-300">{result.error}</p>}
            <p className="text-xs text-neutral-400">
              يمكنك نسخ نتيجة الفحص لمراجعتها. لا تتضمن هذه النتيجة بيانات الزبائن.
            </p>
            <button className="rounded-lg border border-neutral-500 px-4 py-2"
              onClick={()=>navigator.clipboard.writeText(JSON.stringify(result,null,2))}>
              نسخ النتيجة
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
