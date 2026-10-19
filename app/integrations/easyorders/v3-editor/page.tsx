"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Product={href:string;src:string;title:string;price:string};
type Edit={href:string;src:string;title:string;subtitle:string};
type Video={url:string;poster:string};
type Review={quote:string;name:string};
type Settings={
 hero:{image:string;eyebrow:string;title:string;subtitle:string;buttonText:string};
 headings:{featured:string;edits:string;videos:string;reviews:string};
 story:{title:string;body:string;buttonText:string};
 order:string[];visibility:Record<string,boolean>;
 products:Product[];edits:Edit[];videos:Video[];reviews:Review[];
};
const names:Record<string,string>={
 hero:"الصورة الرئيسية",benefits:"مميزات المتجر",featured:"المنتجات الرئيسية",
 edit:"مجموعات الصور",story:"قصة Adora",videos:"الفيديوهات",reviews:"آراء العميلات",footer:"أسفل الموقع"
};
const keys=Object.keys(names);
const initial:Settings={
 hero:{image:"",eyebrow:"THE SATIN EDIT",title:"Adora Satin",subtitle:"بيجامات ستان بتصاميم مميزة، لأناقة وراحة في كل يوم.",buttonText:"SHOP PAJAMAS"},
 headings:{featured:"Most loved",edits:"Shop the edit",videos:"Adora in motion",reviews:"Loved by our customers"},
 story:{title:"Made with care, styled for your everyday comfort.",body:"Adora brings together elegant satin pajama designs for everyday comfort and effortless style.",buttonText:"SHOP ADORA"},
 order:[...keys],visibility:Object.fromEntries(keys.map(k=>[k,true])),
 products:[],edits:[],videos:[],reviews:[]
};
export default function AdoraV3Editor(){
 const [ready,setReady]=useState(false),[sessionLoading,setSessionLoading]=useState(true);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [settings,setSettings]=useState<Settings>(initial);
 const [catalog,setCatalog]=useState<Product[]>([]);
 const [query,setQuery]=useState("");
 const [tab,setTab]=useState("hero"),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[isPublished,setIsPublished]=useState(false);
 const [status,setStatus]=useState("");
 useEffect(()=>{supabase.auth.getUser().then(({data})=>setReady(!!data.user)).catch(()=>setReady(false)).finally(()=>setSessionLoading(false))},[]);
 useEffect(()=>{if(ready){void load();void loadCatalog()}},[ready]);
 async function headers(){const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error("سجل الدخول أولًا");return {Authorization:"Bearer "+session.access_token}}
 function update<K extends keyof Settings>(key:K,value:Settings[K]){setSettings(v=>({...v,[key]:value}))}
 function modify<K extends "hero"|"headings"|"story">(key:K,field:keyof Settings[K],value:string){setSettings(s=>({...s,[key]:{...s[key],[field]:value}}))}
 async function load(){
  try{const r=await fetch("/api/adora-v3/editor",{headers:await headers(),cache:"no-store"});const j=await r.json();
    if(!j.ok)throw Error(j.message);setSettings(j.config);setIsPublished(j.published);
    setNotice(j.published?"تم تحميل إعدادات V3 المنشورة":"المحرر جاهز. احفظ مرة واحدة لتجهيز إعدادات V3.");
  }catch(e){setNotice(e instanceof Error?e.message:"تعذر التحميل")}
 }
 async function loadCatalog(){
  try{const r=await fetch("/api/adora-v3/catalog",{headers:await headers()});const j=await r.json();
   if(j.ok)setCatalog(j.products);else setStatus(j.message);
  }catch{setStatus("لم نتمكن من جلب المنتجات. يمكنك إضافة روابط المنتجات يدويًا.")}
 }
 async function save(){
  setBusy(true);setNotice("");
  try{const r=await fetch("/api/adora-v3/editor",{method:"POST",headers:{...await headers(),"Content-Type":"application/json"},body:JSON.stringify(settings)});
   const j=await r.json();if(!j.ok)throw Error(j.message);
   setSettings(j.config);setIsPublished(true);setNotice("تم حفظ ونشر إعدادات V3 بنجاح.");}
  catch(e){setNotice(e instanceof Error?e.message:"فشل الحفظ")}
  finally{setBusy(false)}
 }
 async function upload(file:File,onComplete:(url:string)=>void){
  setBusy(true);setNotice("");
  try{const form=new FormData();form.set("image",file);
   const r=await fetch("/api/adora-v3/media",{method:"POST",headers:await headers(),body:form});
   const j=await r.json();if(!j.ok)throw Error(j.message);
   onComplete(j.url);setNotice("تم رفع الصورة. اضغط «نشر» لحفظها في المتجر.");}
  catch(e){setNotice(e instanceof Error?e.message:"تعذر رفع الصورة")}finally{setBusy(false)}
 }
 const input="w-full rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-white outline-none focus:border-white";
 const action="rounded-md border border-neutral-600 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50";
 function move<T>(a:T[],index:number,delta:number){const b=[...a],j=index+delta;if(j<0||j>=a.length)return a;[b[index],b[j]]=[b[j],b[index]];return b}
 function changeItem<K extends "products"|"edits"|"videos"|"reviews">(key:K,index:number,field:string,value:string){
  const a=settings[key].map((p,i)=>i===index?{...p,[field]:value}:p);
  setSettings(s=>({...s,[key]:a} as Settings));
 }
 const [picker,setPicker]=useState("");
 if(sessionLoading)return <main dir="rtl" className="p-8">جار التحميل...</main>;
 if(!ready)return <main dir="rtl" className="min-h-screen bg-neutral-950 p-6 text-white"><div className="mx-auto max-w-md space-y-4 rounded-xl border border-neutral-700 p-6">
   <h1 className="text-2xl font-bold">Adora V3 Editor</h1><p>سجّل الدخول بحساب مدير النظام لتعديل واجهة Adora.</p>
   <form className="space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);const x=await supabase.auth.signInWithPassword({email:email.trim(),password});setBusy(false);if(x.error)setNotice("بيانات الدخول غير صحيحة");else{setPassword("");setReady(true)}}}>
    <input type="email" required className={input} placeholder="البريد الإلكتروني" value={email} onChange={e=>setEmail(e.target.value)}/>
    <input type="password" required className={input} placeholder="كلمة المرور" value={password} onChange={e=>setPassword(e.target.value)}/>
    <button className="rounded bg-white px-5 py-3 text-black" disabled={busy}>دخول</button></form><p>{notice}</p>
   </div></main>;
 return <main dir="rtl" className="min-h-screen bg-neutral-950 p-4 text-white md:p-8">
 <div className="mx-auto max-w-6xl space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-700 pb-4">
    <div><h1 className="text-2xl font-bold">Adora V3 Editor</h1><p className="text-sm text-neutral-400">تغيير الصور وترتيب المنتجات والأقسام، ثم نشر التعديلات</p></div>
    <div className="flex gap-2"><a href="https://adora.ly" target="_blank" rel="noreferrer" className={action}>فتح المتجر ↗</a><button className="rounded bg-white px-5 py-2.5 font-bold text-black disabled:opacity-50" disabled={busy} onClick={save}>{busy?"انتظر...":"نشر التعديلات"}</button></div>
   </div>
   {notice&&<div role="status" className="rounded border border-neutral-600 p-3 text-sm">{notice}</div>}
   {status&&<div role="status" className="rounded border border-amber-600 p-3 text-sm text-amber-200">{status}</div>}
   <div className="rounded border border-neutral-700 p-3 text-sm text-neutral-300">الحفظ {isPublished?"مفعل":"لم يُنشر بعد"}. عند تغيير إعدادات المحرر، لا تتغير الصفحة حتى تضغط «نشر التعديلات». يعمل المتجر بالطلب والسلة الأصليين من EasyOrders.</div>
   <div className="grid gap-5 md:grid-cols-[220px_1fr]">
    <aside className="flex flex-wrap content-start gap-2 md:flex-col">
     {keys.map(k=><button key={k} onClick={()=>setTab(k)} className={"rounded-md border px-3 py-2 text-right text-sm "+(tab===k?"border-white bg-white text-black":"border-neutral-700")}>{names[k]}</button>)}
    </aside>
    <section className="min-w-0 space-y-4 rounded-xl border border-neutral-700 bg-neutral-950 p-4 md:p-6">
     <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{names[tab]}</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.visibility[tab]!==false} onChange={e=>update("visibility",{...settings.visibility,[tab]:e.target.checked})}/>إظهار القسم</label></div>
     {tab==="hero"&&<div className="space-y-4">
      {settings.hero.image&&<img src={settings.hero.image} alt="صورة الواجهة" className="max-h-64 w-full rounded object-contain bg-neutral-800"/>}
      <label className="block">صورة الواجهة <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,url=>modify("hero","image",url))}}/></label>
      <label className="block">أو رابط الصورة<input className={input} value={settings.hero.image} onChange={e=>modify("hero","image",e.target.value)} dir="ltr"/></label>
      {(["eyebrow","title","subtitle","buttonText"] as const).map(k=><label className="block" key={k}>{({eyebrow:"النص الصغير",title:"عنوان الواجهة",subtitle:"الوصف",buttonText:"نص الزر"})[k]}<input className={input} value={settings.hero[k]} onChange={e=>modify("hero",k,e.target.value)}/></label>)}
     </div>}
     {tab==="featured"&&<div className="space-y-4">
      <label>عنوان القسم<input className={input} value={settings.headings.featured} onChange={e=>modify("headings","featured",e.target.value)}/></label>
      <p className="text-sm text-neutral-400">اختر المنتجات من قائمة EasyOrders ثم استخدم الأسهم لتغيير ترتيب ظهورها. الضغط على المنتج يفتح صفحة المنتج الحقيقية.</p>
      <input className={input} placeholder="ابحث عن منتج بالاسم..." value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-neutral-700 p-2">
      {catalog.filter(p=>p.title.includes(query)).slice(0,150).map(p=><button key={p.href} className="flex w-full items-center gap-2 rounded p-2 text-right hover:bg-neutral-800" onClick={()=>{if(settings.products.some(x=>x.href===p.href))return;update("products",[...settings.products,p])}}><span className="flex-1">{p.title}</span><span className="text-xs text-neutral-400">+ إضافة</span></button>)}
      {!catalog.length&&<p className="p-2 text-sm text-neutral-400">تعذر تحميل الكتالوج؟ أضف رابط المنتج أدناه.</p>}</div>
      <button className={action} onClick={()=>update("products",[...settings.products,{href:"",src:"",title:"",price:""}])}>إضافة منتج برابط يدوي</button>
      {settings.products.map((p,i)=><div key={i} className="flex flex-col gap-2 rounded border border-neutral-700 p-3">
       <div className="flex items-center gap-2">{p.src&&<img src={p.src} alt="" className="h-16 w-14 object-cover"/>}<strong className="flex-1">{p.title||"منتج جديد"} — {i+1}</strong>
        <button className={action} disabled={!i} onClick={()=>update("products",move(settings.products,i,-1))}>↑</button>
        <button className={action} disabled={i===settings.products.length-1} onClick={()=>update("products",move(settings.products,i,1))}>↓</button>
        <button className={action} onClick={()=>update("products",settings.products.filter((_,n)=>n!==i))}>حذف</button></div>
       {(["href","src","title","price"] as const).map(k=><label className="text-xs" key={k}>{({href:"رابط المنتج",src:"رابط الصورة",title:"الاسم",price:"السعر المعروض"})[k]}<input className={input} value={p[k]} onChange={e=>changeItem("products",i,k,e.target.value)} dir={k==="title"?"rtl":"ltr"}/></label>)}
      </div>)}
     </div>}
     {tab==="edit"&&<div className="space-y-4">
      <label>عنوان القسم<input className={input} value={settings.headings.edits} onChange={e=>modify("headings","edits",e.target.value)}/></label>
      <button className={action} onClick={()=>update("edits",[...settings.edits,{title:"",subtitle:"",src:"",href:"#adora-v3-best"}])}>إضافة صورة / مجموعة</button>
      {settings.edits.map((item,i)=><div key={i} className="space-y-2 rounded border border-neutral-700 p-3">
       <div className="flex gap-2"><strong className="flex-1">الصورة {i+1}</strong><button className={action} disabled={!i} onClick={()=>update("edits",move(settings.edits,i,-1))}>↑</button><button className={action} disabled={i===settings.edits.length-1} onClick={()=>update("edits",move(settings.edits,i,1))}>↓</button><button className={action} onClick={()=>update("edits",settings.edits.filter((_,n)=>n!==i))}>حذف</button></div>
       {item.src&&<img src={item.src} alt="" className="h-28 object-contain"/>}
       <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f,url=>changeItem("edits",i,"src",url))}}/>
       {(["title","subtitle","src","href"] as const).map(k=><label className="block text-sm" key={k}>{({title:"عنوان المجموعة",subtitle:"وصف",src:"رابط الصورة",href:"الرابط عند الضغط"})[k]}<input className={input} value={item[k]} onChange={e=>changeItem("edits",i,k,e.target.value)}/></label>)}
      </div>)}
     </div>}
     {tab==="story"&&<div className="space-y-3">
      <label>عنوان القصة<input className={input} value={settings.story.title} onChange={e=>modify("story","title",e.target.value)}/></label>
      <label>النص<textarea className={input} rows={5} value={settings.story.body} onChange={e=>modify("story","body",e.target.value)}/></label>
      <label>زر القصة<input className={input} value={settings.story.buttonText} onChange={e=>modify("story","buttonText",e.target.value)}/></label>
     </div>}
     {tab==="videos"&&<div className="space-y-3">
      <label>عنوان القسم<input className={input} value={settings.headings.videos} onChange={e=>modify("headings","videos",e.target.value)}/></label>
      <button className={action} onClick={()=>update("videos",[...settings.videos,{url:"",poster:""}])}>إضافة فيديو</button>
      {settings.videos.map((v,i)=><div className="space-y-2 rounded border border-neutral-700 p-3" key={i}>
       <div className="flex justify-between">فيديو {i+1}<button className={action} onClick={()=>update("videos",settings.videos.filter((_,n)=>n!==i))}>حذف</button></div>
       <input placeholder="رابط MP4 مباشر HTTPS" className={input} value={v.url} onChange={e=>changeItem("videos",i,"url",e.target.value)} dir="ltr"/>
       <input placeholder="رابط صورة الغلاف (اختياري)" className={input} value={v.poster} onChange={e=>changeItem("videos",i,"poster",e.target.value)} dir="ltr"/>
       <div className="flex gap-2"><button className={action} disabled={!i} onClick={()=>update("videos",move(settings.videos,i,-1))}>↑</button><button className={action} disabled={i===settings.videos.length-1} onClick={()=>update("videos",move(settings.videos,i,1))}>↓</button></div>
      </div>)}
     </div>}
     {tab==="reviews"&&<div className="space-y-3">
      <label>عنوان القسم<input className={input} value={settings.headings.reviews} onChange={e=>modify("headings","reviews",e.target.value)}/></label>
      <p className="text-xs text-neutral-400">أضف تقييمات حقيقية فقط، بموافقة أصحابها.</p>
      <button className={action} onClick={()=>update("reviews",[...settings.reviews,{quote:"",name:""}])}>إضافة تقييم</button>
      {settings.reviews.map((v,i)=><div className="space-y-2 rounded border border-neutral-700 p-3" key={i}>
       <textarea className={input} rows={3} value={v.quote} onChange={e=>changeItem("reviews",i,"quote",e.target.value)} placeholder="نص تقييم العميلة"/>
       <input className={input} value={v.name} onChange={e=>changeItem("reviews",i,"name",e.target.value)} placeholder="اسم العرض"/>
       <div className="flex gap-2"><button className={action} disabled={!i} onClick={()=>update("reviews",move(settings.reviews,i,-1))}>↑</button><button className={action} disabled={i===settings.reviews.length-1} onClick={()=>update("reviews",move(settings.reviews,i,1))}>↓</button><button className={action} onClick={()=>update("reviews",settings.reviews.filter((_,n)=>n!==i))}>حذف</button></div>
      </div>)}
     </div>}
     {tab==="benefits"&&<p className="text-neutral-300">المميزات الأربع المعتمدة محفوظة في V3. يمكنك إظهار القسم أو إخفاؤه وتغيير مكانه.</p>}
     {tab==="footer"&&<p className="text-neutral-300">الفوتر يستخدم روابط المتجر الأصلية؛ تستطيع إظهار القسم أو إخفاءه وتغيير مكانه.</p>}
    </section>
   </div>
   <section className="space-y-3 rounded-xl border border-neutral-700 p-4"><h2 className="text-xl font-bold">ترتيب أقسام الواجهة</h2><p className="text-sm text-neutral-400">غيّر ترتيب الأقسام بواسطة الأسهم، ثم اضغط «نشر التعديلات» في أعلى الصفحة.</p>
    <div className="grid gap-2 md:grid-cols-2">{settings.order.map((key,i)=><div key={key} className="flex items-center gap-2 rounded border border-neutral-700 p-2">
     <span className="flex-1">{i+1}. {names[key]||key}</span>
     <button className={action} disabled={!i} onClick={()=>update("order",move(settings.order,i,-1))}>↑</button>
     <button className={action} disabled={i===settings.order.length-1} onClick={()=>update("order",move(settings.order,i,1))}>↓</button>
    </div>)}</div>
   </section>
   <div className="flex justify-end"><button className="rounded bg-white px-7 py-3 font-bold text-black disabled:opacity-50" disabled={busy} onClick={save}>نشر التعديلات على V3</button></div>
 </div></main>;
}
