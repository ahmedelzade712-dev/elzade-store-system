import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOrder(order: any) {
  const customer = asOne(order.customers);
  const city = asOne(customer?.cities);
  const area = asOne(customer?.areas);
  const store = asOne(order.stores);

  return {
    id: order.id,
    order_code: order.order_code,
    mayar_code: order.mayar_code || order.mayar_shipment_code || "",
    store_id: order.store_id,
    store_name: store?.name || "-",
    total_amount: Number(order.total_amount || 0),
    total_cost: Number(order.total_cost || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    shipping_company: order.shipping_company || "",
    status: order.status || "",
    mayar_status: order.mayar_status || "",
    mayar_live_status_code: order.mayar_live_status_code || "",
    mayar_live_status_name: order.mayar_live_status_name || "",
    mayar_status_updated_at: order.mayar_status_updated_at || null,
    mayar_parcel_type: order.mayar_parcel_type || "full_delivery",
    mayar_delivery_result: order.mayar_delivery_result || null,
    mayar_price: Number(order.mayar_price || 0),
    mayar_returned_value: Number(order.mayar_returned_value || 0),
    mayar_customer_due: Number(order.mayar_customer_due || 0),
    exchange_original_order_id: order.exchange_original_order_id || null,
    exchange_return_received: Boolean(order.exchange_return_received),
    printed_at: order.printed_at,
    customer: {
      name: customer?.name || "-",
      phone: customer?.phone || "-",
      city: city?.name || "-",
      area: area?.name || "-",
      address: customer?.address || "-",
    },
    items: (order.order_items || []).map((item: any) => {
      const variant = asOne(item.product_variants);
      const product = asOne(variant?.products);

      return {
        id: item.id,
        variant_id: item.variant_id,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        unit_cost: Number(item.unit_cost || 0),
        product_name: product?.name || "-",
        model: product?.model || "-",
        color: variant?.color || "-",
        size: variant?.size || "-",
        image_url: variant?.image_url || product?.main_image_url || "",
      };
    }),
  };
}

async function findOrderByCode(code: string) {
  const raw = String(code || "").trim();
  const candidates = Array.from(
    new Set(
      [
        raw,
        raw.toUpperCase(),
        raw.toLowerCase(),
        /^\d+$/.test(raw) ? `N${raw}` : "",
        /^[nN]\d+$/.test(raw) ? `N${raw.slice(1)}` : "",
      ].filter(Boolean)
    )
  );

  for (const candidate of candidates) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_code,
        store_id,
        total_amount,
        total_cost,
        shipping_fee,
        shipping_company,
        status,
        mayar_status,
        mayar_live_status_code,
        mayar_live_status_name,
        mayar_status_updated_at,
        mayar_parcel_type,
        mayar_delivery_result,
        mayar_price,
        mayar_returned_value,
        mayar_customer_due,
        exchange_original_order_id,
        exchange_return_received,
        mayar_code,
        mayar_shipment_code,
        printed_at,
        stores(id, name),
        customers(
          id,
          name,
          phone,
          address,
          cities(name),
          areas(name)
        ),
        order_items(
          id,
          variant_id,
          quantity,
          unit_price,
          unit_cost,
          product_variants(
            id,
            color,
            size,
            image_url,
            products(
              id,
              name,
              model,
              main_image_url
            )
          )
        )
      `)
      .or(
        `order_code.ilike.${candidate},mayar_code.ilike.${candidate},mayar_shipment_code.ilike.${candidate}`
      )
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  return null;
}

async function findPendingExchangeForOriginalOrder(originalOrderId: string) {
  const { data: exchangeOrder, error: exchangeError } = await supabaseAdmin
    .from("orders")
    .select(`
      id,
      order_code,
      exchange_return_received,
      order_exchange_return_items!order_exchange_return_items_exchange_order_id_fkey(
        id,
        original_order_id,
        original_order_item_id,
        variant_id,
        quantity,
        inventory_restored,
        product_variants(
          id,
          color,
          size,
          image_url,
          products(name, model, main_image_url)
        )
      )
    `)
    .eq("exchange_original_order_id", originalOrderId)
    .eq("mayar_parcel_type", "exchange")
    .eq("exchange_return_received", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exchangeError) {
    throw new Error("خطأ في فحص عملية الاستبدال: " + exchangeError.message);
  }

  return exchangeOrder;
}

function normalizeExchangeReturnItems(exchangeOrder: any) {
  return (exchangeOrder?.order_exchange_return_items || []).map((row: any) => {
    const variant = asOne(row.product_variants);
    const product = asOne(variant?.products);

    return {
      id: row.id,
      variant_id: row.variant_id,
      quantity: Number(row.quantity || 0),
      inventory_restored: Boolean(row.inventory_restored),
      product_name: product?.name || "-",
      model: product?.model || "-",
      color: variant?.color || "-",
      size: variant?.size || "-",
      image_url: variant?.image_url || product?.main_image_url || "",
    };
  });
}

function isPrivateTripoli(order: any) {
  const customer = asOne(order.customers);
  const city = asOne(customer?.cities);
  return String(city?.name || "").trim() === "طرابلس (خاصة)";
}

function isMayarOrder(order: any) {
  return Boolean(
    order?.mayar_code ||
      order?.mayar_shipment_code ||
      String(order?.shipping_company || "").toLowerCase().includes("mayar") ||
      order?.mayar_live_status_code ||
      order?.mayar_live_status_name
  );
}

function normalizedMayarLiveState(order: any) {
  const code = String(order?.mayar_live_status_code || "").trim().toUpperCase();
  const name = String(order?.mayar_live_status_name || "").trim().toLowerCase();
  const text = `${code} ${name}`;

  if (
    code === "RTRN" ||
    text.includes("تم الارجاع للراسل") ||
    text.includes("تم الإرجاع للراسل") ||
    text.includes("returned to sender")
  ) return "returned_to_sender";

  if (
    code === "RTS" ||
    text.includes("ارجاع للراسل") ||
    text.includes("إرجاع للراسل") ||
    text.includes("return to sender")
  ) return "return_to_sender";

  if (
    code === "DTR" ||
    text.includes("تم التسليم") ||
    text.includes("delivered")
  ) return "delivered";

  if (
    code === "RJCT" ||
    text.includes("تعذر") ||
    text.includes("فشل") ||
    text.includes("رفض") ||
    text.includes("لم يتم التسليم")
  ) return "failed_delivery";

  return "other";
}

async function getDeliveryResult(order: any) {
  const saved = String(order?.mayar_delivery_result || "").trim().toLowerCase();
  if (saved === "partial" || saved === "full") return saved;

  // دعم الطلبات القديمة قبل إضافة mayar_delivery_result.
  const { data, error } = await supabaseAdmin
    .from("financial_transactions")
    .select("metadata")
    .eq("order_id", order.id)
    .eq("source_key", `order:${order.id}:mayar_delivered_sale`)
    .maybeSingle();

  if (error) throw new Error("خطأ في قراءة نتيجة تسليم المعيار: " + error.message);

  const legacy = String(data?.metadata?.delivery_result || "").trim().toLowerCase();
  return legacy === "partial" || legacy === "full" ? legacy : null;
}

async function getExistingReturn(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("order_returns")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function getEligibility(order: any, pendingExchange: any, existingReturn: any) {
  if (pendingExchange) {
    const exchangeItems = normalizeExchangeReturnItems(pendingExchange);
    const pendingItems = exchangeItems.filter((item: any) => !item.inventory_restored);

    if (pendingItems.length === 0) {
      return {
        allowed: false,
        mode: null,
        kind: "exchange",
        reason: "تم استلام القطعة المستبدلة وإعادتها إلى المخزون سابقًا.",
      };
    }

    return {
      allowed: true,
      mode: "full",
      kind: "exchange",
      reason: "",
    };
  }

  if (existingReturn?.inventory_restored) {
    return {
      allowed: false,
      mode: null,
      kind: "already_returned",
      reason: "تم إرجاع منتجات هذا الطلب إلى المخزون سابقًا.",
    };
  }

  if (isPrivateTripoli(order)) {
    const status = String(order.status || "");

    if (status === "returned") {
      return {
        allowed: false,
        mode: null,
        kind: "private_tripoli",
        reason: "تم إرجاع هذا الطلب مسبقًا من صفحة طرابلس خاصة.",
      };
    }

    if (status === "delivered") {
      return {
        allowed: false,
        mode: null,
        kind: "private_tripoli",
        reason: "لا يمكن الاسترجاع: طلب طرابلس خاصة تم تسليمه.",
      };
    }

    if (status === "partial_delivered") {
      return {
        allowed: false,
        mode: null,
        kind: "private_tripoli",
        reason: "هذا الطلب عولج كتسليم جزئي من صفحة طرابلس خاصة، ولا يُسترجع من هذه الصفحة.",
      };
    }

    return {
      allowed: false,
      mode: null,
      kind: "private_tripoli",
      reason: "طلبات طرابلس خاصة تُعالج من صفحة طرابلس خاصة فقط.",
    };
  }

  if (!isMayarOrder(order)) {
    return {
      allowed: false,
      mode: null,
      kind: "unsupported",
      reason: "هذه الصفحة مخصصة لرواجع شركة المعيار وقطع الاستبدال فقط.",
    };
  }

  const deliveryResult = await getDeliveryResult(order);
  const liveState = normalizedMayarLiveState(order);

  if (deliveryResult === "full") {
    return {
      allowed: false,
      mode: null,
      kind: "mayar_full_delivered",
      reason: "لا يمكن الاسترجاع: طلب المعيار تم تسليمه بالكامل.",
    };
  }

  if (deliveryResult === "partial") {
    return {
      allowed: true,
      mode: "partial",
      kind: "mayar_partial",
      reason: "",
    };
  }

  if (liveState === "returned_to_sender") {
    return {
      allowed: true,
      mode: "full",
      kind: "mayar_full_return",
      reason: "",
    };
  }

  if (liveState === "return_to_sender") {
    return {
      allowed: false,
      mode: null,
      kind: "mayar_returning",
      reason: "شحنة المعيار ما زالت في مسار الرجوع. انتظر حتى تصبح الحالة: تم الإرجاع للراسل.",
    };
  }

  if (liveState === "delivered" || String(order.status || "") === "delivered") {
    return {
      allowed: false,
      mode: null,
      kind: "mayar_full_delivered",
      reason: "لا يمكن الاسترجاع: الطلب مسجل كتسليم كامل، ولا توجد نتيجة تسليم جزئي محفوظة.",
    };
  }

  return {
    allowed: false,
    mode: null,
    kind: "mayar_not_returned",
    reason: "لا يمكن إدخال المخزون الآن. يجب أن تكون شحنة المعيار قد رجعت للراسل، أو أن تكون مسجلة كتسليم جزئي.",
  };
}

async function restoreInventoryOnce(
  returnKey: string,
  variantId: string,
  quantity: number,
  movementType: string,
  reason: string
) {
  const { data, error } = await supabaseAdmin.rpc("restore_inventory_once", {
    p_return_key: returnKey,
    p_variant_id: variantId,
    p_quantity: Math.floor(Number(quantity || 0)),
    p_movement_type: movementType,
    p_reason: reason,
  });

  if (error) throw new Error("فشل إعادة المخزون بصورة آمنة: " + error.message);
  return Boolean(data);
}

async function upsertReturnRecord(order: any, reason: string) {
  const existing = await getExistingReturn(order.id);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("order_returns")
      .update({
        return_reason: reason,
        inventory_restored: true,
        financial_reversed: false,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabaseAdmin.from("order_returns").insert({
    order_id: order.id,
    store_id: order.store_id,
    order_code: order.order_code,
    mayar_code: order.mayar_code || order.mayar_shipment_code || null,
    return_reason: reason,
    inventory_restored: true,
    financial_reversed: false,
  });

  if (error) throw new Error(error.message);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = String(searchParams.get("code") || "").trim();

    if (!code) throw new Error("أدخل كود الطلب أو كود المعيار");

    const order = await findOrderByCode(code);

    if (!order) {
      return NextResponse.json(
        { ok: false, error: "لم يتم العثور على الطلب" },
        { status: 404 }
      );
    }

    const existingReturn = await getExistingReturn(order.id);
    const pendingExchange = await findPendingExchangeForOriginalOrder(order.id);
    const eligibility = await getEligibility(order, pendingExchange, existingReturn);

    return NextResponse.json({
      ok: true,
      order: normalizeOrder(order),
      is_exchange_return: eligibility.kind === "exchange",
      exchange_order: pendingExchange
        ? {
            id: pendingExchange.id,
            order_code: pendingExchange.order_code,
            items: normalizeExchangeReturnItems(pendingExchange),
          }
        : null,
      already_returned:
        eligibility.kind === "already_returned" ||
        (eligibility.kind === "exchange" && !eligibility.allowed),
      return_allowed: eligibility.allowed,
      allowed_return_mode: eligibility.mode,
      return_kind: eligibility.kind,
      block_reason: eligibility.reason || "",
      return_record: existingReturn || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "فشل البحث عن الطلب" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim();
    const reason = String(body?.reason || "").trim();
    const requestedReturnedItems = Array.isArray(body?.returned_items)
      ? body.returned_items
      : [];

    if (!code) throw new Error("أدخل كود الطلب أو كود المعيار");

    const order = await findOrderByCode(code);

    if (!order) {
      return NextResponse.json(
        { ok: false, error: "لم يتم العثور على الطلب" },
        { status: 404 }
      );
    }

    const normalized = normalizeOrder(order);
    const existingReturn = await getExistingReturn(order.id);
    const pendingExchange = await findPendingExchangeForOriginalOrder(order.id);
    const eligibility = await getEligibility(order, pendingExchange, existingReturn);

    if (!eligibility.allowed) {
      return NextResponse.json(
        { ok: false, error: eligibility.reason || "هذا الطلب غير مؤهل للاسترجاع" },
        { status: 409 }
      );
    }

    // الاستبدال: هذا ليس "طلبًا مرتجعًا".
    // نعيد فقط القطعة القديمة المسجلة في عملية الاستبدال إلى المخزون.
    if (eligibility.kind === "exchange" && pendingExchange) {
      const exchangeItems = normalizeExchangeReturnItems(pendingExchange);

      for (const item of exchangeItems) {
        if (item.inventory_restored) continue;

        await restoreInventoryOnce(
          `exchange:${pendingExchange.id}:${item.id}`,
          item.variant_id,
          item.quantity,
          "exchange_return_restore",
          `استبدال - استلام القديم ${order.order_code} مقابل ${pendingExchange.order_code} - ${item.id}`
        );

        const { error: itemFlagError } = await supabaseAdmin
          .from("order_exchange_return_items")
          .update({
            inventory_restored: true,
            restored_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("inventory_restored", false);

        if (itemFlagError) throw new Error(itemFlagError.message);
      }

      const { error: exchangeFlagError } = await supabaseAdmin
        .from("orders")
        .update({ exchange_return_received: true })
        .eq("id", pendingExchange.id);

      if (exchangeFlagError) throw new Error(exchangeFlagError.message);

      await upsertReturnRecord(
        order,
        reason || `قطعة مستبدلة - مرتبطة بطلب الاستبدال ${pendingExchange.order_code}`
      );

      return NextResponse.json({
        ok: true,
        is_exchange_return: true,
        message: `هذه قطعة مستبدلة وليست طلبية مرتجعة. تم استلام القطعة القديمة للطلب ${order.order_code} وإعادتها إلى المخزون مرة واحدة فقط. طلب الاستبدال: ${pendingExchange.order_code}. لا توجد أي حركة مالية.`,
        order: normalized,
        exchange_order_code: pendingExchange.order_code,
        inventory_restored: true,
        financial_reversed: false,
      });
    }

    let selectedItems: any[] = [];

    if (eligibility.mode === "full") {
      selectedItems = normalized.items.map((item: any) => ({
        ...item,
        return_quantity: Number(item.quantity || 0),
      }));
    } else {
      const itemById = new Map<string, any>(
        normalized.items.map((item: any) => [String(item.id), item])
      );

      selectedItems = requestedReturnedItems
        .map((row: any) => {
          const item = itemById.get(String(row?.order_item_id || ""));
          const quantity = Math.floor(Number(row?.quantity || 0));

          if (!item || quantity <= 0) return null;
          if (quantity > Number(item.quantity || 0)) {
            throw new Error(
              `الكمية الراجعة للمنتج ${item.product_name} أكبر من كمية الطلب`
            );
          }

          return { ...item, return_quantity: quantity };
        })
        .filter(Boolean);

      if (selectedItems.length === 0) {
        throw new Error("حدد قطعة واحدة على الأقل من القطع الراجعة من المعيار");
      }
    }

    for (const item of selectedItems) {
      const quantity = Number(item.return_quantity || 0);

      await restoreInventoryOnce(
        `mayar:${order.id}:${item.id}`,
        item.variant_id,
        quantity,
        "order_return_restore",
        `${eligibility.mode === "partial" ? "تسليم جزئي معيار" : "مرتجع معيار"} - ${order.order_code} - ${item.id}`
      );
    }

    await upsertReturnRecord(
      order,
      reason ||
        (eligibility.mode === "partial"
          ? "رواجع تسليم جزئي من شركة المعيار"
          : "مرتجع كامل من شركة المعيار")
    );

    return NextResponse.json({
      ok: true,
      message:
        eligibility.mode === "partial"
          ? "تمت إعادة القطع المحددة من التسليم الجزئي إلى المخزون مرة واحدة فقط. لا توجد أي حركة مالية."
          : "تمت إعادة منتجات مرتجع المعيار إلى المخزون مرة واحدة فقط. لا توجد أي حركة مالية.",
      order: normalized,
      inventory_restored: true,
      financial_reversed: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "فشل تنفيذ الاسترجاع" },
      { status: 500 }
    );
  }
}
