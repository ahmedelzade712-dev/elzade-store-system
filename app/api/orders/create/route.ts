import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function getStoreLetter(storeName: string) {
  const normalized = storeName.toLowerCase();

  if (normalized.includes("adora")) return "A";
  if (normalized.includes("aban")) return "B";
  if (normalized.includes("diana")) return "D";

  return storeName.trim().charAt(0).toUpperCase() || "X";
}

async function generateOrderCode(storeId: string) {
  const { data: store, error: storeError } = await supabaseAdmin
    .from("stores")
    .select("id, name")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    throw new Error("المتجر غير موجود");
  }

  const prefix = getStoreLetter(store.name || "");

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("orders")
    .select("order_code")
    .ilike("order_code", `${prefix}%`);

  if (ordersError) throw new Error(ordersError.message);

  const maxNumber = (orders || []).reduce((max: number, order: any) => {
    const match = String(order.order_code || "").match(
      new RegExp(`^${prefix}(\\d+)$`)
    );

    if (!match) return max;
    return Math.max(max, Number(match[1] || 0));
  }, 0);

  const nextNumber = maxNumber + 1;
  const padded =
    nextNumber < 1000
      ? String(nextNumber).padStart(3, "0")
      : String(nextNumber);

  return `${prefix}${padded}`;
}

type StockRollback = {
  variantId: string;
  beforeQty: number;
};

type NormalizedCartItem = {
  variantId: string;
  quantity: number;
  salePrice: number;
  costPrice: number;
  productName: string;
  color: string;
  size: string;
  productId: string;
};

type ExchangeReturnRow = {
  original_order_id: string;
  original_order_item_id: string;
  variant_id: string;
  quantity: number;
  inventory_restored: boolean;
};

