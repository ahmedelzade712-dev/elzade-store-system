import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

function normalizeName(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function findByExactName(list: any[], name: string) {
  const normalizedName = normalizeName(name);
  return list.find((item) => normalizeName(item.name) === normalizedName);
}

export async function GET() {
  try {
    const login = await mayarLogin();
    const mayarAllZones = await mayarListZones(login.token, { active: true });

    const { data: cities, error: citiesError } = await supabaseAdmin
      .from("cities")
      .select("id, name, is_active, mayar_zone_id")
      .eq("is_active", true)
      .order("name");

    if (citiesError) throw new Error(citiesError.message);

    const { data: areas, error: areasError } = await supabaseAdmin
      .from("areas")
      .select("id, name, city_id, is_active, mayar_subzone_id")
      .eq("is_active", true)
      .order("name");

    if (areasError) throw new Error(areasError.message);

    const cityResults: any[] = [];
    const areaResults: any[] = [];

    for (const city of cities || []) {
      if (city.name === "طرابلس (خاصة)") {
        cityResults.push({
          name: city.name,
          skipped: true,
          reason: "مدينة خاصة لا ترسل إلى المعيار",
        });
        continue;
      }

      const mayarCity = findByExactName(mayarAllZones, city.name);

      if (!mayarCity) {
        cityResults.push({
          name: city.name,
          matched: false,
          mayar_zone_id: null,
        });
        continue;
      }

      if (city.mayar_zone_id !== mayarCity.id) {
        const { error: updateCityError } = await supabaseAdmin
          .from("cities")
          .update({ mayar_zone_id: mayarCity.id })
          .eq("id", city.id);

        if (updateCityError) throw new Error(updateCityError.message);
      }

      cityResults.push({
        name: city.name,
        matched: true,
        mayar_zone_id: mayarCity.id,
      });

      const cityAreas = (areas || []).filter((area: any) => area.city_id === city.id);

      if (cityAreas.length === 0) continue;

      const mayarSubzones = await mayarListZones(login.token, {
        active: true,
        parentId: mayarCity.id,
      });

      for (const area of cityAreas) {
        const mayarArea = findByExactName(mayarSubzones, area.name);

        if (!mayarArea) {
          areaResults.push({
            city: city.name,
            name: area.name,
            matched: false,
            mayar_subzone_id: null,
          });
          continue;
        }

        if (area.mayar_subzone_id !== mayarArea.id) {
          const { error: updateAreaError } = await supabaseAdmin
            .from("areas")
            .update({ mayar_subzone_id: mayarArea.id })
            .eq("id", area.id);

          if (updateAreaError) throw new Error(updateAreaError.message);
        }

        areaResults.push({
          city: city.name,
          name: area.name,
          matched: true,
          mayar_subzone_id: mayarArea.id,
        });
      }
    }

    const matchedCities = cityResults.filter((item) => item.matched).length;
    const missingCities = cityResults.filter(
      (item) => !item.matched && !item.skipped
    );
    const matchedAreas = areaResults.filter((item) => item.matched).length;
    const missingAreas = areaResults.filter((item) => !item.matched);

    return NextResponse.json({
      ok: true,
      mayar_total_zones: mayarAllZones.length,
      cities: {
        total: cityResults.length,
        matched: matchedCities,
        missing_count: missingCities.length,
        missing: missingCities,
      },
      areas: {
        total: areaResults.length,
        matched: matchedAreas,
        missing_count: missingAreas.length,
        missing: missingAreas.slice(0, 300),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Unknown Mayar sync error",
      },
      { status: 500 }
    );
  }
}
