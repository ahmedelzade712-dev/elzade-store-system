import { NextResponse } from "next/server";
import {
  mayarGraphql,
  mayarListZones,
  mayarLogin,
  MAYAR_SERVICE_ID,
  type MayarServiceFilter,
  type MayarZone,
} from "@/lib/mayar";

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

function clean(value: unknown) {
  return String(value ?? "").trim();
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

/**
 * نتيجة listZonesDropdown مع فلتر الخدمة تظهر كقائمتين متتاليتين:
 * 1) المدن
 * 2) المناطق
 *
 * IDs المدن وIDs المناطق من جدولين مختلفين، لذلك قد يتكرر الرقم.
 * أول تكرار لـ id/code يعني بداية قائمة المناطق.
 */
function splitCitiesFromMixedEntries(entries: MayarZone[]) {
  const seen = new Set<string>();
  const cities: MayarZone[] = [];
  const remainingEntries: MayarZone[] = [];

  let reachedSecondBlock = false;

  for (const entry of entries) {
    const key = clean(entry.code) || String(Number(entry.id));

    if (!reachedSecondBlock && seen.has(key)) {
      reachedSecondBlock = true;
    }

    if (reachedSecondBlock) {
      remainingEntries.push(entry);
      continue;
    }

    seen.add(key);
    cities.push(entry);
  }

  return {
    cities,
    remainingEntries,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const referenceCode =
      searchParams.get("code") || "N6645150";

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
     * هذه القائمة المختلطة نستخدمها فقط لاستخراج كتلة المدن الأولى.
     */
    const mixedEntries = await mayarListZones(
      login.token,
      {
        active: true,
        service: serviceFilter,
      }
    );

    const {
      cities,
      remainingEntries,
    } = splitCitiesFromMixedEntries(mixedEntries);

    /**
     * اختبار parentId الصحيح:
     * لا نرسل service هنا، لأن الخدمة كانت تعيد القائمة المختلطة.
     */
    const preview: any[] = [];

    for (const city of cities.slice(0, 15)) {
      const areas = await mayarListZones(
        login.token,
        {
          active: true,
          parentId: Number(city.id),
        }
      );

      preview.push({
        city: {
          id: Number(city.id),
          code: city.code ?? null,
          name: city.name,
        },

        areas_count: areas.length,

        areas: areas.slice(0, 30).map((area) => ({
          id: Number(area.id),
          code: area.code ?? null,
          name: area.name,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "safe_test_no_database_changes",

      reference_shipment: referenceShipment,
      service_filter_used: serviceFilter,

      mixed_entries_count: mixedEntries.length,

      extracted_cities_count: cities.length,

      remaining_entries_count:
        remainingEntries.length,

      extracted_cities: cities.map((city) => ({
        id: Number(city.id),
        code: city.code ?? null,
        name: city.name,
      })),

      preview_first_15_cities_with_parentId_without_service:
        preview,

      first_20_remaining_entries:
        remainingEntries.slice(0, 20).map((entry) => ({
          id: Number(entry.id),
          code: entry.code ?? null,
          name: entry.name,
        })),

      note:
        "اختبار آمن: تم تقسيم القائمة عند أول تكرار للـ id/code، ثم جلب مناطق كل مدينة باستخدام parentId فقط دون service. لم يتم تعديل Supabase.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown Mayar hierarchy split test error",
      },
      { status: 500 }
    );
  }
}