export async function POST(request: Request) {
  let createdCustomerId: string | null = null;
  let createdOrderId: string | null = null;
  const stockRollbacks: StockRollback[] = [];
  const createdMovementIds: string[] = [];

  try {
    const body = await request.json();

    const customerName = asText(body.customerName) || "بدون اسم";
    const phone = asText(body.phone).replace(/\D/g, "");
    const phone2 = asText(body.phone2) || null;
    const cityId = asText(body.cityId);
    const areaId = asText(body.areaId);
    const address = asText(body.address);
    const metaLink = asText(body.metaLink) || null;
    const whatsappLink = asText(body.whatsappLink) || null;
    const storeId = asText(body.storeId);
    const notes = asText(body.notes);
    const createdBy = asText(body.createdBy);
    const isScheduled = Boolean(body.isScheduled);
    const scheduledFor = asText(body.scheduledFor) || null;
    const isTrialOrder = Boolean(body.isTrialOrder);
    const isSelectionOrder = Boolean(body.isSelectionOrder);
    const selectionIntendedQuantity = isSelectionOrder
      ? Math.max(1, Math.trunc(asNumber(body.selectionIntendedQuantity, 1)))
      : 0;
    const shippingPayer =
      body.shippingPayer === "store" ? "store" : "customer";
    const shippingFee = Math.max(0, asNumber(body.shippingFee));
    const mayarParcelType =
      body.mayarParcelType === "exchange" ? "exchange" : "full_delivery";
    const mayarSentPiecesCount = Math.max(
      1,
      Math.trunc(asNumber(body.mayarSentPiecesCount, 1))
    );
    const mayarReturnPiecesCount = Math.max(
      0,
      Math.trunc(asNumber(body.mayarReturnPiecesCount, 0))
    );
    const mayarOpenable = Boolean(body.mayarOpenable);
    const mayarShippingIncluded = Boolean(body.mayarShippingIncluded);
    const mayarShippingAmount = mayarShippingIncluded
      ? Math.max(0, asNumber(body.mayarShippingAmount))
      : 0;
    const exchangeOriginalOrderId = asText(body.exchangeOriginalOrderId) || null;
    const exchangeReturnSelections =
      body.exchangeReturnSelections &&
      typeof body.exchangeReturnSelections === "object"
        ? body.exchangeReturnSelections
        : {};
    const cart = Array.isArray(body.cart) ? body.cart : [];

    if (!/^09\d{8}$/.test(phone)) {
      throw new Error("رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09");
    }

    if (!storeId || !cityId || !areaId || !createdBy) {
      throw new Error("بيانات الطلب الأساسية غير مكتملة");
    }

    if (cart.length === 0) {
      throw new Error("يجب إضافة منتج واحد على الأقل إلى الطلب");
    }

    const { data: destination, error: destinationError } = await supabaseAdmin
      .from("areas")
      .select(`
        id,
        city_id,
        mayar_subzone_id,
        is_active,
        cities(id, name, mayar_zone_id)
      `)
      .eq("id", areaId)
      .single();

    if (destinationError || !destination) {
      throw new Error("المنطقة المختارة غير موجودة");
    }

    if (destination.city_id !== cityId || destination.is_active === false) {
      throw new Error("المنطقة المختارة لا تتبع المدينة الحالية");
    }

    const city = Array.isArray(destination.cities)
      ? destination.cities[0]
      : destination.cities;
    const isPrivateTripoli = city?.name === "طرابلس (خاصة)";
    const isMayar = !isPrivateTripoli;

    if (isMayar && (!city?.mayar_zone_id || !destination.mayar_subzone_id)) {
      throw new Error("المدينة أو المنطقة غير مرتبطة ببيانات المعيار");
    }

    if (isMayar && mayarShippingIncluded && mayarShippingAmount <= 0) {
      throw new Error("يجب إدخال قيمة الشحن عند اختيار السعر شامل الشحن");
    }

    if (isTrialOrder && !isPrivateTripoli) {
      throw new Error("طلب التجربة مسموح فقط لطرابلس الخاصة");
    }

    if (isSelectionOrder && !isPrivateTripoli) {
      throw new Error("طلب الاختيار مسموح فقط لطرابلس الخاصة");
    }

    const { data: duplicateOrders, error: duplicateError } = await supabaseAdmin
      .from("orders")
      .select("id, order_code, customers!inner(phone)")
      .eq("customers.phone", phone)
      .eq("status", "new")
      .limit(1);

    if (duplicateError) {
      throw new Error("فشل فحص الطلبات المكررة: " + duplicateError.message);
    }

    if (duplicateOrders && duplicateOrders.length > 0) {
      throw new Error(
        `هذا الرقم لديه طلب جديد سابق: ${duplicateOrders[0].order_code}`
      );
    }

    const normalizedCart: NormalizedCartItem[] = cart.map((item: any): NormalizedCartItem => ({
      variantId: asText(item.variant_id),
      quantity: Math.trunc(asNumber(item.quantity)),
      salePrice: Math.max(0, asNumber(item.sale_price)),
      costPrice: Math.max(0, asNumber(item.cost_price)),
      productName: asText(item.product_name),
      color: asText(item.color),
      size: asText(item.size),
      productId: asText(item.product_id),
    }));

    for (const item of normalizedCart) {
      if (!item.variantId || item.quantity < 1) {
        throw new Error("توجد قطعة بكمية أو معرّف غير صحيح");
      }
    }

    const sentItemsQuantity = normalizedCart.reduce(
      (sum: number, item: NormalizedCartItem) => sum + item.quantity,
      0
    );

    if (
      isSelectionOrder &&
      (selectionIntendedQuantity < 1 ||
        selectionIntendedQuantity > sentItemsQuantity)
    ) {
      throw new Error(
        `عدد القطع المتوقع شراؤها (${selectionIntendedQuantity}) يجب أن يكون بين 1 وعدد القطع المرسلة (${sentItemsQuantity})`
      );
    }

    const uniqueVariantIds = [...new Set(normalizedCart.map((item: NormalizedCartItem) => item.variantId))];

    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select(`
        id,
        store_id,
        product_id,
        stock_quantity,
        cost_price,
        sale_price,
        color,
        size,
        is_active,
        products(name, model)
      `)
      .in("id", uniqueVariantIds);

    if (variantsError) {
      throw new Error("فشل قراءة المخزون: " + variantsError.message);
    }

    const variantMap = new Map<string, any>(
      (variants || []).map((variant: any): [string, any] => [variant.id, variant])
    );

    for (const item of normalizedCart) {
      const variant = variantMap.get(item.variantId);

      if (!variant || variant.is_active === false) {
        throw new Error(`القطعة ${item.productName || item.variantId} غير متاحة`);
      }

      if (variant.store_id !== storeId) {
        throw new Error("توجد قطعة لا تتبع المتجر المحدد");
      }

      if (asNumber(variant.stock_quantity) < item.quantity) {
        throw new Error(
          `الكمية غير كافية للمنتج ${item.productName} / ${item.color} / ${item.size}. المتوفر الآن: ${variant.stock_quantity}`
        );
      }
    }

    let exchangeRows: ExchangeReturnRow[] = [];

    if (mayarParcelType === "exchange") {
      if (!exchangeOriginalOrderId) {
        throw new Error("يجب اختيار الطلب الأصلي للاستبدال");
      }

      const { data: originalOrder, error: originalOrderError } =
        await supabaseAdmin
          .from("orders")
          .select(`
            id,
            order_code,
            status,
            store_id,
            order_items(id, variant_id, quantity)
          `)
          .eq("id", exchangeOriginalOrderId)
          .single();

      if (originalOrderError || !originalOrder) {
        throw new Error("الطلب الأصلي غير موجود");
      }

      if (originalOrder.store_id !== storeId) {
        throw new Error("الطلب الأصلي يتبع متجرًا مختلفًا");
      }

      if (originalOrder.status !== "delivered") {
        throw new Error("الطلب الأصلي يجب أن يكون تم تسليمه");
      }

      const { data: openExchange, error: openExchangeError } =
        await supabaseAdmin
          .from("orders")
          .select("id, order_code")
          .eq("exchange_original_order_id", originalOrder.id)
          .eq("mayar_parcel_type", "exchange")
          .eq("exchange_return_received", false)
          .maybeSingle();

      if (openExchangeError) {
        throw new Error("فشل فحص الاستبدال السابق: " + openExchangeError.message);
      }

      if (openExchange) {
        throw new Error(
          `هذا الطلب مرتبط بالفعل باستبدال مفتوح: ${openExchange.order_code}`
        );
      }

      exchangeRows = (originalOrder.order_items || [])
        .map((originalItem: any) => {
          const selectedQty = Math.trunc(
            asNumber(exchangeReturnSelections[originalItem.id])
          );

          if (selectedQty < 1) return null;

          if (selectedQty > asNumber(originalItem.quantity)) {
            throw new Error("الكمية الراجعة أكبر من الكمية الأصلية");
          }

          return {
            original_order_id: originalOrder.id,
            original_order_item_id: originalItem.id,
            variant_id: originalItem.variant_id,
            quantity: selectedQty,
            inventory_restored: false,
          };
        })
        .filter((row: ExchangeReturnRow | null): row is ExchangeReturnRow => row !== null);

      const selectedReturnQuantity = exchangeRows.reduce(
        (sum: number, row: ExchangeReturnRow) => sum + asNumber(row.quantity),
        0
      );

      if (selectedReturnQuantity < 1) {
        throw new Error("اختر قطعة واحدة على الأقل ستعود من الطلب الأصلي");
      }

      if (isMayar && selectedReturnQuantity !== mayarReturnPiecesCount) {
        throw new Error(
          `عدد القطع المختارة (${selectedReturnQuantity}) لا يساوي عدد القطع المسترجعة (${mayarReturnPiecesCount})`
        );
      }

      const sentCount = normalizedCart.reduce(
        (sum: number, item: NormalizedCartItem) => sum + item.quantity,
        0
      );

      if (isMayar && sentCount !== mayarSentPiecesCount) {
        throw new Error(
          `عدد القطع الجديدة في الطلب (${sentCount}) لا يساوي عدد القطع المرسلة للمعيار (${mayarSentPiecesCount})`
        );
      }
    }

    function calculateGroupedTrialTotal(field: "salePrice" | "costPrice") {
      const groups = new Map<string, number>();

      for (const item of normalizedCart) {
        const groupKey = `${item.productId}-${item.color}`;
        const current = groups.get(groupKey) || 0;
        groups.set(groupKey, Math.max(current, item[field]));
      }

      return Array.from(groups.values()).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    }

    function calculateSelectionTotal(
      field: "salePrice" | "costPrice",
      requiredQuantity: number
    ) {
      let remainingQuantity = Math.max(0, requiredQuantity);
      let total = 0;

      for (const item of normalizedCart) {
        if (remainingQuantity <= 0) break;
        const countedQuantity = Math.min(item.quantity, remainingQuantity);
        total += countedQuantity * item[field];
        remainingQuantity -= countedQuantity;
      }

      return total;
    }

    const totalAmount =
      isSelectionOrder && isPrivateTripoli
        ? calculateSelectionTotal("salePrice", selectionIntendedQuantity)
        : isTrialOrder && isPrivateTripoli
          ? calculateGroupedTrialTotal("salePrice")
          : normalizedCart.reduce(
            (sum: number, item: NormalizedCartItem) =>
              sum + item.quantity * item.salePrice,
            0
          );

    const totalCost =
      isSelectionOrder && isPrivateTripoli
        ? calculateSelectionTotal("costPrice", selectionIntendedQuantity)
        : isTrialOrder && isPrivateTripoli
          ? calculateGroupedTrialTotal("costPrice")
          : normalizedCart.reduce(
            (sum: number, item: NormalizedCartItem) =>
              sum + item.quantity * item.costPrice,
            0
          );

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .insert({
        name: customerName,
        phone,
        phone2,
        city_id: cityId,
        area_id: areaId,
        address,
        meta_link: metaLink,
        whatsapp_link: whatsappLink,
      })
      .select("id")
      .single();

    if (customerError || !customer) {
      throw new Error("خطأ في حفظ العميل: " + customerError?.message);
    }

    createdCustomerId = customer.id;

    const isExchange = mayarParcelType === "exchange";

    /*
      منطق شحن استبدال طرابلس الخاصة:

      - الزبونة تتحمل الشحن:
        نحفظ قيمة الشحن داخل shipping_fee حتى تظهر على البوليصة.
        لا تخصم أي قيمة من رصيد المتجر.

      - المتجر يتحمل الشحن:
        نحفظ shipping_fee = 0 حتى تظهر البوليصة بقيمة صفر.
        ملف المالية يخصم 15 د.ل رسوم توصيل و5 د.ل مكافأة مندوب.
    */
    const exchangeShippingFee =
      isExchange && isPrivateTripoli
        ? shippingPayer === "customer"
          ? shippingFee
          : 0
        : 0;

    const exchangeStoreShippingFee =
      isExchange && isPrivateTripoli && shippingPayer === "store"
        ? 15
        : 0;

    const exchangeCourierReward =
      isExchange && isPrivateTripoli && shippingPayer === "store"
        ? 5
        : 0;

    let orderCode = "";
    let order: any = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      orderCode = await generateOrderCode(storeId);

      const result = await supabaseAdmin
        .from("orders")
        .insert({
          store_id: storeId,
          customer_id: customer.id,
          order_code: orderCode,
          status: "new",
          is_trial_order:
            (isTrialOrder || isSelectionOrder) && isPrivateTripoli,
          trial_status:
            (isTrialOrder || isSelectionOrder) && isPrivateTripoli
              ? "open"
              : null,
          trial_due_at:
            (isTrialOrder || isSelectionOrder) && isPrivateTripoli
              ? new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
              : null,
          total_amount: isExchange ? 0 : totalAmount,
          total_cost: isExchange ? 0 : totalCost,
          shipping_fee: isExchange
            ? exchangeShippingFee
            : isPrivateTripoli
              ? shippingFee
              : 0,
          mayar_parcel_type: mayarParcelType,
          mayar_sent_pieces_count: isMayar ? mayarSentPiecesCount : 1,
          mayar_return_pieces_count:
            isMayar && mayarParcelType === "exchange"
              ? mayarReturnPiecesCount
              : 0,
          mayar_openable: isMayar ? mayarOpenable : true,
          mayar_shipping_included: isMayar ? mayarShippingIncluded : false,
          mayar_shipping_amount:
            isMayar && mayarShippingIncluded ? mayarShippingAmount : 0,
          exchange_original_order_id: isExchange
            ? exchangeOriginalOrderId
            : null,
          exchange_return_received: false,
          scheduled_for: isScheduled ? scheduledFor : null,
          notes: isSelectionOrder
            ? [notes, `[طلب اختيار] العدد المتوقع شراؤه: ${selectionIntendedQuantity}`]
                .filter(Boolean)
                .join(" - ")
            : notes,
          created_by: createdBy,
        })
        .select("id, order_code")
        .single();

      if (!result.error && result.data) {
        order = result.data;
        break;
      }

      if (result.error?.code !== "23505") {
        throw new Error("خطأ في حفظ الطلب: " + result.error?.message);
      }
    }

    if (!order) {
      throw new Error("تعذر إنشاء كود فريد للطلب. أعد المحاولة");
    }

    createdOrderId = order.id;

    const orderItemsPayload = normalizedCart.map((item: NormalizedCartItem) => ({
      order_id: order.id,
      variant_id: item.variantId,
      quantity: item.quantity,
      unit_price: isExchange ? 0 : item.salePrice,
      unit_cost: item.costPrice,
      is_trial_item:
        (isTrialOrder || isSelectionOrder) && isPrivateTripoli,
      trial_group_key:
        (isTrialOrder || isSelectionOrder) && isPrivateTripoli
          ? `${item.productId}-${item.color}`
          : null,
      trial_kept: false,
    }));

    const { error: orderItemsError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItemsPayload);

    if (orderItemsError) {
      throw new Error("فشل حفظ منتجات الطلب: " + orderItemsError.message);
    }

    // نسجل القطع القديمة قبل خصم الجديدة. باستخدام supabaseAdmin لا تخضع العملية لـ RLS.
    if (exchangeRows.length > 0) {
      const rowsWithExchangeOrder = exchangeRows.map((row: ExchangeReturnRow) => ({
        ...row,
        exchange_order_id: order.id,
      }));

      const { error: exchangeItemsError } = await supabaseAdmin
        .from("order_exchange_return_items")
        .insert(rowsWithExchangeOrder);

      if (exchangeItemsError) {
        throw new Error(
          "فشل حفظ بيانات القطع الراجعة: " + exchangeItemsError.message
        );
      }
    }

    for (const item of normalizedCart) {
      const { data: freshVariant, error: freshVariantError } =
        await supabaseAdmin
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", item.variantId)
          .single();

      if (freshVariantError || !freshVariant) {
        throw new Error("فشل قراءة المخزون الحالي: " + freshVariantError?.message);
      }

      const beforeQty = asNumber(freshVariant.stock_quantity);
      const afterQty = beforeQty - item.quantity;

      if (afterQty < 0) {
        throw new Error(
          `الكمية أصبحت غير كافية للمنتج ${item.productName} / ${item.color} / ${item.size}`
        );
      }

      const { error: stockError } = await supabaseAdmin
        .from("product_variants")
        .update({ stock_quantity: afterQty })
        .eq("id", item.variantId)
        .eq("stock_quantity", beforeQty);

      if (stockError) {
        throw new Error("فشل خصم المخزون: " + stockError.message);
      }

      stockRollbacks.push({ variantId: item.variantId, beforeQty });

      const { data: movement, error: movementError } = await supabaseAdmin
        .from("inventory_movements")
        .insert({
          variant_id: item.variantId,
          movement_type: isExchange
            ? "exchange_new_item"
            : isSelectionOrder
              ? "selection_send"
              : "sale",
          quantity_change: -item.quantity,
          quantity_before: beforeQty,
          quantity_after: afterQty,
          reason: isExchange
            ? `استبدال - إرسال الجديد ${order.order_code}`
            : isSelectionOrder
              ? `طلب اختيار - إرسال ${sentItemsQuantity} والمتوقع شراء ${selectionIntendedQuantity} - ${order.order_code}`
              : `بيع - ${order.order_code}`,
        })
        .select("id")
        .single();

      if (movementError || !movement) {
        throw new Error("فشل تسجيل حركة المخزون: " + movementError?.message);
      }

      createdMovementIds.push(movement.id);
    }

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        order_code: order.order_code,
      },
      is_mayar: isMayar,
      is_exchange: isExchange,
      is_selection_order: isSelectionOrder,
      selection_intended_quantity: isSelectionOrder
        ? selectionIntendedQuantity
        : null,
      shipping_payer: isExchange ? shippingPayer : null,
      exchange_shipping_deduction: exchangeStoreShippingFee,
      exchange_courier_reward_deduction: exchangeCourierReward,
      mayar_shipping_included: isMayar ? mayarShippingIncluded : false,
      mayar_shipping_amount:
        isMayar && mayarShippingIncluded ? mayarShippingAmount : 0,
      deducted_items_count: normalizedCart.reduce(
        (sum: number, item: NormalizedCartItem) => sum + item.quantity,
        0
      ),
    });
  } catch (error: any) {
    // تعويض أي خصم مخزون تم قبل حدوث الخطأ.
    for (const rollback of [...stockRollbacks].reverse()) {
      await supabaseAdmin
        .from("product_variants")
        .update({ stock_quantity: rollback.beforeQty })
        .eq("id", rollback.variantId);
    }

    if (createdMovementIds.length > 0) {
      await supabaseAdmin
        .from("inventory_movements")
        .delete()
        .in("id", createdMovementIds);
    }

    if (createdOrderId) {
      await supabaseAdmin.from("orders").delete().eq("id", createdOrderId);
    }

    if (createdCustomerId) {
      await supabaseAdmin.from("customers").delete().eq("id", createdCustomerId);
    }

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "فشل حفظ الطلب",
      },
      { status: 500 }
    );
  }
}
