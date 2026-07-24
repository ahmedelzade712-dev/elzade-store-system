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

function codeSignature(code: string | null | undefined) {
  const value = clean(code);

  if (!value) return "(EMPTY)";

  const prefix = value.match(/^[A-Za-z_]+/)?.[0];
  if (prefix) return prefix.toUpperCase();

  const firstPart = value.split(/[-_.:/\\\s]+/)[0];
  return firstPart || value;
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

    const entries = await mayarListZones(login.token, {
      active: true,
      service: serviceFilter,
    });

    const codeGroups = new Map<
      string,
      {
        count: number;
        samples: {
          id: number;
          code: string | null;
          name: string;
        }[];
      }
    >();

    for (const entry of entries) {
      const signature = codeSignature(entry.code);
      const current = codeGroups.get(signature) || {
        count: 0,
        samples: [],
      };

      current.count += 1;

      if (current.samples.length < 20) {
        current.samples.push({
          id: Number(entry.id),
          code: entry.code ?? null,
          name: entry.name,
        });
      }

      codeGroups.set(signature, current);
    }

    const groups = Array.from(codeGroups.entries())
      .map(([signature, value]) => ({
        signature,
        count: value.count,
        samples: value.samples,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      mode: "safe_test_no_database_changes",
      reference_shipment: shipment,
      service_filter_used: serviceFilter,
      total_entries: entries.length,
      distinct_code_signatures: groups.length,
      code_groups: groups,
      first_120_entries: entries.slice(0, 120).map((entry) => ({
        id: Number(entry.id),
        code: entry.code ?? null,
        name: entry.name,
      })),
      note:
        "هذا الاختبار يقرأ id وcode وname فقط، ولا يعدل Supabase.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown Mayar zone-code inspection error",
      },
      { status: 500 }
    );
  }
}
