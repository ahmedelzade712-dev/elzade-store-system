import { NextResponse } from "next/server";
import { mayarGraphql, mayarLogin } from "@/lib/mayar";

type ShipmentRow = {
  id: number;
  code: string;
  refNumber?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deliveredOrReturnedDate?: string | null;
  piecesCount: number;
  returnPiecesCount?: number | null;
  collected: boolean;
  price: number;
  amount: number;
  deliveryFees: number;
  collectionFees: number;
  totalAmount: number;
  deliveredAmount: number;
  returnedValue: number;
  collectedFees: number;
  collectedAmount: number;
  pendingCollectionAmount: number;
  customerDue: number;
  status: {
    code?: string | null;
    name?: string | null;
  } | null;
};

async function findShipmentByCode(token: string, search: string) {
  const query = `
    query InspectShipmentFinancials(
      $input: ListShipmentsFilterInput
      $first: Int!
      $page: Int
    ) {
      listShipments(input: $input, first: $first, page: $page) {
        data {
          id
          code
          refNumber
          createdAt
          updatedAt
          deliveredOrReturnedDate

          piecesCount
          returnPiecesCount
          collected

          price
          amount
          deliveryFees
          collectionFees
          totalAmount
          deliveredAmount
          returnedValue
          collectedFees
          collectedAmount
          pendingCollectionAmount
          customerDue

          status {
            code
            name
          }
        }
      }
    }
  `;

  const data = await mayarGraphql<any>(
    query,
    {
      input: { search },
      first: 20,
      page: 1,
    },
    token
  );

  const rows: ShipmentRow[] = data?.listShipments?.data || [];

  const exact = rows.find(
    (row) =>
      String(row.code || "").trim().toUpperCase() === search.toUpperCase() ||
      String(row.refNumber || "").trim().toUpperCase() === search.toUpperCase()
  );

  return exact || rows[0] || null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const rawCodes = String(
      searchParams.get("codes") || "N6816481,N6820730"
    );

    const codes = rawCodes
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (codes.length === 0) {
      throw new Error("أدخل كود شحنة واحدًا على الأقل");
    }

    const login = await mayarLogin();

    const results = [];

    for (const code of codes) {
      const shipment = await findShipmentByCode(login.token, code);

      results.push({
        searched_code: code,
        found: Boolean(shipment),
        shipment,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "safe_read_only_mayar_financial_comparison",
      results,
      note:
        "قراءة فقط من API المعيار. لا يتم تعديل أي طلب أو رصيد أو مخزون أو بيانات.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "فشل فحص القيم المالية لشحنات المعيار",
        note:
          "لم يتم تعديل أي بيانات في Supabase أو المعيار.",
      },
      { status: 500 }
    );
  }
}
