import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCatalogSearch, normalizeCatalogText } from "@/lib/catalogSearch";

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
    // Always scope to the requested store before matching a brand or color.
    // Fetch all catalog identities for that store; fuzzy matching must not truncate or cross stores.
    const {data:storeProducts,error:storeError}=await supabaseAdmin.from("products")
      .select("id,store_id,name,product_type,fabric,main_image_url,is_active")
      .eq("store_id",storeId).eq("is_active",true).limit(1001);
    if(storeError) throw storeError;
    if((storeProducts||[]).length>1000)
      return NextResponse.json({ok:false,error:"CATALOG_TOO_LARGE"},{status:413});
    if(!storeProducts?.length)
      return NextResponse.json({ok:true,store_id:storeId,by,value,match_status:"not_found",products:[]});
    const ids=storeProducts.map(p=>p.id);
    const {data:allCodes,error:codesError}=await supabaseAdmin.from("agent_product_codes")
      .select("product_id,code,design_code,brand_name,color_name,is_active")
      .eq("is_active",true).in("product_id",ids).limit(1001);
    if(codesError) throw codesError;
    if((allCodes||[]).length>1000)
      return NextResponse.json({ok:false,error:"CATALOG_TOO_LARGE"},{status:413});

    let matchStatus: "matched"|"ambiguous"|"not_found"="matched";
    let quality: "exact"|"alias"|"fuzzy"|undefined="exact";
    let suggestions: string[]=[];
    let codes=allCodes||[];
    if(by==="code" || by==="design"){
      const candidate=normalizeCatalogText(value).replace(/\s/g,"").toUpperCase();
      // Never typo-correct short product codes: a wrong code means a different product.
      if(by==="code" && !/^[A-Z][0-9]{2,}$/.test(candidate))
        return NextResponse.json({ok:true,store_id:storeId,by,value,match_status:"not_found",products:[]});
      if(by==="design" && !/^[A-Z]$/.test(candidate))
        return NextResponse.json({ok:true,store_id:storeId,by,value,match_status:"not_found",products:[]});
      codes=codes.filter(c=>by==="code"?c.code===candidate:c.design_code===candidate);
      matchStatus=codes.length?"matched":"not_found";
    }else{
      const field=by==="brand"?"brand":"color";
      const resolution=resolveCatalogSearch(field,value,codes.map(c=>field==="brand"?c.brand_name:c.color_name));
      matchStatus=resolution.status;
      quality=resolution.quality;
      suggestions=resolution.suggestions;
      if(matchStatus!=="matched")
        return NextResponse.json({ok:true,store_id:storeId,by,value,
          match_status:matchStatus,suggestions,products:[]});
      const matching=new Set(resolution.values);
      codes=codes.filter(c=>matching.has(field==="brand"?c.brand_name:c.color_name));
    }
    if(!codes.length)
      return NextResponse.json({ok:true,store_id:storeId,by,value,match_status:"not_found",products:[]});
    const productById=new Map(storeProducts.map(p=>[p.id,p]));
    const matchedIds=codes.map(c=>c.product_id);
    const {data:variants,error:variantError}=await supabaseAdmin.from("product_variants")
      .select("product_id,color,size,sale_price,stock_quantity,is_active,image_url")
      .eq("store_id",storeId).in("product_id",matchedIds).limit(10001);
    if(variantError) throw variantError;
    if((variants||[]).length>10000)
      return NextResponse.json({ok:false,error:"TOO_MANY_VARIANTS"},{status:413});
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
    return NextResponse.json({ok:true,store_id:storeId,by,value,
      match_status:matchStatus,match_quality:quality,suggestions,products:result});
  } catch(error) {
    console.error("Catalog lookup:",error);
    return NextResponse.json({ok:false,error:"CATALOG_LOOKUP_FAILED"},{status:500});
  }
}
