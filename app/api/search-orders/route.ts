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
    created_at: order.created_at,
    printed_at: order.printed_at,
    notes: order.notes || "",
    customer: {
      name: customer?.name || "-",
      phone: customer?.phone || "-",
      phone2: customer?.phone2 || "",
      city: city?.name || "-",
      area: area?.name || "-",
      address: customer?.address || "-",
      meta_link: customer?.meta_link || "",
      whatsapp_link: customer?.whatsapp_link || "",
    },
    items: (order.order_items || []).map((item: any) => {
      const variant = asOne(item.product_variants);
      const product = asOne(variant?.products);

      return {
        id: item.id,
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("q") || "").trim();

    if (!query) {
      throw new Error("أدخل كود الطلب أو كود المعيار أو رقم الهاتف");
    }

    const baseSelect = `
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
      mayar_code,
      mayar_shipment_code,
      created_at,
      printed_at,
      notes,
      stores(id, name),
      customers(
        id,
        name,
        phone,
        phone2,
        address,
        meta_link,
        whatsapp_link,
        cities(name),
        areas(name)
      ),
      order_items(
        id,
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
    `;

    const normalizedQuery = query.toLowerCase();

    const { data: directOrders, error: directError } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .or(
        `order_code.ilike.${normalizedQuery},mayar_code.ilike.${normalizedQuery},mayar_shipment_code.ilike.${normalizedQuery}`
      )
      .order("created_at", { ascending: false });

    if (directError) {
      throw new Error(directError.message);
    }

    if (directOrders && directOrders.length > 0) {
      return NextResponse.json({
        ok: true,
        results: directOrders.map(normalizeOrder),
      });
    }

    const { data: customers, error: customersError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .or(`phone.ilike.%${normalizedQuery}%,phone2.ilike.%${normalizedQuery}%`);

    if (customersError) {
      throw new Error(customersError.message);
    }

    const customerIds = (customers || []).map((customer: any) => customer.id);

    if (customerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
      });
    }

    const { data: phoneOrders, error: phoneOrdersError } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (phoneOrdersError) {
      throw new Error(phoneOrdersError.message);
    }

    return NextResponse.json({
      ok: true,
      results: (phoneOrders || []).map(normalizeOrder),
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
