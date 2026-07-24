import { NextResponse } from "next/server";
import {
  mayarGraphql,
  mayarListZones,
  mayarLogin,
  MAYAR_SERVICE_ID,
  type MayarServiceFilter,
} from "@/lib/mayar";

type ReferenceShipment = {
  code: string;
  service: { id: number; name: string };
  customerType: { code: string; name: string };
  senderZone: { id: number; code?: string | null; name: string } | null;
  senderSubzone: { id: number; code?: string | null; name: string } | null;
};

const TEST_CITIES = [
  { id: 3, name: "مصراتة" },
  { id: 6, name: "الزاوية" },
  { id: 10, name: "سرت" },
  { id: 12, name: "طبرق" },
];

async function getReferenceShipment(
  token: string,
  code: string
): Promise<ReferenceShipment> {
  const query = `
    query Shipment($code: String) {
      shipment(code: $code) {
        code
        service { id name }
        customerType { code name }
        senderZone { id code name }
        senderSubzone { id code name }
      }
    }
  `;

  const data = await mayarGraphql<{ shipment: ReferenceShipment | null }>(
    query,
    { code },
    token
  );

  if (!data.shipment) {
    throw new Error(`لم يتم العثور على شحنة المعيار ${code}`);
  }

  return data.shipment;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const referenceCode =
      searchParams.get("code") || "N6645150";

    const login = await mayarLogin();
    const shipment = await getReferenceShipment(
      login.token,
      referenceCode
    );

    if (!shipment.senderZone?.id) {
      throw new Error("الشحنة المرجعية لا تحتوي senderZone");
    }

    if (!shipment.senderSubzone?.id) {
      throw new Error("الشحنة المرجعية لا تحتوي senderSubzone");
    }

    const serviceFilter: MayarServiceFilter = {
      serviceId:
        Number(shipment.service?.id) || MAYAR_SERVICE_ID,
      customerTypeCode:
        shipment.customerType?.code || "MERCHANT",
      fromZoneId: Number(shipment.senderZone.id),
      fromSubzoneId: Number(shipment.senderSubzone.id),
    };

    const results = [];

    for (const city of TEST_CITIES) {
      const withoutService = await mayarListZones(
        login.token,
        {
          active: true,
          parentId: city.id,
        }
      );

      const withService = await mayarListZones(
        login.token,
        {
          active: true,
          parentId: city.id,
          service: serviceFilter,
        }
      );

      results.push({
        city,
        parent_only: {
          count: withoutService.length,
          items: withoutService,
        },
        parent_with_service: {
          count: withService.length,
          items: withService,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "safe_comparison_no_database_changes",
      reference_shipment: shipment,
      service_filter_used: serviceFilter,
      results,
      note:
        "هذا اختبار مقارنة فقط. لم يتم تعديل أي بيانات في Supabase.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown Mayar parent/service comparison error",
      },
      { status: 500 }
    );
  }
}
