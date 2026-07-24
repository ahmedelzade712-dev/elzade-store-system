import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin, MAYAR_SERVICE_ID } from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const AREA_ALIASES: Record<string, string> = {
  "الوحشي": "الوحيشي",
  "بوعطني": "بو عطني",
  "شارع البث": "شاارع البت",
};

function cleanArabic(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ.,،]/g, "")
    .trim();
}

function findBest(zones: any[], name: string) {
  const raw = String(name || "").trim();
  const alias = AREA_ALIASES[raw] || raw;

  const exact = zones.filter((z) => String(z.name || "").trim() === alias);
  if (exact.length > 0) return exact.sort((a, b) => Number(a.id) - Number(b.id))[0];

  const normalized = cleanArabic(alias);
  const matches = zones.filter((z) => cleanArabic(z.name) === normalized);
  if (matches.length > 0) return matches.sort((a, b) => Number(a.id) - Number(b.id))[0];

  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cityName = searchParams.get("city") || "بنغازي";
    const dryRun = searchParams.get("dry") === "1";

    const login = await mayarLogin();

    const mayarCities = await mayarListZones(login.token, {
      active: true,
      service: { serviceId: MAYAR_SERVICE_ID },
    });

    const mayarCity = findBest(mayarCities, cityName);

    if (!mayarCity) {
      return NextResponse.json({
        ok: false,
        error: `لم أجد المدينة في قائمة المعيار الخاصة بالخدمة ${MAYAR_SERVICE_ID}`,
        city: cityName,
        service_id: MAYAR_SERVICE_ID,
        first_cities: mayarCities.slice(0, 30),
      }, { status: 500 });
    }

    const { data: city, error: cityError } = await supabaseAdmin
      .from("cities")
      .select("id, name, mayar_zone_id")
      .eq("name", cityName)
      .single();

    if (cityError) throw new Error(cityError.message);

    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from("cities")
        .update({ mayar_zone_id: mayarCity.id })
        .eq("id", city.id);

      if (error) throw new Error(error.message);
    }

    const { data: areas, error: areasError } = await supabaseAdmin
      .from("areas")
      .select("id, name, mayar_subzone_id")
      .eq("city_id", city.id)
      .eq("is_active", true)
      .order("name");

    if (areasError) throw new Error(areasError.message);

    const mayarAreas = await mayarListZones(login.token, {
      active: true,
      parentId: mayarCity.id,
      service: { serviceId: MAYAR_SERVICE_ID },
    });

    const linked: any[] = [];
    const unmatched: any[] = [];

    for (const area of areas || []) {
      const mayarArea = findBest(mayarAreas, area.name);

      if (!mayarArea) {
        unmatched.push({ area_id: area.id, area_name: area.name });
        continue;
      }

      linked.push({
        area_id: area.id,
        area_name: area.name,
        old_mayar_subzone_id: area.mayar_subzone_id,
        new_mayar_subzone_id: mayarArea.id,
        mayar_name: mayarArea.name,
      });

      if (!dryRun) {
        const { error } = await supabaseAdmin
          .from("areas")
          .update({ mayar_subzone_id: mayarArea.id })
          .eq("id", area.id);

        if (error) throw new Error(error.message);
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      service_id: MAYAR_SERVICE_ID,
      city: {
        system_name: city.name,
        old_mayar_zone_id: city.mayar_zone_id,
        new_mayar_zone_id: mayarCity.id,
        mayar_name: mayarCity.name,
      },
      total_areas: areas?.length || 0,
      linked_count: linked.length,
      unmatched_count: unmatched.length,
      linked,
      unmatched,
      note: dryRun
        ? "تجربة فقط بدون حفظ. احذف dry=1 للحفظ."
        : "تم تحديث ربط المدينة والمناطق حسب قائمة الخدمة.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown service relink error" },
      { status: 500 }
    );
  }
}
