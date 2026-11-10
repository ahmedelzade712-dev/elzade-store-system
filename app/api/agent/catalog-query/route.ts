import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const allowed = new Set(["code","design","brand","color"]);
const norm = (v:string) => v.trim().toLocaleLowerCase();

async function authorize(request: Request) {
  const serviceKey = process.env.AGENT_INTERNAL_API_KEY;
  const supplied = request.headers.get("x-agent-internal-key") || "";
  if (serviceKey && serviceKey.length >= 32 && supplied === serviceKey) {
    return { role:"internal", store_id:null as string|null };
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin.from("profiles")
    .select("role,store_id,is_active").eq("id",user.id).single();
  if (!profile?.is_active) return null;
  return {role:profile.role as string,store_id:profile.store_id as string|null};
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth) return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});

    const params = new URL(request.url).searchParams;
    const storeId = params.get("store_id")?.trim() || "";
    const by = params.get("by")?.trim() || "";
    const value = params.get("value")?.trim() || "";
    if (!storeId || !allowed.has(by) || !value || value.length > 100) {
      return NextResponse.json({ok:false,error:"REQUIRE_STORE_AND_SEARCH"},{status:400});
    }
    if (auth.role !== "admin" && auth.role !== "internal" && auth.store_id !== storeId) {
      return NextResponse.json({ok:false,error:"FORBIDDEN"},{status:403});
    }
    // First filter by catalog identity; no pictures, secret costs or unrelated stores are exposed.
    let catalogQuery = supabaseAdmin.from("agent_product_codes")
      .select("product_id,code,design_code,brand_name,color_name,is_active")
      .eq("is_active",true).limit(1001);
    if (by === "code") catalogQuery = catalogQuery.eq("code",value.toUpperCase());
    if (by === "design") catalogQuery = catalogQuery.eq("design_code",value.toUpperCase());
    if (by === "brand") catalogQuery = catalogQuery.ilike("brand_name",value);
    if (by === "color") catalogQuery = catalogQuery.ilike("color_name",value);
    const {data:codes,error:codesError} = await catalogQuery;
    if (codesError) throw codesError;
    if (!codes?.length) return NextResponse.json({ok:true,store_id:storeId,products:[]});
    if (codes.length > 1000) {
      return NextResponse.json({ok:false,error:"TOO_MANY_CATALOG_MATCHES"},{status:413});
    }
    const ids=codes.map(c=>c.product_id);

    const [{data:products,error:productError},{data:variants,error:variantError}] = await Promise.all([
      supabaseAdmin.from("products")
        .select("id,store_id,name,product_type,fabric,main_image_url,is_active")
        .eq("store_id",storeId).eq("is_active",true).in("id",ids).limit(1000),
      supabaseAdmin.from("product_variants")
        .select("product_id,color,size,sale_price,stock_quantity,is_active,image_url")
        .eq("store_id",storeId).in("product_id",ids).limit(10001),
    ]);
    if (productError) throw productError;
    if (variantError) throw variantError;
    if ((variants || []).length > 10000) return NextResponse.json({ok:false,error:"TOO_MANY_VARIANTS"},{status:413});
    const productById = new Map((products||[]).map(p=>[p.id,p]));
    const variantsById = new Map<string,typeof variants>();
    for(const row of variants||[]) {
      if(!variantsById.has(row.product_id)) variantsById.set(row.product_id,[]);
      variantsById.get(row.product_id)!.push(row);
    }
    const result = codes.flatMap(c=>{
      const p=productById.get(c.product_id);
      if(!p) return [];
      const sizes=(variantsById.get(c.product_id)||[]).filter(v=>v.is_active!==false);
      return [{
        product_id:p.id,store_id:p.store_id,code:c.code,design_code:c.design_code,
        brand_name:c.brand_name,color_name:c.color_name,name:p.name,
        product_type:p.product_type,fabric:p.fabric,
        image_url:sizes.find(v=>v.image_url)?.image_url||p.main_image_url,
        available:sizes.some(v=>Number(v.stock_quantity)>0),
        variants:sizes.map(v=>({
          size:v.size,color:v.color,price:Number(v.sale_price),
          stock_quantity:Math.max(0,Number(v.stock_quantity)||0),
          available:Number(v.stock_quantity)>0,
        })),
      }];
    });
    return NextResponse.json({ok:true,store_id:storeId,by,value,products:result});
  } catch(error) {
    console.error("Catalog lookup:",error);
    return NextResponse.json({ok:false,error:"CATALOG_LOOKUP_FAILED"},{status:500});
  }
}
