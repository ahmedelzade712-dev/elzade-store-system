import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const API="https://api.easy-orders.net/api/v1/external-apps/products";
const reply=(x:Record<string,unknown>,s=200)=>NextResponse.json(x,{status:s,headers:{"Cache-Control":"no-store"}});
type Obj=Record<string,unknown>;
const obj=(v:unknown):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};
const str=(v:unknown):string=>typeof v==="string"?v.trim():"";
const arr=(v:unknown):Obj[]=>{
 const a=obj(v),d=obj(a.data);
 const items=[v,a.data,a.products,a.items,a.results,d.data,d.products,d.items].find(Array.isArray);
 return Array.isArray(items)?items.map(obj):[];
};
function photo(x:Obj){
 const raw=[x.image,x.image_url,x.main_image,x.main_image_url,x.thumbnail,x.thumbnail_url,x.images];
 for(const item of raw){
  if(typeof item==="string"&&/^https:\/\//.test(item))return item;
  if(Array.isArray(item)&&item.length){const first=item[0];if(typeof first==="string"&&first.startsWith("https://"))return first;
   const o=obj(first);const u=str(o.url)||str(o.src)||str(o.image);if(u.startsWith("https://"))return u;
  }
  const o=obj(item);const u=str(o.url)||str(o.src);if(u.startsWith("https://"))return u;
 }
 return "";
}
export async function GET(req:Request){
 const auth=req.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
 if(!token)return reply({ok:false,message:"غير مصرح"},403);
 const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
 if(error||!user)return reply({ok:false,message:"غير مصرح"},403);
 const {data:p}=await supabaseAdmin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 if(p?.role!=="admin"||p.is_active!==true)return reply({ok:false,message:"يلزم حساب مدير"},403);
 const key=process.env.EASYORDERS_API_KEY?.trim();
 if(!key)return reply({ok:false,message:"مفتاح EasyOrders غير متاح"},503);
 try{
  const products:Obj[]=[];
  for(let page=1;page<=15;page++){
   const u=new URL(API);u.searchParams.set("page",String(page));u.searchParams.set("limit","100");
   const r=await fetch(u.toString(),{headers:{"Api-Key":key,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error("EasyOrders response "+r.status);
   const list=arr(await r.json());products.push(...list);
   if(list.length<100)break;
   if(page===15)throw Error("Incomplete pagination");
  }
  const found=products.map(x=>{
   const slug=str(x.slug);const link=slug?"https://adora.ly/products/"+encodeURIComponent(slug):"";
   const title=str(x.name)||str(x.title);
   const amount=x.price??x.sale_price??x.price_before_discount??"";
   return {id:str(x.id),title,href:link,src:photo(x),price:amount!==""?String(amount)+" د.ل":""};
  }).filter(x=>x.title&&x.href);
  return reply({ok:true,products:found,count:found.length});
 }catch(e){console.error("Adora V3 catalog",e instanceof Error?e.message:"error");return reply({ok:false,message:"تعذر قراءة منتجات EasyOrders. يمكنك استخدام رابط المنتج وصورته يدويًا داخل المحرر."},502)}
}
