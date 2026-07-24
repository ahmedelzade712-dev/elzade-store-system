import { NextResponse } from "next/server";
import { mayarLogin, mayarSaveShipment } from "@/lib/mayar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getFirst(obj: any, keys: string[], fallback: any = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }

  return fallback;
}

function getPhone(value: any) {
  return String(value || "").replace(/\s+/g, "").trim();
}

async function saveMayarFailure(orderId: string | null, errorMessage: string) {
  if (!orderId) return;

  await supabaseAdmin
    .from("orders")
    .update({
      mayar_status: "failed",
      mayar_error: errorMessage,
    })
    .eq("id", orderId);
}

export async function GET(request: Request) {
  let loadedOrderId: string | null = null;

  try {
    const { searchParams } = new URL(request.url);
    const orderCode = searchParams.get("code");

    if (!orderCode) {
      throw new Error("اكتب رقم الطلب في الرابط مثل ?code=A008");
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        *,
        customer:customers (
          *,
          city:cities (*),
          area:areas (*)
        )
      `)
      .eq("order_code", orderCode)
      .single();

    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("الطلب غير موجود");

    loadedOrderId = order.id;

    const alreadySent =
      order.mayar_shipment_id ||
      order.mayar_id ||
      order.mayar_code ||
      order.mayar_tracking_url ||
      order.mayar_status === "sent";

    if (alreadySent) {
      return NextResponse.json({
        ok: true,
        already_sent: true,
        message: "هذه الطلبية مرسلة للمعيار سابقًا",
        order_code: order.order_code,
        mayar_status: order.mayar_status || "sent",
        mayar_shipment_id: order.mayar_shipment_id || order.mayar_id || null,
        mayar_shipment_code:
          order.mayar_shipment_code || order.mayar_code || null,
        mayar_tracking_url:
          order.mayar_tracking_url || order.mayar_tracking || null,
      });
    }

    await supabaseAdmin
      .from("orders")
      .update({
        mayar_status: "sending",
        mayar_error: null,
      })
      .eq("id", order.id);

    const customer = order.customer;

    if (!customer) {
      throw new Error("الطلب لا يحتوي على customer مرتبط");
    }

    const city = customer.city;
    const area = customer.area;

    if (!city) {
      throw new Error("العميل لا يحتوي على مدينة مرتبطة");
    }

    if (!area) {
      throw new Error("العميل لا يحتوي على منطقة مرتبطة");
    }

    if (city.name === "طرابلس (خاصة)") {
      throw new Error("طرابلس (خاصة) لا ترسل إلى شركة المعيار");
    }

    if (!city.mayar_zone_id) {
      throw new Error(`المدينة ${city.name || ""} غير مربوطة مع المعيار`);
    }

    if (!area.mayar_subzone_id) {
      throw new Error(`المنطقة ${area.name || ""} غير مربوطة مع المعيار`);
    }

    const customerName = String(
      getFirst(customer, ["name", "customer_name", "full_name"], "بدون اسم")
    );

    const phone = getPhone(
      getFirst(customer, ["phone", "phone_number", "mobile", "customer_phone"], "")
    );

    const secondPhone = getPhone(
      getFirst(customer, ["second_phone", "phone2", "second_mobile"], phone)
    );

    const address = String(
      getFirst(customer, ["address", "full_address", "customer_address"], "-")
    );

    const totalAmount = Number(
      getFirst(order, ["total_amount", "total", "amount", "order_total"], 0)
    );

    const notes = String(getFirst(order, ["notes", "note"], ""));

    if (!phone) {
      throw new Error("رقم الهاتف غير موجود في بيانات العميل");
    }

    const parcelType = String(order.mayar_parcel_type || "full_delivery");
    const isExchange = parcelType === "exchange";

    const sentPiecesCount = Math.max(
      1,
      Number(order.mayar_sent_pieces_count || 1)
    );

    const returnPiecesCount = Math.max(
      1,
      Number(order.mayar_return_pieces_count || 1)
    );

    const openable =
      order.mayar_openable === undefined || order.mayar_openable === null
        ? true
        : Boolean(order.mayar_openable);

    const login = await mayarLogin();

    const shipment = await mayarSaveShipment(login.token, {
      refNumber: order.order_code,
      recipientName: customerName || "بدون اسم",
      recipientPhone: phone,
      recipientMobile: secondPhone || phone,
      recipientAddress: address || "-",
      recipientZoneId: Number(city.mayar_zone_id),
      recipientSubzoneId: Number(area.mayar_subzone_id),

      // داخل Elzade يبقى الطلب بقيمته الحقيقية.
      // عند طرد مقابل طرد، lib/mayar.ts يرسل السعر 0 للمعيار فقط.
      price: totalAmount,

      parcelType: isExchange ? "exchange" : "full_delivery",
      piecesCount: sentPiecesCount,
      returnPiecesCount: returnPiecesCount,
      openable,

      notes: `Elzade ${order.order_code}${
        isExchange ? " - طرد مقابل طرد" : ""
      }${notes ? " - " + notes : ""}`,
    });

    const updatePayload: any = {
      mayar_status: "sent",
      mayar_error: null,
      mayar_sent_at: new Date().toISOString(),
    };

    if ("mayar_shipment_id" in order) updatePayload.mayar_shipment_id = shipment.id;
    if ("mayar_shipment_code" in order) updatePayload.mayar_shipment_code = shipment.code;
    if ("mayar_tracking_url" in order) updatePayload.mayar_tracking_url = shipment.trackingUrl;

    if ("mayar_id" in order) updatePayload.mayar_id = shipment.id;
    if ("mayar_code" in order) updatePayload.mayar_code = shipment.code;
    if ("mayar_tracking" in order) updatePayload.mayar_tracking = shipment.trackingUrl;

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);

    if (updateError) {
      throw new Error(
        "تم إنشاء الشحنة في المعيار، لكن فشل حفظ بياناتها داخل الطلب: " +
          updateError.message
      );
    }

    return NextResponse.json({
      ok: true,
      message: "تم إنشاء الشحنة في المعيار وحفظ بياناتها داخل الطلب",
      order_code: order.order_code,
      mayar_status: "sent",
      customer: customerName,
      phone,
      city: city.name,
      area: area.name,
      parcel_type: isExchange ? "طرد مقابل طرد" : "تسليم كامل الطرد",
      openable: openable ? "مسموح بفتح الطرد" : "غير مسموح بفتح الطرد",
      sent_pieces_count: sentPiecesCount,
      return_pieces_count: isExchange ? returnPiecesCount : 0,
      mayar_price_sent: isExchange ? 0 : totalAmount,
      system_total_amount: totalAmount,
      shipment,
    });
  } catch (error: any) {
    const errorMessage = error.message || "Unknown send order error";

    await saveMayarFailure(loadedOrderId, errorMessage);

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
