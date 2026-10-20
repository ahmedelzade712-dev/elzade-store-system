import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import sharp from "sharp";
import {randomUUID} from "crypto";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const BUCKET="adora-v3-editor";
const reply=(x:Record<string,unknown>,s=200)=>NextResponse.json(x,{status:s,headers:{"Cache-Control":"no-store"}});
export async function POST(req:Request){
 const raw=req.headers.get("authorization")||"";
 const token=raw.startsWith("Bearer ")?raw.slice(7).trim():"";
 if(!token)return reply({ok:false,message:"غير مصرح"},403);
 const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
 if(error||!user)return reply({ok:false,message:"غير مصرح"},403);
 const {data:p}=await supabaseAdmin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 if(p?.role!=="admin"||p.is_active!==true)return reply({ok:false,message:"يتطلب حساب مدير"},403);
 try{
  const form=await req.formData();
  const file=form.get("image");
  if(!(file instanceof File))return reply({ok:false,message:"اختر صورة"},400);
  if(file.size>9*1024*1024 || file.size<10)return reply({ok:false,message:"الحد الأقصى للصورة 9MB"},400);
  if(!["image/png","image/webp","image/jpeg"].includes(file.type))return reply({ok:false,message:"صيغة الصورة غير مدعومة"},400);
  const bytes=Buffer.from(await file.arrayBuffer());
  const converted=await sharp(bytes,{limitInputPixels:36000000}).rotate().resize({width:1600,height:2200,fit:"inside",withoutEnlargement:true}).webp({quality:83}).toBuffer();
  const name="images/"+randomUUID()+".webp";
  const {error:upError}=await supabaseAdmin.storage.from(BUCKET).upload(name,converted,{contentType:"image/webp",cacheControl:"31536000",upsert:false});
  if(upError){console.error("adora media",upError.message);return reply({ok:false,message:"تعذر رفع الصورة. افتح المحرر واحفظ الإعدادات مرة واحدة لتجهيز مساحة التخزين ثم حاول مجددًا."},503)}
  const {data}=supabaseAdmin.storage.from(BUCKET).getPublicUrl(name);
  return reply({ok:true,url:data.publicUrl});
 }catch(e){console.error("adora media",e instanceof Error?e.message:"error");return reply({ok:false,message:"فشل رفع الصورة"},503)}
}
