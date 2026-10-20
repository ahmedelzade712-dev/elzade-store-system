import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const BUCKET = "adora-v3-editor";
const FILENAME = "config.json";

const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function admin(request:Request){
 const raw=request.headers.get("authorization")||"";
 const token=raw.startsWith("Bearer ")?raw.slice(7).trim():"";
 if(!token)return false;
 const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
 if(error||!user)return false;
 const {data:profile,error:e}=await supabaseAdmin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 return !e && profile?.role==="admin" && profile.is_active===true;
}
async function bucket(){
 const {data,error}=await supabaseAdmin.storage.getBucket(BUCKET);
 if(data)return;
 if(error && !/not found|does not exist/i.test(error.message)) {
   // The create call returns a clearer message for any absent bucket.
 }
 const created=await supabaseAdmin.storage.createBucket(BUCKET,{public:true,fileSizeLimit:10485760,allowedMimeTypes:["application/json","image/webp","image/jpeg","image/png","video/mp4","text/javascript","application/javascript"]});
 if(created.error && !/already exists|duplicate/i.test(created.error.message))throw new Error("تعذر تجهيز مساحة ملفات V3: "+created.error.message);
}
const configUrl=()=>`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${FILENAME}`;
const clean=(s:unknown,max=500)=>typeof s==="string"?s.trim().slice(0,max):"";
const safeUrl=(s:unknown)=>{
 const str=clean(s,1500);
 if(!str)return "";
 if(str.startsWith("/") && !str.startsWith("//"))return str;
 try{const u=new URL(str);return u.protocol==="https:"?u.href:""}catch{return ""}
};
function sanitize(raw:unknown){
 const x=(raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{}) as Record<string,unknown>;
 const hero=(x.hero&&typeof x.hero==="object"?x.hero:{}) as Record<string,unknown>;
 const story=(x.story&&typeof x.story==="object"?x.story:{}) as Record<string,unknown>;
 const headings=(x.headings&&typeof x.headings==="object"?x.headings:{}) as Record<string,unknown>;
 const validSections=["hero","benefits","featured","edit","story","videos","reviews","footer"];
 const order=Array.isArray(x.order)?[...new Set(x.order.filter((v):v is string=>typeof v==="string" && validSections.includes(v)))]:validSections;
 const visibility=(x.visibility&&typeof x.visibility==="object"?x.visibility:{}) as Record<string,unknown>;
 const arrays=(key:string,limit:number)=>Array.isArray(x[key])?x[key].slice(0,limit).filter((v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)):[];
 const products=arrays("products",50).map((p:Record<string,unknown>)=>({
  href:safeUrl(p.href),src:safeUrl(p.src),title:clean(p.title,180),price:clean(p.price,70)
 })).filter((p:{href:string;src:string})=>p.href.startsWith("/")||p.href.startsWith("https://adora.ly/")||p.href.startsWith("https://www.adora.ly/"));
 const edits=arrays("edits",24).map((p:Record<string,unknown>)=>({href:safeUrl(p.href),src:safeUrl(p.src),title:clean(p.title,150),subtitle:clean(p.subtitle,80)}));
 const videos=arrays("videos",12).map((v:Record<string,unknown>)=>({url:safeUrl(v.url),poster:safeUrl(v.poster)})).filter((v:{url:string})=>v.url);
 const reviews=arrays("reviews",16).map((v:Record<string,unknown>)=>({quote:clean(v.quote,800),name:clean(v.name,80)})).filter((v:{quote:string})=>v.quote);
 const safeOrder=[...order,...validSections.filter(v=>!order.includes(v))];
 return {version:1,updatedAt:new Date().toISOString(),
  hero:{image:safeUrl(hero.image),eyebrow:clean(hero.eyebrow,90)||"THE SATIN EDIT",
   title:clean(hero.title,130)||"Adora Satin",
   subtitle:clean(hero.subtitle,350)||"بيجامات ستان بتصاميم مميزة، لأناقة وراحة في كل يوم.",
   buttonText:clean(hero.buttonText,65)||"SHOP PAJAMAS"},
  headings:{featured:clean(headings.featured,120)||"Most loved",edits:clean(headings.edits,120)||"Shop the edit",
   videos:clean(headings.videos,120)||"Adora in motion",reviews:clean(headings.reviews,120)||"Loved by our customers"},
  story:{title:clean(story.title,200)||"Made with care, styled for your everyday comfort.",
   body:clean(story.body,1200)||"Adora brings together elegant satin pajama designs for everyday comfort and effortless style.",
   buttonText:clean(story.buttonText,80)||"SHOP ADORA"},
  order:safeOrder,visibility:Object.fromEntries(validSections.map(v=>[v,visibility[v]!==false])),
  products,edits,videos,reviews
 };
}
export async function GET(req:Request){
 if(!(await admin(req)))return reply({ok:false,message:"يجب تسجيل الدخول بحساب مدير المتجر"},403);
 try{
  await bucket();
  const {data,error}=await supabaseAdmin.storage.from(BUCKET).download(FILENAME);
  const saved=(!error&&data)?JSON.parse(await data.text()):null;
  return reply({ok:true,config:sanitize(saved),configUrl:configUrl(),published:!!saved});
 }catch(e){console.error("V3 get",e instanceof Error?e.message:"error");return reply({ok:false,message:"تعذر تحميل إعدادات V3"},503)}
}
export async function POST(req:Request){
 if(!(await admin(req)))return reply({ok:false,message:"يجب تسجيل الدخول بحساب مدير المتجر"},403);
 let body:unknown;
 try{body=await req.json()}catch{return reply({ok:false,message:"بيانات غير صالحة"},400)}
 const value=sanitize(body);
 try{
  await bucket();
  const payload=Buffer.from(JSON.stringify(value));
  const {error}=await supabaseAdmin.storage.from(BUCKET).upload(FILENAME,payload,{upsert:true,contentType:"application/json",cacheControl:"0"});
  if(error)throw error;
  return reply({ok:true,message:"حُفظت إعدادات V3 ونُشرت",config:value,configUrl:configUrl()});
 }catch(e){console.error("V3 save",e instanceof Error?e.message:"error");return reply({ok:false,message:"تعذر حفظ إعدادات V3"},503)}
}
