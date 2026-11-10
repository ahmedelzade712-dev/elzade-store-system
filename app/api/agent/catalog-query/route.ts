import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSearchText, selectCatalogNames } from "@/lib/catalogSearch";

const allowed = new Set(["code","design","brand","color"]);

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
    // Resolve store first, before fuzzy name matching: no data can leak across stores.
    const {data:storeProducts,error:storeProductsError} = await supabaseAdmin
      .from("products").select("id")
      .eq("store_id",storeId).eq("is_active",true).limit(1001);
    if(storeProductsError) throw storeProductsError;
    if((storeProducts||[]).length > 1000) return NextResponse.json({
      ok:false,error:"TOO_MANY_STORE_PRODUCTS"
    },{status:413});
    const storeIds=(storeProducts||[]).map(p=>p.id);
    if(!storeIds.length) return NextResponse.json({
      ok:true,store_id:storeId,by,value,match_status:"not_found",products:[]
    });
    const {data:codes,error:codesError} = await supabaseAdmin
      .from("agent_product_codes")
      .select("product_id,code,design_code,brand_name,color_name,is_active")
      .eq("is_active",true).in("product_id",storeIds).limit(1001);
    if(codesError) throw codesError;
    if((codes||[]).length>1000) return NextResponse.json({
      ok:false,error:"TOO_MANY_CATALOG_MATCHES"
    },{status:413});
    let matchStatus:"matched"|"ambiguous"|"not_found"="not_found";
    let confidence:"exact"|"alias"|"fuzzy"|null=null;
    let suggestions:string[]=[];
    let filtered = codes||[];
    if(by==="code") {
      filtered = filtered.filter(c=>c.code.toUpperCase()===value.toUpperCase());
      if(filtered.length) {matchStatus="matched";confidence="exact";}
    } else if(by==="design") {
      filtered = filtered.filter(c=>c.design_code.toUpperCase()===value.toUpperCase());
      if(filtered.length) {matchStatus="matched";confidence="exact";}
    } else {
      const field = by === "brand" ? "brand_name" : "color_name";
      const selection = selectCatalogNames(by as "brand"|"color",value,
        filtered.map(c=>c[field]));
      matchStatus=selection.status;
      confidence=selection.confidence;
      suggestions=selection.suggestions;
      const names=new Set(selection.matches.map(normalizeSearchText));
      filtered=selection.status==="matched"
        ?filtered.filter(c=>names.has(normalizeSearchText(c[field])))
        :[];
    }
    if(!filtered.length) return NextResponse.json({
      ok:true,store_id:storeId,by,value,match_status:matchStatus,
      confidence,suggestions,products:[]
    });
    const ids=filtered.map(c=>c.product_id);

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
    const result = filtered.flatMap(c=>{
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
    return NextResponse.json({ok:true,store_id:storeId,by,value,match_status:matchStatus,confidence,suggestions,products:result});
  } catch(error) {
    console.error("Catalog lookup:",error);
    return NextResponse.json({ok:false,error:"CATALOG_LOOKUP_FAILED"},{status:500});
  }
}
