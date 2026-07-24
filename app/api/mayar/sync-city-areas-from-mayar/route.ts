import { NextResponse } from "next/server";
import {
  mayarGraphql,
  mayarListZones,
  mayarLogin,
  MAYAR_SERVICE_ID,
  type MayarServiceFilter,
  type MayarZone,
} from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PRIVATE_TRIPOLI_NAME = "طرابلس (خاصة)";

type ReferenceShipment = {
  code: string;
  service: {
    id: number;
    name: string;
  };
  customerType: {
    code: string;
    name: string;
  };
  senderZone: {
    id: number;
    code?: string | null;
    name: string;
  } | null;
  senderSubzone: {
    id: number;
    code?: string | null;
    name: string;
  } | null;
};

type SystemCity = {
  id: string;
  name: string;
  mayar_zone_id: number | null;
};

type SystemArea = {
  id: string;
  name: string;
  mayar_subzone_id: number | null;
  is_active: boolean;
};

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeArabic(value: unknown) {
  return cleanName(value)
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ.,،]/g, "")
    .trim();
}

function entryKey(entry: MayarZone) {
  return cleanName(entry.code) || String(Number(entry.id));
}

/**
 * قائمة المعيار المختلطة تأتي على شكل كتلتين متتاليتين:
 * - الكتلة الأولى: المدن.
 * - الكتلة الثانية: المناطق.
 *
 * لأن IDs المدن وIDs المناطق من جدولين مختلفين، يبدأ تكرار id/code
 * عند بداية كتلة المناطق. لذلك نأخذ العناصر حتى أول تكرار فقط.
 */
function extractCitiesFromMixedEntries(entries: MayarZone[]) {
  const seen = new Set<string>();
  const cities: MayarZone[] = [];
  let firstDuplicateIndex = -1;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const key = entryKey(entry);

    if (seen.has(key)) {
      firstDuplicateIndex = index;
      break;
    }

    seen.add(key);
    cities.push({
      id: Number(entry.id),
      code: entry.code ?? null,
      name: cleanName(entry.name),
    });
  }

  return {
    cities,
    firstDuplicateIndex,
    remainingEntries:
      firstDuplicateIndex >= 0
        ? entries.slice(firstDuplicateIndex)
        : [],
  };
}

async function getReferenceShipment(
  token: string,
  code: string
): Promise<ReferenceShipment> {
  const query = `
    query Shipment($code: String) {
      shipment(code: $code) {
        code
        service {
          id
          name
        }
        customerType {
          code
          name
        }
        senderZone {
          id
          code
          name
        }
        senderSubzone {
          id
          code
          name
        }
      }
    }
  `;

  const data = await mayarGraphql<{
    shipment: ReferenceShipment | null;
  }>(query, { code }, token);

  if (!data.shipment) {
    throw new Error(`لم يتم العثور على شحنة المعيار ${code}`);
  }

  return data.shipment;
}

async function loadSystemCities() {
  const { data, error } = await supabaseAdmin
    .from("cities")
    .select("id, name, mayar_zone_id")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as SystemCity[];
}

async function loadSystemAreas(cityId: string) {
  const { data, error } = await supabaseAdmin
    .from("areas")
    .select("id, name, mayar_subzone_id, is_active")
    .eq("city_id", cityId)
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as SystemArea[];
}

/**
 * اختيار السجل الصحيح للمدينة دون كسر القيد الفريد على cities.name.
 *
 * الأولوية:
 * 1) سجل يملك الاسم الرسمي نفسه.
 * 2) سجل يملك mayar_zone_id نفسه.
 * 3) اسم مطابق بعد التطبيع.
 */
