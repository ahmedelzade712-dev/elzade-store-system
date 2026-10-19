"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
type Row={id:string;name:string;official_name:string|null;published_shipping_lyd:number|null;status:string;note:string};
type Audit={ok:boolean;message?:string;warning?:string;source?:string;
 summary?:{erp_city_count:number;confirmed:number;unverified:number;special:number;official_missing_from_erp:number};
 cities?:Row[];official_missing_from_erp?:{name:string;price:number}[]};
export default function AdoraShippingAudit(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[audit,setAudit]=useState<Audit|null>(null);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 useEffect(()=>{supabase.auth.getUser().then(x=>setReady(Boolean(x.data.user))).catch(()=>setReady(false))},[]);
 async function inspect(){
  setBusy(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("سجل دخول مدير ERP");
   const r=await fetch("/api/integrations/easyorders/shipping-adora",{headers:{Authorization:"Bearer "+session.access_token}});
   setAudit(await r.json());
  }catch(e){setAudit({ok:false,message:e instanceof Error?e.message:"تعذر الاتصال"})}
  finally{setBusy(false)}
 }
 return <main dir="rtl" className="min-h-screen bg-neutral-950 p-7 text-white"><div className="mx-auto max-w-6xl space-y-5">
   <h1 className="text-2xl font-bold">مراجعة أسعار المعيار — Adora / EasyOrders</h1>
   <p className="rounded border border-amber-600 p-3 text-amber-200">فحص فقط: لا يغير رسوم الشحن أو المدن أو بيانات الطلبات.</p>
   {!ready?<form className="max-w-md space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);
    const x=await supabase.auth.signInWithPassword({email:email.trim(),password});
    setBusy(false);if(x.error)setAudit({ok:false,message:"تعذر تسجيل الدخول"});else{setReady(true);setPassword("")}}}>
     <input aria-label="البريد الإلكتروني" type="email" required dir="ltr" className="block w-full rounded bg-neutral-800 p-3" placeholder="بريد المدير" value={email} onChange={e=>setEmail(e.target.value)}/>
     <input aria-label="كلمة المرور" type="password" required className="block w-full rounded bg-neutral-800 p-3" placeholder="كلمة المرور" value={password} onChange={e=>setPassword(e.target.value)}/>
     <button disabled={busy} className="rounded bg-white p-3 text-black">تسجيل الدخول</button>
   </form>:<button onClick={inspect} disabled={busy} className="rounded bg-white p-3 text-black">{busy?"جار الفحص...":"فحص المدن من ERP"}</button>}
   {audit&&!audit.ok&&<p className="rounded bg-red-950 p-3">{audit.message}</p>}
   {audit?.ok&&<><p className="rounded border border-amber-600 p-3">{audit.warning}</p>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[
      ["مدن ERP",audit.summary?.erp_city_count],["أسعار موثقة",audit.summary?.confirmed],
      ["بدون سعر متحقق",audit.summary?.unverified],["خدمات خاصة",audit.summary?.special]
     ].map(([label,v])=><div key={String(label)} className="rounded bg-neutral-900 p-4"><p className="text-neutral-400">{label}</p><p className="text-2xl font-bold">{v}</p></div>)}</div>
    <p className="text-sm"><a className="underline" href={audit.source} target="_blank" rel="noreferrer">المصدر: جدول المعيار الرسمي، فرع طرابلس</a></p>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-right text-sm">
     <thead className="bg-neutral-800"><tr>{["مدينة ERP","اسم منشور","سعر (د.ل)","التفسير"].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead>
     <tbody>{audit.cities?.map(c=><tr key={c.id} className="border-b border-neutral-700"><td className="p-2">{c.name}</td><td className="p-2">{c.official_name||"—"}</td><td className="p-2">{c.published_shipping_lyd??"غير متحقق"}</td><td className="p-2">{c.note}</td></tr>)}</tbody>
    </table></div>
    <section className="space-y-2"><h2 className="text-lg font-bold">وجهات منشورة ولم تُطابق مدن ERP</h2>
     {audit.official_missing_from_erp?.map(c=><p key={c.name}>{c.name}: {c.price} د.ل</p>)}
    </section>
   </>}
 </div></main>
}
