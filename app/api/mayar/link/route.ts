import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.type === "city") {
      if (!body.id) throw new Error("id مطلوب");

      const value = body.action === "unlink" ? null : Number(body.mayar_zone_id);

      if (body.action !== "unlink") {
        if (!body.mayar_zone_id) throw new Error("mayar_zone_id مطلوب");
        if (!Number.isInteger(value) || value <= 0) throw new Error("رقم مدينة المعيار غير صحيح");
      }

      const { error } = await supabaseAdmin
        .from("cities")
        .update({ mayar_zone_id: value })
        .eq("id", body.id);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.type === "area") {
      if (!body.id) throw new Error("id مطلوب");

      const value = body.action === "unlink" ? null : Number(body.mayar_subzone_id);

      if (body.action !== "unlink") {
        if (!body.mayar_subzone_id) throw new Error("mayar_subzone_id مطلوب");
        if (!Number.isInteger(value) || value <= 0) throw new Error("رقم منطقة المعيار غير صحيح");
      }

      const { error } = await supabaseAdmin
        .from("areas")
        .update({ mayar_subzone_id: value })
        .eq("id", body.id);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new Error("نوع الربط غير صحيح");
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown link error" },
      { status: 500 }
    );
  }
}
