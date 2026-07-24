import { NextResponse } from "next/server";
import { mayarGraphql, mayarLogin } from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeStatus(rawCode: string, rawName: string, inWarehouse: boolean) {
  const code = String(rawCode || "").trim().toUpperCase();
  const name = String(rawName || "").trim();
  const text = `${code} ${name}`.toLowerCase();

  // طلب شحن: تم إدخال الشحنة في نظام المعيار ولم تصل بعد إلى مقر الشركة.
  if (
    code === "PKR" ||
    text.includes("طلب شحن") ||
    text.includes("انتظار الشحن") ||
    text.includes("waiting for shipping") ||
    text.includes("shipment request")
  ) {
    return {
      key: "waiting_shipping",
      label: "انتظار الشحن",
    };
  }

  // تم الإرجاع فعليًا إلى الراسل.
  if (
    code === "RTRN" ||
    text.includes("تم الارجاع للراسل") ||
    text.includes("تم الإرجاع للراسل") ||
    text.includes("returned to sender")
  ) {
    return {
      key: "returned_to_sender",
      label: "تم الإرجاع للراسل",
    };
  }

  // الشحنة في مسار الرجوع إلى الراسل.
  if (
    code === "RTS" ||
    text.includes("ارجاع للراسل") ||
    text.includes("إرجاع للراسل") ||
    text.includes("return to sender")
  ) {
    return {
      key: "return_to_sender",
      label: "إرجاع للراسل",
    };
  }

  if (
    code === "DTR" ||
    text.includes("تم التسليم") ||
    text.includes("delivered")
  ) {
    return {
      key: "delivered",
      label: "تم التسليم",
    };
  }

  if (
    text.includes("تعذر") ||
    text.includes("فشل") ||
    text.includes("رفض") ||
    text.includes("لم يتم التسليم") ||
    text.includes("not delivered") ||
    text.includes("failed") ||
    text.includes("rejected") ||
    code === "RJCT"
  ) {
    return {
      key: "failed_delivery",
      label: "تعذر التسليم",
    };
  }

  if (
    text.includes("اعادة توصيل") ||
    text.includes("إعادة توصيل") ||
    text.includes("تأجيل") ||
    text.includes("موعد جديد") ||
    text.includes("reschedule") ||
    text.includes("reattempt")
  ) {
    return {
      key: "redelivery",
      label: "إعادة توصيل",
    };
  }

  if (
    text.includes("قيد التوصيل") ||
    text.includes("مع المندوب") ||
    text.includes("خرج للتوصيل") ||
    text.includes("out for delivery") ||
    text.includes("delivery agent") ||
    code === "OTD"
  ) {
    return {
      key: "out_for_delivery",
      label: "قيد التوصيل",
    };
  }

  if (
    text.includes("في المخزن") ||
    text.includes("المخزن") ||
    text.includes("warehouse") ||
    code === "PKH" ||
    code === "PKM"
  ) {
    return {
      key: "warehouse",
      label: "في المخزن",
    };
  }

  if (inWarehouse) {
    return {
      key: "warehouse",
      label: "في المخزن",
    };
  }

  return {
    key: "waiting_shipping",
    label: "انتظار الشحن",
  };
}

function calculateMayarLargeOrderFee(amount: number) {
  if (amount <= 1000) return 0;

  return 10 + Math.floor((amount - 1000) / 500) * 5;
}

async function insertFinancialTransactionIfMissing(payload: any) {
  const { error } = await supabaseAdmin
    .from("financial_transactions")
    .insert(payload);

  if (error && error.code !== "23505") {
    throw new Error("خطأ في تسجيل الحركة المالية: " + error.message);
  }
}

