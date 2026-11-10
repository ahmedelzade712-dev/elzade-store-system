import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const header = request.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return NextResponse.json({ ok:false,error:"UNAUTHORIZED" },{status:401});
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
    const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
      .select("role,is_active").eq("id",user.id).single();
    if (profileError || !profile?.is_active || profile.role !== "admin") {
      return NextResponse.json({ok:false,error:"FORBIDDEN"},{status:403});
    }
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ok:false,error:"INVALID_BODY"},{status:400});
    }
    const action = body.action;
    if (action !== "create" && action !== "update") {
      return NextResponse.json({ok:false,error:"INVALID_ACTION"},{status:400});
    }
    const payload = body.product;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ok:false,error:"INVALID_PRODUCT"},{status:400});
    }
    const rpcName = action === "create"
      ? "erp_create_product_with_code"
      : "erp_update_product_with_code";
    const { data, error } = await supabaseAdmin.rpc(rpcName, { p: payload });
    if (error) {
      console.error("Catalog atomic save:",{code:error.code,message:error.message});
      const knownErrors = [
        "INVALID_CATALOG_IDENTITY","INVALID_PRODUCT_DATA","INVALID_STORE",
        "DESIGN_BRAND_CONFLICT","DESIGN_COLOR_EXISTS","INVALID_SIZE",
        "DUPLICATE_SIZE","PRODUCT_NOT_FOUND","PRODUCT_HAS_MULTIPLE_COLORS",
        "DESIGN_CODES_EXHAUSTED"
      ];
      const known = knownErrors.find(k=>error.message.includes(k));
      const schemaMissing = error.code === "PGRST202" || error.message.includes("Could not find the function");
      return NextResponse.json({
        ok:false,
        error: schemaMissing ? "CATALOG_MIGRATION_REQUIRED" : known || (error.code === "23505" ? "DUPLICATE_RECORD" : "SAVE_FAILED"),
      },{status:schemaMissing?503:known||error.code==="23505"?409:500});
    }
    return NextResponse.json({ok:true,...data});
  } catch (error) {
    console.error("Catalog atomic save unexpected:",error);
    return NextResponse.json({ok:false,error:"SAVE_FAILED"},{status:500});
  }
}
