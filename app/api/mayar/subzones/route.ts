import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeName(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findExact(list: any[], name: string) {
  const normalized = normalizeName(name);
  return list.find((item) => normalizeName(item.name) === normalized);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get("city_id");

    if (!cityId) throw new Error("city_id مطلوب");

    const { data: city, error: cityError } = await supabaseAdmin
      .from("cities")
      .select("id, name, mayar_zone_id")
      .eq("id", cityId)
      .single();

    if (cityError) throw new Error(cityError.message);

    const { data: areas, error: areasError } = await supabaseAdmin
      .from("areas")
      .select("id, name, city_id, is_active, mayar_subzone_id")
      .eq("city_id", cityId)
      .eq("is_active", true)
      .order("name");

    if (areasError) throw new Error(areasError.message);

    if (!city.mayar_zone_id) {
      return NextResponse.json({
        ok: true,
        city,
        mayar_subzones: [],
        areas: areas || [],
        warning: "هذه المدينة غير مربوطة برقم مدينة المعيار بعد",
      });
    }

    const login = await mayarLogin();

    let mayarSubzones = await mayarListZones(login.token, {
      active: true,
      parentId: city.mayar_zone_id,
    });

    let fallbackUsed = false;

    if (!mayarSubzones || mayarSubzones.length === 0) {
      mayarSubzones = await mayarListZones(login.token, { active: true });
      fallbackUsed = true;
    }

    const mappedAreas = (areas || []).map((area: any) => {
      const exact = findExact(mayarSubzones, area.name);
      const linkedMayar =
        mayarSubzones.find((zone: any) => zone.id === area.mayar_subzone_id) ||
        null;

      return {
        ...area,
        exact_mayar_subzone_id: exact?.id || null,
        exact_mayar_name: exact?.name || null,
        linked_mayar_name: linkedMayar?.name || null,
      };
    });

    return NextResponse.json({
      ok: true,
      city,
      fallback_used: fallbackUsed,
      warning: fallbackUsed
        ? "المعيار لم يرجع مناطق تابعة لهذه المدينة، لذلك تم عرض كل مناطق المعيار للربط اليدوي."
        : null,
      mayar_subzones: mayarSubzones,
      areas: mappedAreas,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown subzones error" },
      { status: 500 }
    );
  }
}
