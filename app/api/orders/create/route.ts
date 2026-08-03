import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function numberValue(value: any): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function getSetting(
  key: string,
  fallback: number
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("financial_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();

  if (error) {
    throw new Error(
      `خطأ في قراءة الإعداد المالي ${key}: ${error.message}`
    );
  }

  if (!data) {
    return fallback;
  }

  const value = numberValue(data.setting_value);

  return value > 0 ? value : fallback;
}

/*
  تسجل الحركة مرة واحدة فقط.

  إذا كانت source_key مسجلة سابقًا، ترجع Supabase الخطأ 23505.
  يتم تجاهل هذا الخطأ حتى لا يضاف الرصيد أو الخصم مرتين.
*/
async function insertTransactionIfMissing(payload: any) {
  const { error } = await supabaseAdmin
    .from("financial_transactions")
    .insert(payload);

  if (error && error.code !== "23505") {
    throw new Error(
      "خطأ في تسجيل الحركة المالية: " + error.message
    );
  }
}

/*
  حساب قيمة المنتجات من جدول عناصر الطلب.

  الأولوية:
  1. unit_price المحفوظ مع عنصر الطلب.
  2. sale_price الموجود داخل جدول المنتج/المقاس.
*/
function calculateItemsTotal(orderItems: any[]): number {
  return (orderItems || []).reduce(
    (total: number, item: any) => {
      const quantity = numberValue(item?.quantity);
      const variant = asOne(item?.product_variants);

      const savedUnitPrice = numberValue(item?.unit_price);
      const tableUnitPrice = numberValue(variant?.sale_price);

      const unitPrice =
        savedUnitPrice > 0
          ? savedUnitPrice
          : tableUnitPrice;

      return total + quantity * unitPrice;
    },
    0
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const orderId = String(body?.order_id || "").trim();

    if (!orderId) {
      throw new Error("رقم الطلب الداخلي order_id مطلوب");
    }

    const { data: order, error: orderError } =
      await supabaseAdmin
        .from("orders")
        .select(`
          id,
          order_code,
          store_id,
          total_amount,
          shipping_fee,
          status,
          printed_at,
          mayar_parcel_type,
          exchange_original_order_id,
          customers(
            cities(name)
          ),
          order_items(
            id,
            quantity,
            unit_price,
            product_variants(
              sale_price
            )
          )
        `)
        .eq("id", orderId)
        .single();

    if (orderError) {
      throw new Error(
        "خطأ في قراءة الطلب: " + orderError.message
      );
    }

    if (!order) {
      throw new Error("الطلب غير موجود");
    }

    const customerRecord = asOne(order.customers);
    const cityRecord = asOne(customerRecord?.cities);
    const cityName = String(cityRecord?.name || "").trim();

    if (cityName !== "طرابلس (خاصة)") {
      throw new Error(
        `الطلب ${order.order_code || ""} ليس من طرابلس خاصة`
      );
    }

    const isExchangeOrder =
      String(order.mayar_parcel_type || "") === "exchange" ||
      Boolean(order.exchange_original_order_id);

    /*
      طلب الاستبدال في طرابلس الخاصة لا ينشئ أي حركة مالية:
      - لا مبيعات
      - لا خصم رسوم توصيل
      - لا مكافأة مندوب
    */
    if (isExchangeOrder) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "exchange_order",
        order_code: order.order_code,
        sale_amount: 0,
        shipping_deduction: 0,
        courier_reward: 0,
        balance_effect: 0,
      });
    }

    const enteredOrderAmount = numberValue(
      order.total_amount
    );

    const itemsTableAmount = calculateItemsTotal(
      order.order_items || []
    );

    /*
      منطق قيمة المنتجات:

      إذا أدخل المستخدم قيمة أكبر من صفر:
      نعتمد القيمة التي أدخلها.

      إذا أدخل المستخدم صفر:
      نعتمد مجموع أسعار المنتجات من الجدول.
      هذه الحالة تعني أن العميل دفع قيمة المنتجات بحوالة مصرفية.
    */
    const saleAmount =
      enteredOrderAmount > 0
        ? enteredOrderAmount
        : itemsTableAmount;

    if (saleAmount <= 0) {
      throw new Error(
        `تعذر حساب قيمة الطلب ${
          order.order_code || ""
        }. قيمة الطلب المدخلة صفر وأسعار المنتجات في الجدول غير صحيحة.`
      );
    }

    const shippingFee = numberValue(order.shipping_fee);

    const courierReward = await getSetting(
      "private_tripoli_courier_reward",
      5
    );

    const standardShippingFee = await getSetting(
      "private_tripoli_standard_shipping_fee",
      15
    );

    const occurredAt =
      order.printed_at || new Date().toISOString();

    /*
      1. إضافة قيمة المنتجات إلى الرصيد.

      سواء كانت القيمة مدخلة يدويًا أو محسوبة من الجدول،
      يتم تسجيل حركة مبيعات واحدة فقط.
    */
    await insertTransactionIfMissing({
      store_id: order.store_id,
      order_id: order.id,
      transaction_type: "sale",
      direction: "credit",
      category: "مبيعات",
      amount: saleAmount,
      description:
        enteredOrderAmount > 0
          ? `إضافة قيمة طلب طرابلس خاصة ${order.order_code} إلى الرصيد`
          : `إضافة قيمة منتجات الطلب ${order.order_code} المحولة مصرفيًا إلى الرصيد`,
      source_key:
        `order:${order.id}:private_tripoli_sale`,
      is_system_generated: true,
      occurred_at: occurredAt,
      metadata: {
        order_code: order.order_code,
        shipping_company: "private_tripoli",
        entered_order_amount: enteredOrderAmount,
        calculated_items_amount: itemsTableAmount,
        final_sale_amount: saleAmount,
        shipping_fee: shippingFee,
        payment_type:
          enteredOrderAmount > 0
            ? "normal"
            : "bank_transfer",
      },
    });

    /*
      2. عندما تكون قيمة التوصيل المدخلة صفر:

      معنى ذلك أن العميل لم يدفع التوصيل،
      ولذلك يتحمل المتجر 15 د.ل للمندوب.
    */
    const storePaysShipping = shippingFee === 0;

    if (storePaysShipping) {
      await insertTransactionIfMissing({
        store_id: order.store_id,
        order_id: order.id,
        transaction_type: "expense",
        direction: "debit",
        category: "رسوم التوصيل",
        amount: standardShippingFee,
        description:
          `خصم رسوم توصيل الطلب ${order.order_code} من الرصيد`,
        source_key:
          `order:${order.id}:private_tripoli_shipping_fee`,
        is_system_generated: true,
        occurred_at: occurredAt,
        metadata: {
          order_code: order.order_code,
          shipping_company: "private_tripoli",
          entered_shipping_fee: shippingFee,
          charged_to_store: standardShippingFee,
        },
      });
    }

    /*
      3. مكافأة المندوب 5 د.ل:

      تطبق في حالتين:
      - التوصيل المدخل 15 د.ل.
      - التوصيل المدخل 0 د.ل.

      أما إذا كانت رسوم التوصيل 20 د.ل،
      فلا يتم تطبيق مكافأة 5 د.ل وفق المنطق السابق للنظام.
    */
    const rewardApplied =
      courierReward > 0 &&
      (shippingFee === 0 ||
        shippingFee === standardShippingFee);

    if (rewardApplied) {
      await insertTransactionIfMissing({
        store_id: order.store_id,
        order_id: order.id,
        transaction_type: "courier_reward",
        direction: "debit",
        category: "مكافآت المناديب",
        amount: courierReward,
        description:
          `مكافأة مندوب الطلب ${order.order_code}`,
        source_key:
          `order:${order.id}:private_tripoli_courier_reward`,
        is_system_generated: true,
        occurred_at: occurredAt,
        metadata: {
          order_code: order.order_code,
          shipping_company: "private_tripoli",
          shipping_fee: shippingFee,
          courier_reward: courierReward,
        },
      });
    }

    const shippingDeduction = storePaysShipping
      ? standardShippingFee
      : 0;

    const rewardDeduction = rewardApplied
      ? courierReward
      : 0;

    const balanceEffect =
      saleAmount -
      shippingDeduction -
      rewardDeduction;

    return NextResponse.json({
      ok: true,
      order_code: order.order_code,

      entered_order_amount: enteredOrderAmount,
      calculated_items_amount: itemsTableAmount,
      sale_amount: saleAmount,

      shipping_fee_entered: shippingFee,
      shipping_deduction: shippingDeduction,
      courier_reward: rewardDeduction,

      balance_effect: balanceEffect,

      calculation: {
        credit: saleAmount,
        shipping_debit: shippingDeduction,
        reward_debit: rewardDeduction,
        net: balanceEffect,
      },
    });
  } catch (error: any) {
    console.error(
      "PRIVATE TRIPOLI FINANCIAL ERROR:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "فشل تسجيل رصيد طرابلس الخاصة",
      },
      {
        status: 500,
      }
    );
  }
}