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
      `order_code.eq.${code},mayar_code.eq.${code},mayar_shipment_code.eq.${code}`
    )
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function insertFinancialReversalIfMissing(transaction: any, order: any) {
  const sourceKey = `return:${order.id}:reverse:${transaction.id}`;

  const { error } = await supabaseAdmin
    .from("financial_transactions")
    .insert({
      store_id: order.store_id,
      order_id: order.id,
      transaction_type: "return",
      direction: transaction.direction === "credit" ? "debit" : "credit",
      category:
        transaction.transaction_type === "courier_reward"
          ? "استرجاع مكافأة المندوب"
          : `عكس ${transaction.category || "حركة مالية"}`,
      amount: Number(transaction.amount || 0),
      description:
        transaction.transaction_type === "courier_reward"
          ? `إعادة مكافأة مندوب الطلب ${order.order_code} إلى الرصيد`
          : `عكس الأثر المالي للطلب ${order.order_code}`,
      source_key: sourceKey,
      is_system_generated: true,
      reversed_transaction_id: transaction.id,
      occurred_at: new Date().toISOString(),
      metadata: {
        order_code: order.order_code,
        original_transaction_id: transaction.id,
        original_source_key: transaction.source_key,
      },
    });

  if (error && error.code !== "23505") {
    throw new Error("خطأ في عكس الحركة المالية: " + error.message);
  }
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = String(searchParams.get("code") || "").trim();

    if (!code) {
      throw new Error("أدخل كود الطلب أو كود المعيار");
    }

    const order = await findOrderByCode(code);

    if (!order) {
      return NextResponse.json(
        {
          ok: false,
          error: "لم يتم العثور على الطلب",
        },
        { status: 404 }
      );
    }

    const { data: existingReturn, error: returnError } = await supabaseAdmin
      .from("order_returns")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();

    if (returnError) {
      throw new Error(returnError.message);
    }

    const pendingExchange = await findPendingExchangeForOriginalOrder(order.id);
    const isExchangeReturn = Boolean(pendingExchange);

    return NextResponse.json({
      ok: true,
      order: normalizeOrder(order),
      is_exchange_return: isExchangeReturn,
      exchange_order: pendingExchange
        ? {
            id: pendingExchange.id,
            order_code: pendingExchange.order_code,
            items: normalizeExchangeReturnItems(pendingExchange),
          }
        : null,
      already_returned: isExchangeReturn
        ? false
        : Boolean(existingReturn?.inventory_restored) &&
          Boolean(existingReturn?.financial_reversed),
      return_record: existingReturn || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "فشل البحث عن الطلب",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body?.code || "").trim();
    const reason = String(body?.reason || "").trim();

    if (!code) {
      throw new Error("أدخل كود الطلب أو كود المعيار");
    }

    const order = await findOrderByCode(code);

    if (!order) {
      return NextResponse.json(
        {
          ok: false,
          error: "لم يتم العثور على الطلب",
        },
        { status: 404 }
      );
    }

    const normalized = normalizeOrder(order);
    const pendingExchange = await findPendingExchangeForOriginalOrder(order.id);

    // الطلب الأصلي تم بيعه بنجاح، والقطعة وصلت الآن كجزء من عملية استبدال.
    // نعيد فقط القطعة القديمة المحددة إلى المخزون، ولا نعكس أي حركة مالية.
    if (pendingExchange) {
      const exchangeItems = normalizeExchangeReturnItems(pendingExchange);

      if (exchangeItems.length === 0) {
        throw new Error("عملية الاستبدال لا تحتوي على قطع راجعة مسجلة");
      }

      for (const item of exchangeItems) {
        if (item.inventory_restored) continue;

        const movementReason = `استبدال - استلام القديم ${order.order_code} مقابل ${pendingExchange.order_code}`;

        const { data: existingMovement, error: movementReadError } =
          await supabaseAdmin
            .from("inventory_movements")
            .select("id")
            .eq("variant_id", item.variant_id)
            .eq("movement_type", "exchange_return_restore")
            .eq("reason", movementReason)
            .maybeSingle();

        if (movementReadError) throw new Error(movementReadError.message);

        if (!existingMovement) {
          const { data: variant, error: variantError } = await supabaseAdmin
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", item.variant_id)
            .single();

          if (variantError) {
            throw new Error("خطأ في قراءة مخزون القطعة المستبدلة: " + variantError.message);
          }

          const beforeQty = Number(variant.stock_quantity || 0);
          const afterQty = beforeQty + Number(item.quantity || 0);

          const { error: stockError } = await supabaseAdmin
            .from("product_variants")
            .update({ stock_quantity: afterQty })
            .eq("id", item.variant_id);

          if (stockError) {
            throw new Error("خطأ في إعادة القطعة المستبدلة للمخزون: " + stockError.message);
          }

          const { error: movementError } = await supabaseAdmin
            .from("inventory_movements")
            .insert({
              variant_id: item.variant_id,
              movement_type: "exchange_return_restore",
              quantity_change: Number(item.quantity || 0),
              quantity_before: beforeQty,
              quantity_after: afterQty,
              reason: movementReason,
            });

          if (movementError) {
            throw new Error("تمت إعادة المخزون لكن فشل تسجيل الحركة: " + movementError.message);
          }
        }

        const { error: itemFlagError } = await supabaseAdmin
          .from("order_exchange_return_items")
          .update({
            inventory_restored: true,
            restored_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        if (itemFlagError) throw new Error(itemFlagError.message);
      }

      const { error: exchangeFlagError } = await supabaseAdmin
        .from("orders")
        .update({ exchange_return_received: true })
        .eq("id", pendingExchange.id);

      if (exchangeFlagError) throw new Error(exchangeFlagError.message);

      const { data: existingExchangeReturn, error: exchangeReturnReadError } =
        await supabaseAdmin
          .from("order_returns")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();

      if (exchangeReturnReadError) throw new Error(exchangeReturnReadError.message);

      if (existingExchangeReturn) {
        const { error: updateReturnError } = await supabaseAdmin
          .from("order_returns")
          .update({
            return_reason: reason || "استلام قطعة مستبدلة",
            inventory_restored: true,
            financial_reversed: true,
          })
          .eq("id", existingExchangeReturn.id);

        if (updateReturnError) throw new Error(updateReturnError.message);
      } else {
        const { error: createReturnError } = await supabaseAdmin
          .from("order_returns")
          .insert({
            order_id: order.id,
            store_id: order.store_id,
            order_code: order.order_code,
            mayar_code: order.mayar_code || order.mayar_shipment_code || null,
            return_reason: reason || "استلام قطعة مستبدلة",
            inventory_restored: true,
            financial_reversed: true,
          });

        if (createReturnError) throw new Error(createReturnError.message);
      }

      return NextResponse.json({
        ok: true,
        is_exchange_return: true,
        message: `تم استلام القطعة القديمة للطلب ${order.order_code} المرتبط بالاستبدال ${pendingExchange.order_code}. تمت إعادة المخزون فقط دون أي تعديل مالي.`,
        order: normalized,
        exchange_order_code: pendingExchange.order_code,
        restored_items: exchangeItems,
        inventory_restored: true,
        financial_reversed: false,
      });
    }

    let { data: returnRecord, error: returnReadError } = await supabaseAdmin
      .from("order_returns")
      .select("*")
      .eq("order_id", order.id)
      .maybeSingle();

    if (returnReadError) {
      throw new Error(returnReadError.message);
    }

    if (
      returnRecord?.inventory_restored &&
      returnRecord?.financial_reversed
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "تم استرجاع هذا الطلب سابقًا",
        },
        { status: 409 }
      );
    }

    if (!returnRecord) {
      const { data: createdReturn, error: createReturnError } =
        await supabaseAdmin
          .from("order_returns")
          .insert({
            order_id: order.id,
            store_id: order.store_id,
            order_code: order.order_code,
            mayar_code: order.mayar_code || order.mayar_shipment_code || null,
            return_reason: reason || null,
            inventory_restored: false,
            financial_reversed: false,
          })
          .select("*")
          .single();

      if (createReturnError) {
        throw new Error(
          "خطأ في إنشاء سجل الاسترجاع: " + createReturnError.message
        );
      }

      returnRecord = createdReturn;
    }

    if (!returnRecord.inventory_restored) {
      const grouped = new Map<string, number>();

      for (const item of normalized.items) {
        grouped.set(
          item.variant_id,
          (grouped.get(item.variant_id) || 0) + Number(item.quantity || 0)
        );
      }

      for (const [variantId, quantity] of grouped.entries()) {
        const movementReason = `استرجاع طلب - ${order.order_code}`;

        const { data: existingMovement, error: movementReadError } =
          await supabaseAdmin
            .from("inventory_movements")
            .select("id")
            .eq("variant_id", variantId)
            .eq("movement_type", "order_return_restore")
            .eq("reason", movementReason)
            .maybeSingle();

        if (movementReadError) {
          throw new Error(movementReadError.message);
        }

        if (existingMovement) continue;

        const { data: variant, error: variantError } = await supabaseAdmin
          .from("product_variants")
          .select("stock_quantity")
          .eq("id", variantId)
          .single();

        if (variantError) {
          throw new Error("خطأ في قراءة المخزون: " + variantError.message);
        }

        const beforeQty = Number(variant.stock_quantity || 0);
        const afterQty = beforeQty + Number(quantity || 0);

        const { error: stockError } = await supabaseAdmin
          .from("product_variants")
          .update({
            stock_quantity: afterQty,
          })
          .eq("id", variantId);

        if (stockError) {
          throw new Error("خطأ في إعادة المخزون: " + stockError.message);
        }

        const { error: movementError } = await supabaseAdmin
          .from("inventory_movements")
          .insert({
            variant_id: variantId,
            movement_type: "order_return_restore",
            quantity_change: Number(quantity || 0),
            quantity_before: beforeQty,
            quantity_after: afterQty,
            reason: movementReason,
          });

        if (movementError) {
          throw new Error(
            "تمت إعادة المخزون لكن فشل تسجيل حركة المخزون: " +
              movementError.message
          );
        }
      }

      const { error: inventoryFlagError } = await supabaseAdmin
        .from("order_returns")
        .update({
          inventory_restored: true,
        })
        .eq("id", returnRecord.id);

      if (inventoryFlagError) {
        throw new Error(inventoryFlagError.message);
      }

      returnRecord.inventory_restored = true;
    }

    if (!returnRecord.financial_reversed) {
      const { data: originalTransactions, error: transactionsError } =
        await supabaseAdmin
          .from("financial_transactions")
          .select(`
            id,
            transaction_type,
            direction,
            category,
            amount,
            source_key
          `)
          .eq("order_id", order.id)
          .neq("transaction_type", "return");

      if (transactionsError) {
        throw new Error(transactionsError.message);
      }

      for (const transaction of originalTransactions || []) {
        await insertFinancialReversalIfMissing(transaction, order);
      }

      const { error: financialFlagError } = await supabaseAdmin
        .from("order_returns")
        .update({
          financial_reversed: true,
        })
        .eq("id", returnRecord.id);

      if (financialFlagError) {
        throw new Error(financialFlagError.message);
      }

      returnRecord.financial_reversed = true;
    }

    return NextResponse.json({
      ok: true,
      message: "تم استرجاع الطلب وإعادة المنتجات إلى المخزون",
      order: normalized,
      inventory_restored: true,
      financial_reversed: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "فشل تنفيذ الاسترجاع",
      },
      { status: 500 }
    );
  }
}
