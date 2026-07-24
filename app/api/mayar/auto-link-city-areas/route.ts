import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const AREA_ALIASES: Record<string, string> = {
  "الوحشي": "الوحيشي",
  "بوعطني": "بو عطني",
  "شارع البث": "شاارع البث",
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

function chooseBestMatch(mayarZones: any[], areaName: string) {
  const rawName = String(areaName || "").trim();
  const aliasName = AREA_ALIASES[rawName];

  if (aliasName) {
    const aliasExact = mayarZones.filter(
      (zone) => String(zone.name || "").trim() === aliasName
    );

    if (aliasExact.length >= 1) {
      const sorted = aliasExact.sort((a, b) => Number(a.id) - Number(b.id));
      return {
        match: sorted[0],
        method: "manual_alias",
        options: sorted,
      };
    }
  }

  const exact = mayarZones.filter(
    (zone) => String(zone.name || "").trim() === rawName
  );

  if (exact.length === 1) {
    return { match: exact[0], method: "exact", options: exact };
  }

  if (exact.length > 1) {
    const sorted = exact.sort((a, b) => Number(a.id) - Number(b.id));
    return { match: sorted[0], method: "duplicate_exact_lowest_id", options: sorted };
  }

  const cleanName = cleanArabic(rawName);
  const normalized = mayarZones.filter(
    (zone) => cleanArabic(zone.name) === cleanName
  );

  if (normalized.length === 1) {
    return { match: normalized[0], method: "normalized", options: normalized };
  }

  if (normalized.length > 1) {
    const sorted = normalized.sort((a, b) => Number(a.id) - Number(b.id));
    return { match: sorted[0], method: "duplicate_normalized_lowest_id", options: sorted };
  }

  return { match: null, method: "not_found", options: [] };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cityName = searchParams.get("city") || "بنغازي";
    const dryRun = searchParams.get("dry") === "1";

    const { data: city, error: cityError } = await supabaseAdmin
      .from("cities")
      .select("id, name, mayar_zone_id")
      .eq("name", cityName)
      .single();

    if (cityError) throw new Error(cityError.message);

    const { data: areas, error: areasError } = await supabaseAdmin
      .from("areas")
      .select("id, name, mayar_subzone_id")
      .eq("city_id", city.id)
      .eq("is_active", true)
      .order("name");

    if (areasError) throw new Error(areasError.message);

    const login = await mayarLogin();
    const mayarZones = await mayarListZones(login.token, { active: true });

    const linked: any[] = [];
    const unmatched: any[] = [];

    for (const area of areas || []) {
      const result = chooseBestMatch(mayarZones, area.name);

      if (!result.match) {
        unmatched.push({
          area_id: area.id,
          area_name: area.name,
          reason: result.method,
        });
        continue;
      }

      linked.push({
        area_id: area.id,
        area_name: area.name,
        old_mayar_subzone_id: area.mayar_subzone_id,
        new_mayar_subzone_id: result.match.id,
        mayar_name: result.match.name,
        method: result.method,
      });

      if (!dryRun && area.mayar_subzone_id !== result.match.id) {
        const { error: updateError } = await supabaseAdmin
          .from("areas")
          .update({ mayar_subzone_id: result.match.id })
          .eq("id", area.id);

        if (updateError) throw new Error(updateError.message);
      }
    }

    return NextResponse.json({
      ok: true,
      city,
      dry_run: dryRun,
      total_areas: areas?.length || 0,
      linked_count: linked.length,
      unmatched_count: unmatched.length,
      linked,
      unmatched,
      note: dryRun
        ? "dry=1 تجربة فقط بدون حفظ. احذف dry=1 للحفظ."
        : "تم الحفظ، وتم استخدام أسماء شركة المعيار للمناطق الثلاث.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown auto link error" },
      { status: 500 }
    );
  }
}