async function recordDeliveredMayarOrder(shipment: any) {
  const orderCode = String(shipment.refNumber || "").trim();

  if (!orderCode) return;

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select(`
      id,
      order_code,
      store_id,
      total_amount,
      status,
      mayar_parcel_type,
      order_items(
        quantity,
        product_variants(sale_price)
      )
    `)
    .eq("order_code", orderCode)
    .maybeSingle();

  if (orderError) {
    throw new Error(
      `خطأ في قراءة طلب ${orderCode}: ${orderError.message}`
    );
  }

  if (!order) return;

  // طرد مقابل طرد هو استبدال مخزني فقط ولا ينتج عنه أي حركة مالية،
  // مهما كانت حالة الشحنة لدى المعيار.
  if (order.mayar_parcel_type === "exchange") return;

  const savedAmount = Number(order.total_amount || 0);
  const catalogAmount = (order.order_items || []).reduce((sum: number, item: any) => {
    const variant = Array.isArray(item.product_variants)
      ? item.product_variants[0]
      : item.product_variants;

    return (
      sum +
      Number(item.quantity || 0) * Number(variant?.sale_price || 0)
    );
  }, 0);

  // إذا كان مبلغ التحصيل صفرًا في طلب تسليم كامل، فهذا طلب مدفوع مسبقًا
  // بالحوالة المصرفية، ولذلك نضيف سعر المنتجات الحالي من جدول المنتجات.
  const amount = savedAmount > 0 ? savedAmount : catalogAmount;
  if (amount <= 0) return;

  const occurredAt =
    shipment.deliveredOrReturnedDate ||
    shipment.updatedAt ||
    new Date().toISOString();

  await insertFinancialTransactionIfMissing({
    store_id: order.store_id,
    order_id: order.id,
    transaction_type: "sale",
    direction: "credit",
    category: "مبيعات",
    amount,
    description: `إضافة قيمة طلب المعيار ${order.order_code} بعد التسليم`,
    source_key: `order:${order.id}:mayar_delivered_sale`,
    is_system_generated: true,
    occurred_at: occurredAt,
    metadata: {
      order_code: order.order_code,
      mayar_code: shipment.code,
      mayar_status_code: shipment.status?.code || "",
      mayar_status_name: shipment.status?.name || "",
      amount_source: savedAmount > 0 ? "order_total" : "product_catalog",
      prepaid_bank_transfer: savedAmount === 0,
    },
  });

  const largeOrderFee = calculateMayarLargeOrderFee(amount);

  if (largeOrderFee > 0) {
    await insertFinancialTransactionIfMissing({
      store_id: order.store_id,
      order_id: order.id,
      transaction_type: "expense",
      direction: "debit",
      category: "رسوم المعيار للطلبات الكبيرة",
      amount: largeOrderFee,
      description: `رسوم المعيار للطلب الكبير ${order.order_code}`,
      source_key: `order:${order.id}:mayar_large_order_fee`,
      is_system_generated: true,
      occurred_at: occurredAt,
      metadata: {
        order_code: order.order_code,
        mayar_code: shipment.code,
        order_amount: amount,
      },
    });
  }

  if (order.status !== "delivered") {
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
      })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(
        `تم تسجيل الرصيد لكن تعذر تحديث حالة الطلب ${order.order_code}: ${updateError.message}`
      );
    }
  }
}


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const first = Math.min(
      100,
      Math.max(1, Number(searchParams.get("first") || 100))
    );
    const search = String(searchParams.get("search") || "").trim();

    const login = await mayarLogin();

    const query = `
      query ListMayarShipments(
        $input: ListShipmentsFilterInput
        $first: Int!
        $page: Int
      ) {
        listShipments(input: $input, first: $first, page: $page) {
          paginatorInfo {
            count
            currentPage
            hasMorePages
            lastPage
            perPage
            total
          }
          data {
            id
            code
            refNumber
            createdAt
            updatedAt
            deliveryDate
            deliveredOrReturnedDate
            trackingUrl
            recipientName
            recipientPhone
            recipientMobile
            recipientAddress
            inWarehouse
            attempts
            cancelled
            status {
              code
              name
            }
            recipientZone {
              id
              name
            }
            recipientSubzone {
              id
              name
            }
          }
        }
      }
    `;

    const variables = {
      input: search ? { search } : {},
      first,
      page,
    };

    const data = await mayarGraphql<any>(query, variables, login.token);
    const result = data.listShipments;

    for (const shipment of result?.data || []) {
      const normalized = normalizeStatus(
        shipment.status?.code,
        shipment.status?.name,
        Boolean(shipment.inWarehouse)
      );

      const orderCode = String(shipment.refNumber || "").trim();

      if (orderCode) {
        const { error: liveStatusError } = await supabaseAdmin
          .from("orders")
          .update({
            mayar_live_status_code: shipment.status?.code || null,
            mayar_live_status_name: shipment.status?.name || null,
            mayar_status_updated_at:
              shipment.updatedAt || new Date().toISOString(),
          })
          .eq("order_code", orderCode);

        if (liveStatusError) {
          throw new Error(
            `فشل حفظ حالة المعيار للطلب ${orderCode}: ${liveStatusError.message}`
          );
        }
      }

      if (normalized.key === "delivered") {
        await recordDeliveredMayarOrder(shipment);
      }
    }

    const shipments = (result?.data || []).map((shipment: any) => {
      const normalized = normalizeStatus(
        shipment.status?.code,
        shipment.status?.name,
        Boolean(shipment.inWarehouse)
      );

      return {
        id: shipment.id,
        mayar_code: shipment.code,
        order_code: shipment.refNumber,
        customer_name: shipment.recipientName,
        phone: shipment.recipientPhone || shipment.recipientMobile,
        city: shipment.recipientZone?.name || "",
        area: shipment.recipientSubzone?.name || "",
        address: shipment.recipientAddress || "",
        status_key: normalized.key,
        status_label: normalized.label,
        raw_status_code: shipment.status?.code || "",
        raw_status_name: shipment.status?.name || "",
        in_warehouse: Boolean(shipment.inWarehouse),
        attempts: shipment.attempts || 0,
        created_at: shipment.createdAt,
        updated_at: shipment.updatedAt,
        delivery_date: shipment.deliveryDate,
        delivered_or_returned_at: shipment.deliveredOrReturnedDate,
        tracking_url: shipment.trackingUrl || "",
        cancelled: Boolean(shipment.cancelled),
      };
    });

    return NextResponse.json({
      ok: true,
      read_only: true,
      paginator: result?.paginatorInfo || null,
      shipments,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        read_only: true,
        error: error.message || "فشل تحميل حالات شحنات المعيار",
      },
      { status: 500 }
    );
  }
}