function resolveCityRecords(
  systemCities: SystemCity[],
  mayarCity: MayarZone
) {
  const officialName = cleanName(mayarCity.name);
  const officialId = Number(mayarCity.id);

  const exactNameOwner =
    systemCities.find(
      (city) => cleanName(city.name) === officialName
    ) || null;

  const zoneIdOwner =
    systemCities.find(
      (city) =>
        Number(city.mayar_zone_id) === officialId
    ) || null;

  const normalizedNameOwner =
    systemCities.find(
      (city) =>
        normalizeArabic(city.name) ===
        normalizeArabic(officialName)
    ) || null;

  const canonical =
    exactNameOwner ||
    zoneIdOwner ||
    normalizedNameOwner ||
    null;

  const conflictingZoneOwner =
    exactNameOwner &&
    zoneIdOwner &&
    exactNameOwner.id !== zoneIdOwner.id
      ? zoneIdOwner
      : null;

  return {
    canonical,
    exactNameOwner,
    zoneIdOwner,
    conflictingZoneOwner,
  };
}

async function ensureCanonicalCity(
  systemCities: SystemCity[],
  mayarCity: MayarZone,
  dryRun: boolean
) {
  const officialName = cleanName(mayarCity.name);
  const officialZoneId = Number(mayarCity.id);

  const {
    canonical,
    conflictingZoneOwner,
  } = resolveCityRecords(systemCities, mayarCity);

  const actions: any[] = [];

  /**
   * إذا كان اسم المدينة الرسمي مملوكًا لسجل، بينما mayar_zone_id
   * موجود في سجل آخر اسمه منطقة، نفصل الربط عن السجل الخاطئ فقط.
   * لا نحذفه حتى لا نكسر طلبات قديمة.
   */
  if (conflictingZoneOwner) {
    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from("cities")
        .update({ mayar_zone_id: null })
        .eq("id", conflictingZoneOwner.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    conflictingZoneOwner.mayar_zone_id = null;

    actions.push({
      action: dryRun
        ? "will_detach_conflicting_zone_owner"
        : "detached_conflicting_zone_owner",
      city_id: conflictingZoneOwner.id,
      city_name: conflictingZoneOwner.name,
      old_mayar_zone_id: officialZoneId,
    });
  }

  if (canonical) {
    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from("cities")
        .update({
          name: officialName,
          mayar_zone_id: officialZoneId,
        })
        .eq("id", canonical.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    canonical.name = officialName;
    canonical.mayar_zone_id = officialZoneId;

    actions.push({
      action: dryRun
        ? "will_update_existing_city"
        : "updated_existing_city",
      city_id: canonical.id,
      final_name: officialName,
      mayar_zone_id: officialZoneId,
    });

    return {
      city: canonical,
      actions,
    };
  }

  if (dryRun) {
    const previewCity: SystemCity = {
      id: `dry-${officialZoneId}`,
      name: officialName,
      mayar_zone_id: officialZoneId,
    };

    systemCities.push(previewCity);

    actions.push({
      action: "will_insert_city",
      final_name: officialName,
      mayar_zone_id: officialZoneId,
    });

    return {
      city: previewCity,
      actions,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("cities")
    .insert({
      name: officialName,
      mayar_zone_id: officialZoneId,
    })
    .select("id, name, mayar_zone_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const inserted = data as SystemCity;
  systemCities.push(inserted);

  actions.push({
    action: "inserted_city",
    city_id: inserted.id,
    final_name: officialName,
    mayar_zone_id: officialZoneId,
  });

  return {
    city: inserted,
    actions,
  };
}

async function syncCityAreas(
  systemCity: SystemCity,
  mayarAreas: MayarZone[],
  dryRun: boolean
) {
  const existingAreas = systemCity.id.startsWith("dry-")
    ? []
    : await loadSystemAreas(systemCity.id);

  const uniqueAreas = Array.from(
    new Map(
      mayarAreas.map((area) => [
        Number(area.id),
        {
          id: Number(area.id),
          code: area.code ?? null,
          name: cleanName(area.name),
        },
      ])
    ).values()
  );

  const validSubzoneIds = new Set(
    uniqueAreas.map((area) => Number(area.id))
  );

  const actions: any[] = [];

  for (const mayarArea of uniqueAreas) {
    const bySubzoneId =
      existingAreas.find(
        (area) =>
          Number(area.mayar_subzone_id) ===
          Number(mayarArea.id)
      ) || null;

    const byExactName =
      existingAreas.find(
        (area) =>
          cleanName(area.name) ===
          cleanName(mayarArea.name)
      ) || null;

    const byNormalizedName =
      existingAreas.find(
        (area) =>
          normalizeArabic(area.name) ===
          normalizeArabic(mayarArea.name)
      ) || null;

    const existing =
      bySubzoneId ||
      byExactName ||
      byNormalizedName ||
      null;

    if (existing) {
      if (!dryRun) {
        const { error } = await supabaseAdmin
          .from("areas")
          .update({
            name: mayarArea.name,
            mayar_subzone_id: Number(mayarArea.id),
            is_active: true,
          })
          .eq("id", existing.id);

        if (error) {
          throw new Error(error.message);
        }
      }

      actions.push({
        action: dryRun
          ? "will_update_existing_area"
          : "updated_existing_area",
        area_id: existing.id,
        final_name: mayarArea.name,
        mayar_subzone_id: Number(mayarArea.id),
      });

      continue;
    }

    if (!dryRun) {
      const { error } = await supabaseAdmin
        .from("areas")
        .insert({
          city_id: systemCity.id,
          name: mayarArea.name,
          mayar_subzone_id: Number(mayarArea.id),
          is_active: true,
        });

      if (error) {
        throw new Error(error.message);
      }
    }

    actions.push({
      action: dryRun
        ? "will_insert_area"
        : "inserted_area",
      final_name: mayarArea.name,
      mayar_subzone_id: Number(mayarArea.id),
    });
  }

  /**
   * لا نحذف المناطق القديمة؛ نعطل فقط المناطق المرتبطة سابقًا بالمعيار
   * ولم تعد موجودة تحت هذه المدينة.
   */
  for (const existingArea of existingAreas) {
    if (
      existingArea.mayar_subzone_id !== null &&
      !validSubzoneIds.has(
        Number(existingArea.mayar_subzone_id)
      )
    ) {
      if (!dryRun) {
        const { error } = await supabaseAdmin
          .from("areas")
          .update({ is_active: false })
          .eq("id", existingArea.id);

        if (error) {
          throw new Error(error.message);
        }
      }

      actions.push({
        action: dryRun
          ? "will_deactivate_old_area"
          : "deactivated_old_area",
        area_id: existingArea.id,
        area_name: existingArea.name,
        old_mayar_subzone_id:
          existingArea.mayar_subzone_id,
      });
    }
  }

  return {
    areasCount: uniqueAreas.length,
    actions,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const referenceCode =
      searchParams.get("code") || "N6645150";

    /**
     * الوضع الافتراضي آمن: تجربة فقط.
     * الحفظ يتم صراحة باستخدام dry=0.
     */
    const dryRun = searchParams.get("dry") !== "0";

    const login = await mayarLogin();

    const referenceShipment = await getReferenceShipment(
      login.token,
      referenceCode
    );

    if (!referenceShipment.senderZone?.id) {
      throw new Error(
        "الشحنة المرجعية لا تحتوي senderZone"
      );
    }

    if (!referenceShipment.senderSubzone?.id) {
      throw new Error(
        "الشحنة المرجعية لا تحتوي senderSubzone"
      );
    }

    const serviceFilter: MayarServiceFilter = {
      serviceId:
        Number(referenceShipment.service?.id) ||
        MAYAR_SERVICE_ID,

      customerTypeCode:
        referenceShipment.customerType?.code ||
        "MERCHANT",

      fromZoneId:
        Number(referenceShipment.senderZone.id),

      fromSubzoneId:
        Number(referenceShipment.senderSubzone.id),
    };

    /**
     * 1) جلب القائمة المختلطة.
     * 2) استخراج كتلة المدن حتى أول تكرار للـ id/code.
     */
    const mixedEntries = await mayarListZones(
      login.token,
      {
        active: true,
        service: serviceFilter,
      }
    );

    const {
      cities: mayarCities,
      firstDuplicateIndex,
      remainingEntries,
    } = extractCitiesFromMixedEntries(mixedEntries);

    if (
      mayarCities.length === 0 ||
      firstDuplicateIndex < 0
    ) {
      throw new Error(
        "تعذر فصل المدن عن المناطق: لم يتم العثور على نقطة بداية التكرار."
      );
    }

    const systemCities = await loadSystemCities();

    const syncedCities: any[] = [];
    const cityErrors: any[] = [];

    /**
     * لكل مدينة:
     * - نعيد الاسم الرسمي ومعرّف المعيار إلى جدول cities.
     * - نجلب المناطق باستخدام parentId فقط، من دون service.
     * - نحدّث جدول areas.
     */
    for (const mayarCity of mayarCities) {
      try {
        const canonicalResult =
          await ensureCanonicalCity(
            systemCities,
            mayarCity,
            dryRun
          );

        const mayarAreas = await mayarListZones(
  login.token,
  {
    active: true,
    parentId: Number(mayarCity.id),
    service: serviceFilter,
  }
);
        const areasResult = await syncCityAreas(
          canonicalResult.city,
          mayarAreas,
          dryRun
        );

        syncedCities.push({
          mayar_city_id: Number(mayarCity.id),
          mayar_city_code:
            mayarCity.code ?? null,
          mayar_city_name:
            cleanName(mayarCity.name),

          system_city_id:
            canonicalResult.city.id,

          city_actions:
            canonicalResult.actions,

          areas_count:
            areasResult.areasCount,

          area_actions:
            areasResult.actions,
        });
      } catch (cityError: any) {
        cityErrors.push({
          mayar_city_id: Number(mayarCity.id),
          mayar_city_name:
            cleanName(mayarCity.name),
          error:
            cityError.message ||
            "Unknown city synchronization error",
        });
      }
    }

    /**
     * السجلات التي تحمل mayar_zone_id غير موجود ضمن قائمة المدن الصحيحة
     * هي مناطق أو بيانات قديمة. لا نحذفها؛ نفصل ربط المعيار فقط.
     * وبذلك تختفي من صفحة إنشاء الطلب التي تعرض المدن المرتبطة فقط.
     */
    const validMayarCityIds = new Set(
      mayarCities.map((city) => Number(city.id))
    );

    const detachedInvalidCityRows: any[] = [];

    for (const systemCity of systemCities) {
      if (
        cleanName(systemCity.name) ===
        PRIVATE_TRIPOLI_NAME
      ) {
        continue;
      }

      if (
        systemCity.mayar_zone_id !== null &&
        !validMayarCityIds.has(
          Number(systemCity.mayar_zone_id)
        )
      ) {
        if (!dryRun) {
          const { error } = await supabaseAdmin
            .from("cities")
            .update({ mayar_zone_id: null })
            .eq("id", systemCity.id);

          if (error) {
            cityErrors.push({
              city_id: systemCity.id,
              city_name: systemCity.name,
              error: error.message,
            });
            continue;
          }
        }

        detachedInvalidCityRows.push({
          city_id: systemCity.id,
          city_name: systemCity.name,
          old_mayar_zone_id:
            systemCity.mayar_zone_id,
          action: dryRun
            ? "will_detach_invalid_city_row"
            : "detached_invalid_city_row",
        });
      }
    }

    return NextResponse.json({
      ok: cityErrors.length === 0,
      dry_run: dryRun,

      reference_shipment: referenceShipment,
      service_filter_used: serviceFilter,

      mixed_entries_count:
        mixedEntries.length,

      first_duplicate_index:
        firstDuplicateIndex,

      extracted_cities_count:
        mayarCities.length,

      remaining_mixed_entries_count:
        remainingEntries.length,

      synced_cities_count:
        syncedCities.length,

      detached_invalid_city_rows_count:
        detachedInvalidCityRows.length,

      errors_count:
        cityErrors.length,

      extracted_cities:
        mayarCities.map((city) => ({
          id: Number(city.id),
          code: city.code ?? null,
          name: cleanName(city.name),
        })),

      synced_cities:
        syncedCities,

      detached_invalid_city_rows:
        detachedInvalidCityRows,

      errors:
        cityErrors,

      note: dryRun
        ? "تجربة فقط دون حفظ. إذا كانت extracted_cities صحيحة وerrors_count يساوي 0، افتح الرابط نفسه مع dry=0."
        : "تمت مزامنة المدن الرسمية ومناطقها، وفصل السجلات الخاطئة دون حذفها.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown final Mayar synchronization error",
      },
      { status: 500 }
    );
  }
}
