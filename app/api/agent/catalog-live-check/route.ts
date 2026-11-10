import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GET as catalogQuery } from "@/app/api/agent/catalog-query/route";

type CodeRow = {product_id:string;code:string;design_code:string;brand_name:string;color_name:string;is_active:boolean};
type VariantRow = {product_id:string;size:string;color:string;sale_price:number;stock_quantity:number;is_active:boolean;image_url:string|null};
type ProductRow = {id:string;store_id:string;name:string;main_image_url:string|null};
type CatalogProduct = {
  product_id:string;code:string;design_code:string;brand_name:string;color_name:string;
  image_url:string|null;variants:Array<{size:string;color:string;price:number;stock_quantity:number;available:boolean}>;
  available:boolean;
};
type CatalogResult = {ok:boolean;match_status:string;products:CatalogProduct[];suggestions?:string[]};

function normalize(v:unknown){return String(v??"").normalize("NFKC").trim();}
function equal(a:unknown,b:unknown){return normalize(a)===normalize(b);}
function roundMoney(v:unknown){return Number(v);}
function recordFailure(errors:string[],name:string,reason:string){errors.push(name+": "+reason);}

export async function GET(request:Request){
  try {
    const header=request.headers.get("authorization")||"";
    const token=header.startsWith("Bearer ")?header.slice(7):"";
    if(!token)return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
    const {data:{user},error:authError}=await supabaseAdmin.auth.getUser(token);
    if(authError||!user)return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
    const {data:profile,error:profileError}=await supabaseAdmin.from("profiles")
      .select("role,is_active").eq("id",user.id).single();
    if(profileError||profile?.role!=="admin"||!profile.is_active)
      return NextResponse.json({ok:false,error:"FORBIDDEN"},{status:403});

    const storeName=new URL(request.url).searchParams.get("store")||"Adora";
    const {data:stores,error:storesError}=await supabaseAdmin.from("stores").select("id,name");
    if(storesError)throw storesError;
    const store=stores?.find(s=>s.name.trim().toLocaleLowerCase()===storeName.trim().toLocaleLowerCase());
    if(!store)return NextResponse.json({ok:false,error:"STORE_NOT_FOUND"},{status:404});
    const [{data:rawProducts,error:productError},{data:rawCodes,error:codeError},{data:rawVariants,error:variantError}]=await Promise.all([
      supabaseAdmin.from("products").select("id,store_id,name,main_image_url,is_active")
        .eq("store_id",store.id).eq("is_active",true).limit(1001),
      supabaseAdmin.from("agent_product_codes")
        .select("product_id,code,design_code,brand_name,color_name,is_active").limit(1001),
      supabaseAdmin.from("product_variants")
        .select("product_id,size,color,sale_price,stock_quantity,is_active,image_url")
        .eq("store_id",store.id).limit(10001),
    ]);
    if(productError||codeError||variantError)throw productError||codeError||variantError;
    if((rawProducts||[]).length>1000||(rawCodes||[]).length>1000||(rawVariants||[]).length>10000)
      return NextResponse.json({ok:false,error:"CATALOG_TOO_LARGE"},{status:413});
    const products=(rawProducts||[]) as ProductRow[];
    const byId=new Map(products.map(p=>[p.id,p]));
    const codes=(rawCodes||[]).filter(c=>byId.has(c.product_id) && c.is_active===true) as CodeRow[];
    const variants=(rawVariants||[]) as VariantRow[];
    const failures:string[]=[];
    let checks=0;
    async function lookup(by:"code"|"design"|"brand"|"color",value:string){
      const u=new URL("https://internal.local/api/agent/catalog-query");
      u.searchParams.set("store_id",store.id);
      u.searchParams.set("by",by);
      u.searchParams.set("value",value);
      const response=await catalogQuery(new Request(u,{headers:{Authorization:"Bearer "+token}}));
      const result=(await response.json()) as CatalogResult;
      checks++;
      if(!response.ok||!result.ok){
        recordFailure(failures,by+" "+value,"HTTP "+response.status);return null;
      }
      return result;
    }
    function checkIds(label:string,res:CatalogResult|null,expected:CodeRow[]){
      if(!res)return;
      const actual=res.products.map(p=>p.product_id).sort();
      const intended=expected.map(c=>c.product_id).sort();
      if(JSON.stringify(actual)!==JSON.stringify(intended))
        recordFailure(failures,label,"expected "+intended.length+" products, received "+actual.length+" / IDs mismatch");
    }
    // Check every real code one-by-one, including full size-by-size prices and stock.
    await Promise.all(codes.map(async code=>{
      const label="code "+code.code;
      const result=await lookup("code",code.code);
      checkIds(label,result,[code]);
      const actual=result?.products.find(p=>p.product_id===code.product_id);
      if(!actual)continue;
      const dbVariants=variants.filter(v=>v.product_id===code.product_id && v.is_active!==false);
      const normalizedDb=dbVariants.map(v=>({
        size:v.size,color:v.color,price:roundMoney(v.sale_price),
        stock_quantity:Math.max(0,Number(v.stock_quantity)||0),
        available:Number(v.stock_quantity)>0
      })).sort((a,b)=>a.size.localeCompare(b.size));
      const normalizedApi=[...actual.variants].sort((a,b)=>a.size.localeCompare(b.size));
      if(JSON.stringify(normalizedDb)!==JSON.stringify(normalizedApi))
        recordFailure(failures,label,"price, stock, color or sizes mismatch");
      const expectedAvailable=dbVariants.some(v=>Number(v.stock_quantity)>0);
      if(actual.available!==expectedAvailable)recordFailure(failures,label,"availability mismatch");
      const expectedImage=dbVariants.find(v=>v.image_url)?.image_url||byId.get(code.product_id)?.main_image_url;
      if(!equal(actual.image_url,expectedImage))recordFailure(failures,label,"image URL mismatch");
      if(!equal(actual.brand_name,code.brand_name)||!equal(actual.color_name,code.color_name)
         ||!equal(actual.design_code,code.design_code))
        recordFailure(failures,label,"identity mismatch");
    }));
    // Exact design and brand searches must return *all* matching codes.
    for(const design of [...new Set(codes.map(c=>c.design_code))]){
      const result=await lookup("design",design);
      checkIds("design "+design,result,codes.filter(c=>c.design_code===design&&c.is_active));
    }
    for(const brand of [...new Set(codes.map(c=>c.brand_name))]){
      const result=await lookup("brand",brand);
      checkIds("brand "+brand,result,codes.filter(c=>c.brand_name===brand&&c.is_active));
    }
    // The aliases are tested against exact catalog brand spellings, not assumptions.
    const translated=[
      ["Dior","ديور"],["Dior","ديورر"],
      ["Fendi","فيندي"],["Victoria secret","فيكتوريا سكريت"],
      ["Victoria secret","فكتوريا سيكريت"],["Louis Vuitton","لويس فيتون"]
    ];
    for(const [target,input] of translated){
      const expected=codes.filter(c=>c.brand_name.toLowerCase()===target.toLowerCase()&&c.is_active);
      if(!expected.length)continue;
      const result=await lookup("brand",input);
      checkIds("brand alias "+input,result,expected);
    }
    // Different accents are equivalent, but different shades remain separate.
    const blueCodes=codes.filter(c=>["ازرق","أزرق"].includes(c.color_name)&&c.is_active);
    if(blueCodes.length){
      const result=await lookup("color","أزرق");
      checkIds("color أزرق",result,blueCodes);
    }
    const pinkCodes=codes.filter(c=>c.color_name==="وردي"&&c.is_active);
    if(pinkCodes.length){
      const result=await lookup("color","pink");
      checkIds("color pink",result,pinkCodes);
    }
    const unknown=await lookup("brand","براندغيرموجودبالمتجر");
    if(unknown?.products.length)recordFailure(failures,"unknown brand","invented matches");
    const invalidCode=await lookup("code","D0O");
    if(invalidCode?.products.length)recordFailure(failures,"invalid code","fuzzy product code");

    return NextResponse.json({
      ok:true,passed:failures.length===0,store:store.name,
      product_count:products.length,linked_count:codes.length,
      checked_requests:checks,failed_checks:failures.length,
      failures,
      warning:codes.length!==products.length?"Some products lack catalog codes":null,
      read_only:true,
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch(error){
    console.error("Catalog live final check:",error);
    return NextResponse.json({ok:false,error:"LIVE_CHECK_FAILED"},{status:500});
  }
}
