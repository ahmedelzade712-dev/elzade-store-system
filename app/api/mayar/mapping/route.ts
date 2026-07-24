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

export async function GET() {
  try {
    const login = await mayarLogin();
    const mayarZones = await mayarListZones(login.token, { active: true });

    const { data: cities, error: citiesError } = await supabaseAdmin
      .from("cities")
      .select("id, name, is_active, mayar_zone_id")
      .eq("is_active", true)
      .order("name");

    if (citiesError) throw new Error(citiesError.message);

    const systemCities = (cities || []).map((city: any) => {
      const exact = findExact(mayarZones, city.name);
      const linkedMayar =
        mayarZones.find((zone: any) => zone.id === city.mayar_zone_id) || null;

      return {
        ...city,
        exact_mayar_zone_id: exact?.id || null,
        exact_mayar_name: exact?.name || null,
        linked_mayar_name: linkedMayar?.name || null,
        is_private_tripoli: city.name === "طرابلس (خاصة)",
      };
    });

    return NextResponse.json({
      ok: true,
      mayar_zones: mayarZones,
      cities: systemCities,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown mapping error" },
      { status: 500 }
    );
  }
}