import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeText(value: any) {
  return String(value || "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isMayarDelivered(order: any) {
  const liveName = normalizeText(order.mayar_live_status_name);
  const liveCode = String(order.mayar_live_status_code || "")
    .trim()
    .toUpperCase();
  const orderStatus = normalizeText(order.status);

  // تم التسليم بالكامل.
  const fullDelivered =
    orderStatus === "delivered" ||
    orderStatus === "تم التسليم" ||
    liveName === "تم التسليم" ||
    liveName.includes("تم التسليم بالكامل") ||
    liveCode === "DTR" ||
    liveCode === "RCV" ||
    liveCode === "DELIVERED";

  // تم التسليم جزئيًا.
  const partialDelivered =
    orderStatus.includes("partially_delivered") ||
    orderStatus.includes("partial_delivery") ||
    orderStatus.includes("تسليم جزئي") ||
    orderStatus.includes("تم التسليم جزئي") ||
    liveName.includes("تسليم جزئي") ||
    liveName.includes("تم التسليم جزئي") ||
    liveCode.includes("PARTIAL");

  return fullDelivered || partialDelivered;
}

function daysSince(dateValue: string | null | undefined) {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function hoursSince(dateValue: string | null | undefined) {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.floor((Date.now() - time) / (60 * 60 * 1000));
}

function normalizeOrder(order: any, type: "private_tripoli" | "mayar") {
  const customer = asOne(order.customers);
  const city = asOne(customer?.cities);
  const area = asOne(customer?.areas);
  const store = asOne(order.stores);

  return {
    id: order.id,
    type,
    order_code: order.order_code || "",
    store_id: order.store_id,
    store_name: store?.name || "-",
    status: order.status || "",
    total_amount: Number(order.total_amount || 0),
    created_at: order.created_at,
    printed_at: order.printed_at,
    mayar_sent_at: order.mayar_sent_at,
    mayar_code: order.mayar_code || order.mayar_shipment_code || "",
    mayar_live_status_code: order.mayar_live_status_code || "",
    mayar_live_status_name: order.mayar_live_status_name || "",
    mayar_status_updated_at: order.mayar_status_updated_at || null,
    customer_name: customer?.name || "-",
    phone: customer?.phone || "-",
    city: city?.name || "-",
    area: area?.name || "-",
    address: customer?.address || "-",
    age_hours:
      type === "private_tripoli"
        ? hoursSince(order.printed_at || order.created_at)
        : hoursSince(order.mayar_sent_at || order.created_at),
    age_days:
      type === "mayar"
        ? daysSince(order.mayar_sent_at || order.created_at)
        : daysSince(order.printed_at || order.created_at),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = String(searchParams.get("store_id") || "").trim();

    const privateCutoff = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const mayarCutoff = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000
    ).toISOString();

    let privateQuery = supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_code,
        store_id,
        status,
        total_amount,
        created_at,
        printed_at,
        mayar_sent_at,
        mayar_code,
        mayar_shipment_code,
        mayar_live_status_code,
        mayar_live_status_name,
        mayar_status_updated_at,
        stores(id, name),
        customers(
          id,
          name,
          phone,
          address,
          cities(name),
          areas(name)
        )
      `)
      .eq("shipping_company", "private_tripoli")
      .eq("status", "shipped")
      .lte("printed_at", privateCutoff)
      .order("printed_at", { ascending: true });

    let mayarQuery = supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_code,
        store_id,
        status,
        total_amount,
        created_at,
        printed_at,
        mayar_sent_at,
        mayar_code,
        mayar_shipment_code,
        mayar_live_status_code,
        mayar_live_status_name,
        mayar_status_updated_at,
        stores(id, name),
        customers(
          id,
          name,
          phone,
          address,
          cities(name),
          areas(name)
        )
      `)
      .not("mayar_sent_at", "is", null)
      .lte("mayar_sent_at", mayarCutoff)
      .order("mayar_sent_at", { ascending: true });

    if (storeId) {
      privateQuery = privateQuery.eq("store_id", storeId);
      mayarQuery = mayarQuery.eq("store_id", storeId);
    }

    const [
      { data: privateOrders, error: privateError },
      { data: mayarOrders, error: mayarError },
    ] = await Promise.all([privateQuery, mayarQuery]);

    if (privateError) {
      throw new Error(
        "خطأ في قراءة تنبيهات طرابلس الخاصة: " + privateError.message
      );
    }

    if (mayarError) {
      throw new Error(
        "خطأ في قراءة تنبيهات المعيار: " + mayarError.message
      );
    }

    const mayarNotDelivered = (mayarOrders || []).filter(
      (order: any) => !isMayarDelivered(order)
    );

    const candidateIds = [
      ...(privateOrders || []).map((order: any) => order.id),
      ...mayarNotDelivered.map((order: any) => order.id),
    ];

    const returnedIds = new Set<string>();

    if (candidateIds.length > 0) {
      const { data: returns, error: returnsError } = await supabaseAdmin
        .from("order_returns")
        .select("order_id, inventory_restored")
        .in("order_id", candidateIds)
        .eq("inventory_restored", true);

      if (returnsError) {
        throw new Error(
          "خطأ في فحص الطلبات التي تم إرجاعها: " + returnsError.message
        );
      }

      for (const row of returns || []) {
        if (row.order_id) returnedIds.add(row.order_id);
      }
    }

    const privateAlerts = (privateOrders || [])
      .filter((order: any) => !returnedIds.has(order.id))
      .map((order: any) => normalizeOrder(order, "private_tripoli"));

    const mayarAlerts = mayarNotDelivered
      .filter((order: any) => !returnedIds.has(order.id))
      .map((order: any) => normalizeOrder(order, "mayar"));

    return NextResponse.json({
      ok: true,
      counts: {
        private_tripoli: privateAlerts.length,
        mayar: mayarAlerts.length,
        total: privateAlerts.length + mayarAlerts.length,
      },
      private_tripoli: privateAlerts,
      mayar: mayarAlerts,
      generated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "فشل تحميل تنبيهات الطلبات",
      },
      { status: 500 }
    );
  }
}
