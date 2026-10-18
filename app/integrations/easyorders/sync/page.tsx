"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  product_id: string; title: string; sku: string;
  status: "invalid" | "conflict" | "exists" | "new";
  issues: string[]; url: string | null;
};
type Scan = {
  ok: boolean; mode?: string; message?: string;
  category?: { id: string; name: string; slug: string };
  summary?: {
    approved: number; variants: number; ready_to_create: number; already_exists: number;
    blocked: number; others_in_erp: number; remote_total: number;
  };
  products?: Row[];
};
type Result = {
  product_id: string; title: string; status: string; message: string;
  remote_url?: string;
};

function outcomeIsGood(s: string) { return ["created","already_linked","category_linked"].includes(s); }

export default function AdoraSyncPage() {
  const [authLoading,setAuthLoading] = useState(true);
  const [loggedIn,setLoggedIn] = useState(false);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [running,setRunning] = useState(false);
  const [scan,setScan] = useState<Scan | null>(null);
  const [results,setResults] = useState<Record<string,Result>>({});
  const [info,setInfo] = useState("");
  const [progress,setProgress] = useState("");
  const stop = useRef(false);

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{
      setLoggedIn(Boolean(data.user));setAuthLoading(false);
    }).catch(()=>setAuthLoading(false));
  },[]);

  async function login(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setInfo("");
    const {data,error}=await supabase.auth.signInWithPassword({
      email:email.trim().toLowerCase(),password,
    });
    if(error || !data.session) setInfo("تعذر تسجيل الدخول إلى ERP.");
    else {setLoggedIn(true);setPassword("");}
    setBusy(false);
  }
  async function token() {
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token) throw new Error("انتهت جلسة تسجيل الدخول إلى ERP.");
    return session.access_token;
  }
  async function audit() {
    setBusy(true);setScan(null);setInfo("");
    try {
      const r=await fetch("/api/integrations/easyorders/sync-adora",{
        method:"GET",headers:{Authorization:"Bearer "+await token()},cache:"no-store",
      });
      const data=await r.json() as Scan;
      setScan(data);
      if(!data.ok) setInfo(data.message || "تعذر فحص المزامنة.");
      else setInfo("نجح الفحص. لا توجد تغييرات في المتجر حتى الآن.");
    }catch(e) {
      setInfo(e instanceof Error?e.message:"تعذر الاتصال.");
    }finally{setBusy(false);}
  }

  async function syncAll() {
    if(!scan?.ok || !scan.category?.id || !scan.products) return;
    if(running || scan.summary?.blocked) {
      setInfo("يوجد منتج به مشكلة في البيانات. أصلح المشاكل قبل النشر.");return;
    }
    if(!window.confirm(
      "سيتم إنشاء منتجات Adora المعتمدة الجديدة داخل EasyOrders تحت قسم بيجامة ستان. سيُفحص المنتج المنشور سابقًا دون إنشاء نسخة مكررة. هل توافق؟"
    )) return;
    setResults({});setInfo("");setRunning(true);stop.current=false;
    const targets=[...scan.products].filter(p=>p.status==="new" || p.status==="exists")
      .sort((a,b)=> Number(a.status==="exists")-Number(b.status==="exists"));
    const completed:Record<string,Result>={};
    try {
      for(let i=0;i<targets.length;i++) {
        if(stop.current) {setInfo("تم الإيقاف بعد المنتج الحالي. يمكنك إعادة الفحص لاحقًا.");break;}
        // EasyOrders allows 40 requests/minute. Each item involves several
        // verification reads plus one write, so pace sequential processing.
        if(i>0) {
          setProgress("انتظار قصير لحماية الاتصال من حد EasyOrders (40 طلبًا/دقيقة)...");
          await new Promise<void>(resolve=>setTimeout(resolve,11000));
          if(stop.current) {setInfo("تم إيقاف العملية. استخدم الفحص لاحقًا لاستكمال الباقي.");break;}
        }
        const p=targets[i];
        setProgress("مزامنة "+(i+1)+" من "+targets.length+": "+p.title);
        const r=await fetch("/api/integrations/easyorders/sync-adora",{
          method:"POST",
          headers:{
            Authorization:"Bearer "+await token(),
            "Content-Type":"application/json",
          },
          body:JSON.stringify({
            product_id:p.product_id,category_id:scan.category.id,
            confirmation:"SYNC_APPROVED_ADORA_PYJAMAS",
          }),
          cache:"no-store",
        });
        const data=await r.json() as {ok?:boolean;result?:Result;message?:string};
        const result=data.result||{
          product_id:p.product_id,title:p.title,
          status:"request_failed",message:data.message||"لم نتمكن من تحديد نتيجة المنتج.",
        };
        completed[p.product_id]=result;
        setResults({...completed});
        if(!r.ok || !data.ok || !outcomeIsGood(result.status)) {
          setInfo("توقفت المزامنة لحماية المنتجات من التكرار أو تعديل بيانات غير مؤكدة. راجع آخر نتيجة.");
          break;
        }
      }
      if(Object.keys(completed).length===targets.length &&
        Object.values(completed).every(x=>outcomeIsGood(x.status)))
        setInfo("انتهت عملية النقل بدون أخطاء مُعلنة. افحص منتجات EasyOrders وصور كل منتج ومقاساته.");
    }catch {
      setInfo("انقطع الاتصال أثناء النشر. لا تكرر النشر قبل إعادة فحص المتجر.");
    }finally{
      setRunning(false);setProgress("");
    }
  }

  const count=Object.values(results).filter(r=>r.status==="created").length;
  return <main dir="rtl" className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">مزامنة منتجات Adora مع EasyOrders</h1>
      <p className="leading-7 text-neutral-300">
        القسم المستهدف: «بيجامة ستان». نعتمد أسماء المنتجات التي وافقت عليها،
        ونسحب المقاسات والأسعار والكميات والصورة الرئيسية مباشرة من ERP.
        المنتجات التجريبية لا تُحذف، والمنتجات الموجودة لا تُنشأ مرة أخرى.
      </p>
      <p className="rounded-lg border border-amber-600 p-3 text-sm text-amber-200">
        هذه الصفحة لن تغيّر الصور أو الأوصاف للمنتجات الموجودة. المزامنة الحالية هي نشر
        وربط بالقسم؛ مزامنة تحديثات المخزون والأسعار تلقائيًا لم تُفعّل بعد.
      </p>
      {authLoading ? <p>جاري فحص جلسة ERP...</p> : !loggedIn ?
        <form onSubmit={login} className="max-w-md space-y-3">
          <input required type="email" dir="ltr" aria-label="البريد الإلكتروني"
            placeholder="البريد الإلكتروني" className="w-full rounded bg-neutral-800 p-3"
            value={email} onChange={e=>setEmail(e.target.value)} />
          <input required type="password" dir="ltr" aria-label="كلمة المرور"
            placeholder="كلمة المرور" className="w-full rounded bg-neutral-800 p-3"
            value={password} onChange={e=>setPassword(e.target.value)} />
          <button disabled={busy} className="rounded bg-white px-5 py-3 font-semibold text-black">
            تسجيل الدخول
          </button>
        </form> : <>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={audit} disabled={busy||running}
            className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-40">
            {busy?"جاري الفحص...":"1 — فحص المنتجات والقسم"}
          </button>
          <button type="button" onClick={syncAll}
            disabled={!scan?.ok || !scan.category || running || busy || !!scan.summary?.blocked}
            className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold disabled:opacity-40">
            {running?"جاري المزامنة...":"2 — مزامنة جميع المنتجات المعتمدة"}
          </button>
          {running && <button type="button" onClick={()=>{stop.current=true;}}
            className="rounded-lg border border-amber-400 px-5 py-3">
            إيقاف بعد المنتج الحالي
          </button>}
        </div>
        {scan?.ok && scan.summary && <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
          <p className="font-semibold">القسم: {scan.category?.name} — تم التعرف عليه من EasyOrders</p>
          <p>المعتمدة: {scan.summary.approved} | جاهزة للإنشاء: {scan.summary.ready_to_create}
          {" | "}موجودة مسبقًا: {scan.summary.already_exists} | مشاكل: {scan.summary.blocked}</p>
          <p className="text-xs text-neutral-400">مقاسات ERP: {scan.summary.variants} |
            منتجات EasyOrders الحالية: {scan.summary.remote_total} |
            منتجات ERP غير معتمدة: {scan.summary.others_in_erp}</p>
        </div>}
        {progress && <p role="status" className="text-cyan-300">{progress}</p>}
        {info && <p role="status" className="rounded-lg border border-neutral-700 p-3">{info}</p>}
        {Object.keys(results).length>0 && <p className="font-semibold">تم إنشاء {count} منتجًا جديدًا خلال هذه العملية.</p>}
        <div className="space-y-2">
          {scan?.products?.map(p=>{
            const result=results[p.product_id];
            return <section key={p.product_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-900 p-3">
              <div>
                <p className="font-semibold">{p.title}</p>
                <p className="text-xs text-neutral-400">{p.sku}</p>
                {p.issues.length>0 && <p className="text-sm text-amber-300">{p.issues.join("، ")}</p>}
                {result && <p className="text-sm">{result.message}</p>}
              </div>
              <div>
                <span className="text-sm text-neutral-300">
                  {result?result.status:p.status==="new"?"بانتظار النشر":
                    p.status==="exists"?"منشور سابقًا":p.status==="conflict"?"تضارب":"بيانات ناقصة"}
                </span>
                {(result?.remote_url||p.url) && <p className="text-sm">
                  <a href={result?.remote_url||p.url||"#"} target="_blank" rel="noreferrer"
                    className="text-cyan-300 underline">عرض في المتجر</a>
                </p>}
              </div>
            </section>;
          })}
        </div>
      </>}
    </div>
  </main>;
}
