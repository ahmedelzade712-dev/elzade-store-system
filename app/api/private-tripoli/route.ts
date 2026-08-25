import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function numberValue(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getSetting(key: string, fallback: number) {
  const { data, error } = await supabaseAdmin
    .from("financial_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();

  if (error) throw new Error(`خطأ في قراءة الإعداد المالي ${key}: ${error.message}`);
  const value = numberValue(data?.setting_value);
  return value > 0 ? value : fallback;
}

async function insertTransactionIfMissing(payload: any) {
  const { error } = await supabaseAdmin.from("financial_transactions").insert(payload);
  if (error && error.code !== "23505") {
    throw new Error("خطأ في تسجيل الحركة المالية: " + error.message);
  }
}

async function restoreStockOnce(
  order: any,
  item: any,
  quantity: number,
  movementType: string,
  reasonSuffix: string
) {
  const qty = Math.floor(numberValue(quantity));
  if (qty <= 0) return;
  if (qty > numberValue(item.quantity)) {
    throw new Error("الكمية الراجعة أكبر من كمية الطلب");
  }

  const reason = `${reasonSuffix} - ${order.order_code} - ${item.id}`;
  const { data: existingMovement, error: movementReadError } = await supabaseAdmin
    .from("inventory_movements")
    .select("id")
    .eq("variant_id", item.variant_id)
    .eq("movement_type", movementType)
    .eq("reason", reason)
    .maybeSingle();

  if (movementReadError) throw new Error(movementReadError.message);
  if (existingMovement) return;

  const { data: variant, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select("stock_quantity")
    .eq("id", item.variant_id)
    .single();

  if (variantError || !variant) {
    throw new Error("خطأ في قراءة المخزون: " + (variantError?.message || "المنتج غير موجود"));
  }

  const beforeQty = numberValue(variant.stock_quantity);
  const afterQty = beforeQty + qty;

  const { error: stockError } = await supabaseAdmin
    .from("product_variants")
    .update({ stock_quantity: afterQty })
    .eq("id", item.variant_id)
    .eq("stock_quantity", beforeQty);

  if (stockError) throw new Error("خطأ في إعادة المخزون: " + stockError.message);

  const { error: movementError } = await supabaseAdmin.from("inventory_movements").insert({
    variant_id: item.variant_id,
    movement_type: movementType,
    quantity_change: qty,
    quantity_before: beforeQty,
    quantity_after: afterQty,
    reason,
  });

  if (movementError) {
    throw new Error("تمت إعادة المخزون لكن فشل تسجيل حركة المخزون: " + movementError.message);
  }
}

async function recordFinancials(order: any, saleAmount: number, completionType: string) {
  const shippingFee = numberValue(order.shipping_fee);
  const courierReward = await getSetting("private_tripoli_courier_reward", 5);
  const standardShippingFee = await getSetting("private_tripoli_standard_shipping_fee", 15);
  const occurredAt = new Date().toISOString();

  const isExchangeOrder =
    String(order.mayar_parcel_type || "").trim() === "exchange" ||
    Boolean(order.exchange_original_order_id);

  if (isExchangeOrder) {
    const storePaysShipping = shippingFee === 0;

    if (storePaysShipping) {
      await insertTransactionIfMissing({
        store_id: order.store_id,
        order_id: order.id,
        transaction_type: "expense",
        direction: "debit",
        category: "رسوم التوصيل",
        amount: standardShippingFee,
        description: `خصم رسوم توصيل طلب الاستبدال ${order.order_code} من الرصيد`,
        source_key: `order:${order.id}:private_tripoli_exchange_shipping_fee`,
        is_system_generated: true,
        occurred_at: occurredAt,
        metadata: {
          order_code: order.order_code,
          shipping_company: "private_tripoli",
          order_type: "exchange",
          completion_type: completionType,
        },
      });

      if (courierReward > 0) {
        await insertTransactionIfMissing({
          store_id: order.store_id,
          order_id: order.id,
          transaction_type: "courier_reward",
          direction: "debit",
          category: "مكافآت المناديب",
          amount: courierReward,
          description: `مكافأة مندوب طلب الاستبدال ${order.order_code}`,
          source_key: `order:${order.id}:private_tripoli_exchange_courier_reward`,
          is_system_generated: true,
          occurred_at: occurredAt,
          metadata: {
            order_code: order.order_code,
            shipping_company: "private_tripoli",
            order_type: "exchange",
            completion_type: completionType,
          },
        });
      }
    }

    return;
  }

  if (saleAmount <= 0) throw new Error("قيمة البيع يجب أن تكون أكبر من صفر");

  await insertTransactionIfMissing({
    store_id: order.store_id,
    order_id: order.id,
    transaction_type: "sale",
    direction: "credit",
    category: "مبيعات",
    amount: saleAmount,
    description: `إضافة قيمة طلب طرابلس خاصة ${order.order_code} إلى الرصيد`,
    source_key: `order:${order.id}:private_tripoli_sale`,
    is_system_generated: true,
    occurred_at: occurredAt,
    metadata: {
      order_code: order.order_code,
      shipping_company: "private_tripoli",
      completion_type: completionType,
      final_sale_amount: saleAmount,
      shipping_fee: shippingFee,
    },
  });

  const storePaysShipping = shippingFee === 0;
  if (storePaysShipping) {
    await insertTransactionIfMissing({
      store_id: order.store_id,
      order_id: order.id,
      transaction_type: "expense",
      direction: "debit",
      category: "رسوم التوصيل",
      amount: standardShippingFee,
      description: `خصم رسوم توصيل الطلب ${order.order_code} من الرصيد`,
      source_key: `order:${order.id}:private_tripoli_shipping_fee`,
      is_system_generated: true,
      occurred_at: occurredAt,
      metadata: {
        order_code: order.order_code,
        shipping_company: "private_tripoli",
        completion_type: completionType,
      },
    });
  }

  const rewardApplied =
    courierReward > 0 && (shippingFee === 0 || shippingFee === standardShippingFee);

  if (rewardApplied) {
    await insertTransactionIfMissing({
      store_id: order.store_id,
      order_id: order.id,
      transaction_type: "courier_reward",
      direction: "debit",
      category: "مكافآت المناديب",
      amount: courierReward,
      description: `مكافأة مندوب الطلب ${order.order_code}`,
      source_key: `order:${order.id}:private_tripoli_courier_reward`,
      is_system_generated: true,
      occurred_at: occurredAt,
      metadata: {
        order_code: order.order_code,
        shipping_company: "private_tripoli",
        completion_type: completionType,
        shipping_fee: shippingFee,
      },
    });
  }
}

async function getOrder(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      id,
      order_code,
      store_id,
      status,
      total_amount,
      total_cost,
      shipping_fee,
      notes,
      is_trial_order,
      trial_status,
      mayar_parcel_type,
      exchange_original_order_id,
      stores(id, name),
      customers(
        id,
        name,
        phone,
        phone2,
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
        trial_group_key,
        trial_kept,
        product_variants(
          id,
          color,
          size,
          image_url,
          products(id, name, model, main_image_url)
        )
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) throw new Error("الطلب غير موجود: " + (error?.message || ""));
  return data;
}

function cityNameOf(order: any) {
  const customer = asOne(order.customers);
  const city = asOne(customer?.cities);
  return String(city?.name || "").trim();
}

function normalizeOrder(order: any) {
  const customer = asOne(order.customers);
  const city = asOne(customer?.cities);
  const area = asOne(customer?.areas);
  const store = asOne(order.stores);

  return {
    id: order.id,
    order_code: order.order_code,
    store_id: order.store_id,
    store_name: store?.name || "-",
    status: order.status,
    total_amount: numberValue(order.total_amount),
    total_cost: numberValue(order.total_cost),
    shipping_fee: numberValue(order.shipping_fee),
    notes: order.notes || "",
    is_selection_order: Boolean(order.is_trial_order),
    is_exchange_order:
      String(order.mayar_parcel_type || "").trim() === "exchange" ||
      Boolean(order.exchange_original_order_id),
    customer: {
      name: customer?.name || "-",
      phone: customer?.phone || "-",
      phone2: customer?.phone2 || "",
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
        quantity: numberValue(item.quantity),
        unit_price: numberValue(item.unit_price),
        unit_cost: numberValue(item.unit_cost),
        trial_group_key: item.trial_group_key || null,
        trial_kept: Boolean(item.trial_kept),
        product_name: product?.name || "-",
        model: product?.model || "-",
        color: variant?.color || "-",
        size: variant?.size || "-",
        image_url: variant?.image_url || product?.main_image_url || "",
      };
    }),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = String(searchParams.get("store_id") || "").trim();

    let query = supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_code,
        store_id,
        status,
        total_amount,
        total_cost,
        shipping_fee,
        notes,
        is_trial_order,
        trial_status,
        mayar_parcel_type,
        exchange_original_order_id,
        created_at,
        stores(id, name),
        customers(id, name, phone, phone2, address, cities(name), areas(name)),
        order_items(
          id,
          variant_id,
          quantity,
          unit_price,
          unit_cost,
          trial_group_key,
          trial_kept,
          product_variants(id, color, size, image_url, products(id, name, model, main_image_url))
        )
      `)
      .eq("status", "shipped")
      .order("created_at", { ascending: false });

    if (storeId) query = query.eq("store_id", storeId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const privateTripoliOrders = (data || [])
      .filter((order: any) => cityNameOf(order) === "طرابلس (خاصة)")
      .map(normalizeOrder);

    return NextResponse.json({ ok: true, orders: privateTripoliOrders });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "فشل تحميل طلبات طرابلس خاصة" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = String(body?.order_id || "").trim();
    const action = String(body?.action || "").trim();

    if (!orderId) throw new Error("رقم الطلب مطلوب");
    if (!['delivered', 'partial', 'returned', 'selection'].includes(action)) {
      throw new Error("الحالة المطلوبة غير صحيحة");
    }

    const order: any = await getOrder(orderId);

    if (cityNameOf(order) !== "طرابلس (خاصة)") {
      throw new Error("هذا الطلب ليس من طرابلس خاصة");
    }

    if (order.status !== "shipped") {
      throw new Error("يمكن إنهاء الطلب فقط عندما تكون حالته جاري الشحن");
    }

    const items = (order.order_items || []).map((item: any) => ({
      ...item,
      quantity: numberValue(item.quantity),
      unit_price: numberValue(item.unit_price),
      unit_cost: numberValue(item.unit_cost),
    }));

    const isSelectionOrder = Boolean(order.is_trial_order);
    const isExchangeOrder =
      String(order.mayar_parcel_type || "").trim() === "exchange" ||
      Boolean(order.exchange_original_order_id);

    if (action === "selection" && !isSelectionOrder) {
      throw new Error("هذا الطلب ليس طلب اختيار");
    }

    if (isSelectionOrder && action !== "selection" && action !== "returned") {
      throw new Error("طلب الاختيار يجب تحديد القطع التي أخذها الزبون أو اعتباره مرتجعًا");
    }

    if (isExchangeOrder && (action === "partial" || action === "selection")) {
      throw new Error("التسليم الجزئي غير متاح لطلب الاستبدال");
    }

    if (action === "returned") {
      for (const item of items) {
        await restoreStockOnce(order, item, item.quantity, "private_tripoli_return", "مرتجع طرابلس خاصة");
      }

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          status: "returned",
          trial_status: isSelectionOrder ? "closed" : order.trial_status,
          trial_closed_at: isSelectionOrder ? new Date().toISOString() : null,
        })
        .eq("id", order.id)
        .eq("status", "shipped");

      if (updateError) throw new Error("فشل تحديث حالة الطلب: " + updateError.message);

      return NextResponse.json({
        ok: true,
        message: `تم تحويل الطلب ${order.order_code} إلى مرتجع وإرجاع المنتجات للمخزون بدون أي حركة مالية.`,
      });
    }

    if (action === "delivered") {
      const saleAmount = isExchangeOrder ? 0 : numberValue(order.total_amount);
      await recordFinancials(order, saleAmount, "delivered");

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", order.id)
        .eq("status", "shipped");

      if (updateError) throw new Error("فشل تحديث حالة الطلب: " + updateError.message);

      return NextResponse.json({ ok: true, message: `تم تسجيل الطلب ${order.order_code} كتم التسليم.` });
    }

    if (action === "partial") {
      const receivedAmount = numberValue(body?.received_amount);
      const returnedItems = Array.isArray(body?.returned_items) ? body.returned_items : [];

      if (receivedAmount <= 0) throw new Error("أدخل القيمة التي تم تحصيلها من الزبون");
      if (returnedItems.length === 0) throw new Error("حدد القطع التي رجعت إلى المخزن");

      const requested = new Map<string, number>();
      for (const row of returnedItems) {
        const itemId = String(row?.order_item_id || "");
        const qty = Math.floor(numberValue(row?.quantity));
        if (itemId && qty > 0) requested.set(itemId, qty);
      }

      let returnedQtyTotal = 0;
      let keptQtyTotal = 0;
      let keptCost = 0;

      for (const item of items) {
        const returnQty = requested.get(String(item.id)) || 0;
        if (returnQty > item.quantity) {
          throw new Error(`الكمية الراجعة أكبر من كمية الطلب للمنتج ${item.id}`);
        }
        returnedQtyTotal += returnQty;
        const keptQty = item.quantity - returnQty;
        keptQtyTotal += keptQty;
        keptCost += keptQty * item.unit_cost;
      }

      if (returnedQtyTotal <= 0) throw new Error("حدد قطعة واحدة على الأقل للرجوع");
      if (keptQtyTotal <= 0) throw new Error("إذا رجعت كل القطع استخدم حالة مرتجع بدل تسليم جزئي");

      for (const item of items) {
        const returnQty = requested.get(String(item.id)) || 0;
        if (returnQty > 0) {
          await restoreStockOnce(order, item, returnQty, "private_tripoli_partial_return", "تسليم جزئي طرابلس خاصة");
        }
      }

      await recordFinancials(order, receivedAmount, "partial_delivered");

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
          status: "partial_delivered",
          total_amount: receivedAmount,
          total_cost: keptCost,
        })
        .eq("id", order.id)
        .eq("status", "shipped");

      if (updateError) throw new Error("فشل تحديث حالة الطلب: " + updateError.message);

      return NextResponse.json({
        ok: true,
        message: `تم تسجيل التسليم الجزئي للطلب ${order.order_code} بقيمة ${receivedAmount} د.ل وإرجاع القطع المحددة للمخزون.`,
      });
    }

    // action === selection
    const keptItems = Array.isArray(body?.kept_items) ? body.kept_items : [];
    const keptMap = new Map<string, number>();
    for (const row of keptItems) {
      const itemId = String(row?.order_item_id || "");
      const qty = Math.floor(numberValue(row?.quantity));
      if (itemId && qty > 0) keptMap.set(itemId, qty);
    }

    let keptQtyTotal = 0;
    let saleAmount = 0;
    let keptCost = 0;

    for (const item of items) {
      const keptQty = keptMap.get(String(item.id)) || 0;
      if (keptQty > item.quantity) {
        throw new Error("الكمية المختارة أكبر من كمية الطلب");
      }
      keptQtyTotal += keptQty;
      saleAmount += keptQty * item.unit_price;
      keptCost += keptQty * item.unit_cost;
    }

    if (keptQtyTotal <= 0) throw new Error("حدد قطعة واحدة على الأقل أخذها الزبون");

    for (const item of items) {
      const keptQty = keptMap.get(String(item.id)) || 0;
      const returnQty = item.quantity - keptQty;

      const { error: keptFlagError } = await supabaseAdmin
        .from("order_items")
        .update({ trial_kept: keptQty > 0 })
        .eq("id", item.id);
      if (keptFlagError) throw new Error("فشل تحديث قطعة الاختيار: " + keptFlagError.message);

      if (returnQty > 0) {
        await restoreStockOnce(order, item, returnQty, "private_tripoli_selection_return", "إرجاع طلب اختيار طرابلس خاصة");
      }
    }

    await recordFinancials(order, saleAmount, "selection_delivered");

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        total_amount: saleAmount,
        total_cost: keptCost,
        trial_status: "closed",
        trial_closed_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "shipped");

    if (updateError) throw new Error("فشل تحديث حالة الطلب: " + updateError.message);

    return NextResponse.json({
      ok: true,
      message: `تم إنهاء طلب الاختيار ${order.order_code}. تم تسجيل ${saleAmount} د.ل وإرجاع باقي القطع للمخزون.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "فشل تحديث طلب طرابلس خاصة" },
      { status: 500 }
    );
  }
}
