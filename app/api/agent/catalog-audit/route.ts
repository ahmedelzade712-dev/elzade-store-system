import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Read-only audit: counts only; no customer or financial data.
export async function GET(request: Request) {
  const header=request.headers.get("authorization") || "";
  const token=header.startsWith("Bearer ") ? header.slice(7) : "";
  if(!token) return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  const {data:{user},error:authError}=await supabaseAdmin.auth.getUser(token);
  if(authError || !user) return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  const {data:profile}=await supabaseAdmin.from("profiles")
    .select("role,is_active").eq("id",user.id).single();
  if(!profile?.is_active || profile.role!=="admin") {
    return NextResponse.json({ok:false,error:"FORBIDDEN"},{status:403});
  }
  const {data,error}=await supabaseAdmin.rpc("erp_catalog_integrity_report");
  if(error){
    console.error("Catalog audit failed:",error.code,error.message);
    return NextResponse.json({ok:false,error:error.code==="PGRST202"?"CATALOG_MIGRATION_REQUIRED":"AUDIT_FAILED"},{status:503});
  }
  return NextResponse.json({ok:true,audit:data});
}
