"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
type Result={ok:boolean;status?:string;message?:string;summary?:{name:string;sizes:string[];variation_type:string;variant_count:number;image_count:number}};
export default function Appearance(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null);
 useEffect(()=>{supabase.auth.getUser().then(x=>setReady(Boolean(x.data.user))).catch(()=>setReady(false))},[]);
 async function execute(publish:boolean){
  setBusy(true);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw Error("سجل الدخول إلى ERP أولاً");
   const r=await fetch("/api/integrations/easyorders/size-buttons",{method:publish?"POST":"GET",headers:{Authorization:"Bearer "+session.access_token,...(publish?{"Content-Type":"application/json"}:{})},...(publish?{body:JSON.stringify({confirmation:"SET_SIZE_BUTTONS_ADORA"})}:{})});
   setResult(await r.json());
  }catch(e){setResult({ok:false,message:e instanceof Error?e.message:"تعذر الاتصال"})}
  finally{setBusy(false)}
 }
 return <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white"><section className="mx-auto max-w-xl space-y-5">
 <h1 className="text-2xl font-bold">تعديل المقاسات إلى أزرار</h1><p>المنتج الأحمر فقط. لا تغيير للأسعار أو الصور أو المخزون.</p>
 {!ready?<p>افتح الصفحة بعد تسجيل الدخول إلى ERP.</p>:<button disabled={busy} className="rounded bg-white p-3 text-black" onClick={()=>execute(false)}>فحص المقاسات</button>}
 {result&&<div className="space-y-2 border p-4"><p>{result.message}</p>{result.summary&&<p>{result.summary.name} — {result.summary.variation_type} — {result.summary.sizes.join(" | ")}</p>}</div>}
 {result?.ok&&result.status==="ready"&&<button disabled={busy} className="rounded bg-green-600 p-3" onClick={()=>{if(window.confirm("تغيير عرض المقاسات إلى أزرار؟"))void execute(true)}}>تحويل المقاسات إلى أزرار</button>}
 {result?.status==="updated_verified"&&<a className="underline" href="https://adora.ly/products/adora-ce8563f5-d387-449e-908a-1533be81322d">فتح المنتج</a>}
 </section></main>
}