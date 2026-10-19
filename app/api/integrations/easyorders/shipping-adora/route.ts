import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public published Mayar tariffs for shipments from Tripoli and Tajoura, 2026-10-19.
 *  Source: https://almayardelivery.com/prices
 *  Not an exhaustive price list: never bulk-update EasyOrders from this subset.
 */
const SOURCE = "https://almayardelivery.com/prices";
const OFFICIAL_RATES: readonly [string, number][] = [
  ["طرابلس",15],["كريمة",15],["طريق المطار",15],
  ["عين زارة",15],["تاجوراء",15],["خلة",15],["مشروع الهضبة",15],
  ["بنغازي",25],["اجدابيا",25],
  ["توكرة",35],["المرج",35],["الابيار",35],
  ["البيضاء",35],["قمينس",35],["سلوق",35],["شحات",35],
  ["سوسة",35],["القبة",35],["طبرق",35],
  ["درنة",40],["امساعد",50],
];
const SPECIAL = new Map<string, string>([
  ["طرابلس (خاصة)","خدمة طرابلس خاصة، ليست تعرفة المعيار"],
  ["طرابلس صباحا","خدمة تشغيلية منفصلة"],
  ["المعيار سبيد","اسم خدمة وليس مدينة"],
  ["بنغازي نسائي","خدمة تشغيلية منفصلة عن بنغازي العامة"],
]);
const normalize = (s:string) => s.normalize("NFC").trim()
 .replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
 .replace(/ـ/g,"").replace(/\s+/g," ");
const officialByName = new Map(OFFICIAL_RATES.map(([name,price])=>[normalize(name),{name,price}]));
const respond = (data:Record<string,unknown>, status=200) => NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function admin(req:Request) {
 const h=req.headers.get("authorization")||"";
 const token=h.startsWith("Bearer ")?h.slice(7).trim():"";
 if(!token)return false;
 const {data:{user},error}=await supabaseAdmin.auth.getUser(token);
 if(error||!user)return false;
 const {data:p,error:e}=await supabaseAdmin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle();
 return !e && p?.role==="admin" && p.is_active===true;
}
/** GET only: staging audit. It cannot change ERP records or EasyOrders rates. */
export async function GET(req:Request) {
 if(process.env.VERCEL_ENV!=="preview")return respond({ok:false,message:"Preview فقط"},404);
 if(!(await admin(req)))return respond({ok:false,message:"يتطلب حساب مدير ERP"},403);
 const {data,error}=await supabaseAdmin.from("cities").select("id,name").order("name");
 if(error)return respond({ok:false,message:"تعذر قراءة المدن من ERP"},503);
 const cities=(data||[]).map(city=>{
   const name=String(city.name||"").trim();
   const special=SPECIAL.get(name);
   const found=special?undefined:officialByName.get(normalize(name));
   return {
     id:city.id,name,official_name:found?.name??null,published_shipping_lyd:found?.price??null,
     status:special?"special_service":found?"official_price_confirmed":"unverified_price",
     note:special||(!found?"سعر غير متحقق من الجدول المنشور":"من فرع طرابلس وتاجوراء"),
   };
 });
 const matched=new Set(cities.flatMap(c=>c.official_name?[c.official_name]:[]));
 const missingFromErp=OFFICIAL_RATES.filter(([n])=>!matched.has(n)).map(([name,price])=>({name,price}));
 return respond({
   ok:true,mode:"read_only",source:SOURCE,origin:"طرابلس وتاجوراء",ready_to_sync:false,
   warning:"لا ترسل تحديث PATCH بقائمة أسعار جزئية: قد تستبدل مناطق الشحن الحالية. يتطلب استكمال جميع الأسعار وفصل طرابلس خاصة.",
   summary:{erp_city_count:cities.length,confirmed:cities.filter(c=>c.status==="official_price_confirmed").length,
     unverified:cities.filter(c=>c.status==="unverified_price").length,
     special:cities.filter(c=>c.status==="special_service").length,
     official_destinations:OFFICIAL_RATES.length,official_missing_from_erp:missingFromErp.length},
   cities,official_missing_from_erp:missingFromErp
 });
}
