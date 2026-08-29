"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserProfile } from "@/lib/auth";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(1900);

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editOrder, setEditOrder] = useState<any>(null);
  const [deleteOrder, setDeleteOrder] = useState<any>(null);

  const [editCustomerName, setEditCustomerName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPhone2, setEditPhone2] = useState("");
  const [editMetaLink, setEditMetaLink] = useState("");
  const [editWhatsappLink, setEditWhatsappLink] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStoreId, setEditStoreId] = useState("");

  const [editCart, setEditCart] = useState<any[]>([]);
  const [originalItems, setOriginalItems] = useState<any[]>([]);

  const [editSelectedProductKey, setEditSelectedProductKey] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editQuantity, setEditQuantity] = useState(1);
  const [editingCartVariantId, setEditingCartVariantId] = useState("");

  const [preparedPrintBatch, setPreparedPrintBatch] = useState<any>(null);
  const [printingDocument, setPrintingDocument] = useState<"a4" | "labels" | null>(null);
  const [finalizingPrint, setFinalizingPrint] = useState(false);
  const [a4PrintDialogCompleted, setA4PrintDialogCompleted] = useState(false);
  const [labelsPrintDialogCompleted, setLabelsPrintDialogCompleted] = useState(false);

  function getOrderShippingFee(order: any) {
    return Number(order.shipping_fee || 0);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const result = await getCurrentUserProfile();

    if (result.error) {
      window.location.href = "/login";
      return;
    }

    const { data: storesData } = await supabase
      .from("stores")
      .select("id, name")
      .order("name");

    setStores(storesData || []);

    const { data: variantsData } = await supabase
      .from("product_variants")
      .select(`
        id,
        store_id,
        product_id,
        color,
        size,
        stock_quantity,
        cost_price,
        sale_price,
        image_url,
        is_active,
        products(
          id,
          sku,
          name,
          model,
          product_type,
          main_image_url
        )
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    setVariants(variantsData || []);

    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from("orders")
      .select(`
        id,
        order_code,
        status,
        total_amount,
        total_cost,
        shipping_fee,
        notes,
        created_at,
        scheduled_for,
        printed_at,
        mayar_status,
        mayar_live_status_code,
        mayar_live_status_name,
        mayar_status_updated_at,
        mayar_error,
        mayar_code,
        mayar_shipment_code,
        mayar_tracking_url,
        mayar_sent_at,
        store_id,
        customer_id,
        courier_id,
        couriers(id, name, sort_order),
        stores(id, name),
        customers(
          id,
          name,
          phone,
          phone2,
          city_id,
          area_id,
          address,
          meta_link,
          whatsapp_link,
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
            store_id,
            product_id,
            color,
            size,
            image_url,
            stock_quantity,
            cost_price,
            sale_price,
            products(
              id,
              name,
              model,
              main_image_url
            )
          )
        )
      `)
      .or(`scheduled_for.is.null,scheduled_for.eq.${today}`)
      .is("printed_at", null)
      .order("created_at", { ascending: false });

    if (result.profile && result.profile.role !== "admin") {
      query = query.eq("store_id", result.profile.store_id);
    }

    const { data, error } = await query;

    if (error) {
      setMessage("خطأ في تحميل الطلبات: " + error.message);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const productsText = (order.order_items || [])
        .map((item: any) => {
          const variant = item.product_variants;
          const product = variant?.products;

          return `
            ${product?.name || ""}
            ${product?.model || ""}
            ${variant?.color || ""}
            ${variant?.size || ""}
          `;
        })
        .join(" ");

      const text = `
        ${order.order_code || ""}
        ${order.customers?.name || ""}
        ${order.customers?.phone || ""}
        ${order.customers?.phone2 || ""}
        ${order.stores?.name || ""}
        ${order.status || ""}
        ${productsText}
      `.toLowerCase();

      return (
        text.includes(search.toLowerCase()) &&
        (!storeFilter || order.stores?.id === storeFilter) &&
        (!statusFilter || order.status === statusFilter)
      );
    });
  }, [orders, search, storeFilter, statusFilter]);

  const printableOrdersVisible = filteredOrders.filter((order) =>
    isPrivateTripoli(order)
      ? order.status === "new"
      : order.mayar_status === "sent"
  );

  const failedMayarOrdersVisible = filteredOrders.filter(
    (order) => !isPrivateTripoli(order) && order.mayar_status === "failed"
  );

  const editProductCards = useMemo(() => {
    if (!editOrder) return [];

    const map = new Map<string, any>();

    variants
      .filter((v) => !editStoreId || v.store_id === editStoreId)
      .forEach((v) => {
        const key = `${v.product_id}-${v.color}`;

        if (!map.has(key)) {
          map.set(key, {
            key,
            product_id: v.product_id,
            store_id: v.store_id,
            color: v.color,
            product: v.products,
            image: v.image_url || v.products?.main_image_url,
            sale_price: v.sale_price,
            total_stock: 0,
          });
        }

        map.get(key).total_stock += getEditAvailableQuantity(v);
      });

    return Array.from(map.values()).filter((card) => card.total_stock > 0);
  }, [variants, editStoreId, editCart, originalItems, editOrder]);

  const editSelectedCard = editProductCards.find(
    (card) => card.key === editSelectedProductKey
  );

  const editAvailableSizes = variants.filter(
    (v) =>
      editSelectedCard &&
      v.product_id === editSelectedCard.product_id &&
      v.color === editSelectedCard.color &&
      getEditAvailableQuantity(v) > 0
  );

  const editSelectedVariant = editAvailableSizes.find((v) => v.size === editSize);

  const editSelectedAvailableQuantity = editSelectedVariant
    ? getEditAvailableQuantity(editSelectedVariant)
    : 0;

  const editTotalAmount = editCart.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sale_price || 0),
    0
  );

  const editTotalCost = editCart.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.cost_price || 0),
    0
  );

  function statusText(status: string) {
    if (status === "new") return "جديد";
    if (status === "processing") return "قيد التجهيز";
    if (status === "sold") return "مباع";
    if (status === "shipped") return "جاري الشحن";
    if (status === "partial_delivered") return "تسليم جزئي";
    if (status === "delivered") return "تم التسليم";
    if (status === "returned") return "مرتجع";
    return status;
  }

  function statusClass(status: string) {
    if (status === "new") return "text-blue-400";
    if (status === "processing") return "text-yellow-400";
    if (status === "sold") return "text-green-400";
    if (status === "shipped") return "text-purple-400";
    if (status === "partial_delivered") return "text-orange-400";
    if (status === "delivered") return "text-green-400";
    if (status === "returned") return "text-red-400";
    return "text-neutral-400";
  }

  function mayarStatusText(status: string) {
    if (status === "sent") return "تم الإرسال للمعيار";
    if (status === "failed") return "فشل الإرسال";
    if (status === "sending") return "جاري الإرسال";
    return "لم يرسل";
  }

  function getMayarLiveStatusText(order: any) {
    if (order.mayar_live_status_name) {
      return order.mayar_live_status_name;
    }

    return getMayarLiveStatusText(order);
  }

  function mayarStatusClass(status: string) {
    if (status === "sent") return "text-green-400";
    if (status === "failed") return "text-red-400";
    if (status === "sending") return "text-yellow-400";
    return "text-neutral-400";
  }

  function getMayarLiveStatusClass(order: any) {
    const text = String(order.mayar_live_status_name || "").trim();

    if (text.includes("تم التسليم")) return "text-green-400";
    if (text.includes("تعذر")) return "text-red-400";
    if (text.includes("إرجاع") || text.includes("الإرجاع")) return "text-orange-400";
    if (text.includes("قيد التوصيل")) return "text-purple-400";
    if (text.includes("إعادة توصيل")) return "text-yellow-400";
    if (text.includes("المخزن")) return "text-blue-400";
    if (text.includes("طلب شحن") || text.includes("انتظار الشحن")) {
      return "text-yellow-400";
    }

    return getMayarLiveStatusClass(order);
  }

  function getMayarCode(order: any) {
    return order.mayar_code || order.mayar_shipment_code || "-";
  }

  function getOwnQrImageUrl(order: any) {
    const qrValue = String(order.order_code || "").trim();

    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(
      qrValue
    )}`;
  }

  function getOrderReviewStatusText(order: any) {
    if (isPrivateTripoli(order)) {
      return order.status === "new" ? "جديد" : statusText(order.status);
    }

    return mayarStatusText(order.mayar_status);
  }

  function getOrderReviewStatusClass(order: any) {
    if (isPrivateTripoli(order)) {
      return order.status === "new" ? "text-blue-400" : statusClass(order.status);
    }

    return mayarStatusClass(order.mayar_status);
  }

  function getOriginalQuantityForVariant(variantId: string) {
    return originalItems
      .filter((item) => item.variant_id === variantId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function getEditCartQuantityForVariant(variantId: string) {
    return editCart
      .filter((item) => item.variant_id === variantId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function getEditAvailableQuantity(variant: any) {
    const originalQty = getOriginalQuantityForVariant(variant.id);
    const cartQty = getEditCartQuantityForVariant(variant.id);

    return Number(variant.stock_quantity || 0) + originalQty - cartQty;
  }

  function openEdit(order: any) {
    setEditOrder(order);
    setEditCustomerName(order.customers?.name || "");
    setEditPhone(order.customers?.phone || "");
    setEditPhone2(order.customers?.phone2 || "");
    setEditMetaLink(order.customers?.meta_link || "");
    setEditWhatsappLink(order.customers?.whatsapp_link || "");
    setEditNotes(order.notes || "");
    setEditStoreId(order.store_id || order.stores?.id || "");
    setEditSelectedProductKey("");
    setEditSize("");
    setEditQuantity(1);
    setEditingCartVariantId("");
    setMessage("");

    const oldItemsMap = new Map<string, any>();

    (order.order_items || []).forEach((item: any) => {
      if (oldItemsMap.has(item.variant_id)) {
        oldItemsMap.get(item.variant_id).quantity += Number(item.quantity || 0);
      } else {
        oldItemsMap.set(item.variant_id, {
          order_item_id: item.id,
          variant_id: item.variant_id,
          quantity: Number(item.quantity || 0),
        });
      }
    });

    setOriginalItems(Array.from(oldItemsMap.values()));

    const cartMap = new Map<string, any>();

    (order.order_items || []).forEach((item: any) => {
      const variant = item.product_variants;
      const product = variant?.products;

      if (cartMap.has(item.variant_id)) {
        const existing = cartMap.get(item.variant_id);
        existing.quantity += Number(item.quantity || 0);
        return;
      }

      cartMap.set(item.variant_id, {
        variant_id: item.variant_id,
        product_id: variant?.product_id,
        product_name: product?.name,
        model: product?.model,
        color: variant?.color,
        size: variant?.size,
        image_url: variant?.image_url || product?.main_image_url,
        quantity: Number(item.quantity || 0),
        stock_quantity: Number(variant?.stock_quantity || 0) + Number(item.quantity || 0),
        sale_price: Number(item.unit_price ?? variant?.sale_price ?? 0),
        cost_price: Number(item.unit_cost ?? variant?.cost_price ?? 0),
      });
    });

    setEditCart(Array.from(cartMap.values()));
  }

  function addProductToEditCart() {
    setMessage("");

    if (!editSelectedVariant) {
      setMessage("اختر المنتج والمقاس أولاً");
      return;
    }

    if (!editQuantity || editQuantity <= 0) {
      setMessage("الكمية غير صحيحة");
      return;
    }

    if (editQuantity > editSelectedAvailableQuantity) {
      setMessage(
        `الكمية المطلوبة أكبر من المتوفر. المتبقي الآن: ${editSelectedAvailableQuantity}`
      );
      return;
    }

    const newCartItem = {
      variant_id: editSelectedVariant.id,
      product_id: editSelectedVariant.product_id,
      product_name: editSelectedVariant.products?.name,
      model: editSelectedVariant.products?.model,
      color: editSelectedVariant.color,
      size: editSelectedVariant.size,
      image_url:
        editSelectedVariant.image_url ||
        editSelectedVariant.products?.main_image_url,
      quantity: editQuantity,
      stock_quantity:
        Number(editSelectedVariant.stock_quantity || 0) +
        getOriginalQuantityForVariant(editSelectedVariant.id),
      sale_price: Number(editSelectedVariant.sale_price || 0),
      cost_price: Number(editSelectedVariant.cost_price || 0),
    };

    setEditCart((prev) => {
      if (editingCartVariantId) {
        const cartWithoutOld = prev.filter(
          (item) => item.variant_id !== editingCartVariantId
        );

        const existingSameNew = cartWithoutOld.find(
          (item) => item.variant_id === editSelectedVariant.id
        );

        if (existingSameNew) {
          return cartWithoutOld.map((item) =>
            item.variant_id === editSelectedVariant.id
              ? {
                  ...item,
                  quantity: Number(item.quantity || 0) + editQuantity,
                  sale_price: newCartItem.sale_price,
                  cost_price: newCartItem.cost_price,
                }
              : item
          );
        }

        return [...cartWithoutOld, newCartItem];
      }

      const existing = prev.find(
        (item) => item.variant_id === editSelectedVariant.id
      );

      if (existing) {
        return prev.map((item) =>
          item.variant_id === editSelectedVariant.id
            ? { ...item, quantity: item.quantity + editQuantity }
            : item
        );
      }

      return [...prev, newCartItem];
    });

    setEditSelectedProductKey("");
    setEditSize("");
    setEditQuantity(1);
    setEditingCartVariantId("");
  }


  function startEditCartItem(item: any) {
    const key = `${item.product_id}-${item.color}`;

    setEditingCartVariantId(item.variant_id);
    setEditSelectedProductKey(key);
    setEditSize(item.size);
    setEditQuantity(Number(item.quantity || 1));
    setMessage("اختر المنتج/اللون/المقاس الجديد ثم اضغط تطبيق التعديل");
  }

  function updateEditCartQuantity(variantId: string, quantity: number) {
    if (!quantity || quantity <= 0) return;

    setEditCart((prev) =>
      prev.map((item) =>
        item.variant_id === variantId ? { ...item, quantity } : item
      )
    );
  }

  function updateEditCartPrice(variantId: string, value: string) {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = normalized === "" ? 0 : Number(normalized);

    setEditCart((prev) =>
      prev.map((item) =>
        item.variant_id === variantId
          ? { ...item, sale_price: Number.isFinite(parsed) ? parsed : 0 }
          : item
      )
    );
  }

  function removeFromEditCart(variantId: string) {
    setEditCart((prev) => prev.filter((item) => item.variant_id !== variantId));

    if (editingCartVariantId === variantId) {
      setEditingCartVariantId("");
      setEditSelectedProductKey("");
      setEditSize("");
      setEditQuantity(1);
    }
  }

  async function handleSaveEdit() {
    if (!editOrder) return;

    if (!editCustomerName || !editPhone || !editStoreId) {
      setMessage("اسم العميل ورقم الهاتف والمتجر مطلوبة");
      return;
    }

    if (editCart.length === 0) {
      setMessage("لا يمكن حفظ طلب بدون منتجات");
      return;
    }

    setMessage("جاري تعديل الطلب...");

    for (const oldItem of originalItems) {
      const { data: currentVariant, error: readError } = await supabase
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", oldItem.variant_id)
        .single();

      if (readError) {
        setMessage("خطأ في قراءة المخزون القديم: " + readError.message);
        return;
      }

      const beforeQty = Number(currentVariant.stock_quantity || 0);
      const afterQty = beforeQty + Number(oldItem.quantity || 0);

      const { error: restoreError } = await supabase
        .from("product_variants")
        .update({ stock_quantity: afterQty })
        .eq("id", oldItem.variant_id);

      if (restoreError) {
        setMessage("خطأ في إرجاع المخزون القديم: " + restoreError.message);
        return;
      }

      await supabase.from("inventory_movements").insert({
        variant_id: oldItem.variant_id,
        movement_type: "edit_order_restore",
        quantity_change: Number(oldItem.quantity || 0),
        quantity_before: beforeQty,
        quantity_after: afterQty,
        reason: `تعديل طلب - إرجاع القديم - ${editOrder.order_code}`,
      });
    }

    for (const item of editCart) {
      const { data: currentVariant, error: currentVariantError } = await supabase
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", item.variant_id)
        .single();

      if (currentVariantError) {
        setMessage("خطأ في مراجعة المخزون الجديد: " + currentVariantError.message);
        return;
      }

      const beforeQty = Number(currentVariant.stock_quantity || 0);
      const afterQty = beforeQty - Number(item.quantity || 0);

      if (afterQty < 0) {
        setMessage(
          `الكمية غير كافية للمنتج ${item.product_name} / ${item.color} / ${item.size}. المتوفر الآن: ${currentVariant.stock_quantity}`
        );
        return;
      }

      const { error: deductError } = await supabase
        .from("product_variants")
        .update({ stock_quantity: afterQty })
        .eq("id", item.variant_id);

      if (deductError) {
        setMessage("خطأ في خصم المخزون الجديد: " + deductError.message);
        return;
      }

      await supabase.from("inventory_movements").insert({
        variant_id: item.variant_id,
        movement_type: "edit_order_sale",
        quantity_change: -Number(item.quantity || 0),
        quantity_before: beforeQty,
        quantity_after: afterQty,
        reason: `تعديل طلب - خصم الجديد - ${editOrder.order_code}`,
      });
    }

    const { error: customerError } = await supabase
      .from("customers")
      .update({
        name: editCustomerName,
        phone: editPhone,
        phone2: editPhone2 || null,
        meta_link: editMetaLink || null,
        whatsapp_link: editWhatsappLink || null,
      })
      .eq("id", editOrder.customers?.id);

    if (customerError) {
      setMessage("تم تعديل المخزون لكن حدث خطأ في تعديل العميل: " + customerError.message);
      return;
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        store_id: editStoreId,
        total_amount: editTotalAmount,
        total_cost: editTotalCost,
        notes: editNotes || null,
      })
      .eq("id", editOrder.id);

    if (orderError) {
      setMessage("تم تعديل المخزون لكن حدث خطأ في تعديل الطلب: " + orderError.message);
      return;
    }

    const { error: deleteItemsError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", editOrder.id);

    if (deleteItemsError) {
      setMessage("تم تعديل الطلب لكن حدث خطأ في حذف المنتجات القديمة: " + deleteItemsError.message);
      return;
    }

    const mergedCart = Array.from(
      editCart.reduce((map, item) => {
        const existing = map.get(item.variant_id);

        if (existing) {
          existing.quantity += Number(item.quantity || 0);
          existing.sale_price = Number(item.sale_price || 0);
          existing.cost_price = Number(item.cost_price || 0);
        } else {
          map.set(item.variant_id, { ...item, quantity: Number(item.quantity || 0) });
        }

        return map;
      }, new Map<string, any>()).values()
    );

    const newItems = mergedCart.map((item: any) => ({
      order_id: editOrder.id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.sale_price,
      unit_cost: item.cost_price,
    }));

    const { error: insertItemsError } = await supabase
      .from("order_items")
      .insert(newItems);

    if (insertItemsError) {
      setMessage("تم تعديل الطلب لكن حدث خطأ في حفظ المنتجات الجديدة: " + insertItemsError.message);
      return;
    }

    setEditOrder(null);
    setEditCart([]);
    setOriginalItems([]);
    setMessage("تم تعديل الطلب بنجاح");
    await loadData();
  }

  async function handleDeleteOrder() {
    if (!deleteOrder) return;

    setMessage("جاري حذف الطلب وإرجاع المنتجات للمخزون...");

    for (const item of deleteOrder.order_items || []) {
      const variant = item.product_variants;

      if (!variant?.id) continue;

      const beforeQty = Number(variant.stock_quantity || 0);
      const afterQty = beforeQty + Number(item.quantity || 0);

      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ stock_quantity: afterQty })
        .eq("id", variant.id);

      if (stockError) {
        setMessage("خطأ في إرجاع المخزون: " + stockError.message);
        return;
      }

      await supabase.from("inventory_movements").insert({
        variant_id: variant.id,
        movement_type: "delete_order_return",
        quantity_change: Number(item.quantity || 0),
        quantity_before: beforeQty,
        quantity_after: afterQty,
        reason: `حذف طلب - ${deleteOrder.order_code}`,
      });
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", deleteOrder.id);

    if (itemsError) {
      setMessage("خطأ في حذف منتجات الطلب: " + itemsError.message);
      return;
    }

    const { error: orderError } = await supabase
      .from("orders")
      .delete()
      .eq("id", deleteOrder.id);

    if (orderError) {
      setMessage("خطأ في حذف الطلب: " + orderError.message);
      return;
    }

    setDeleteOrder(null);
    setMessage("تم حذف الطلب وإرجاع المنتجات للمخزون");
    await loadData();
  }

  function buildPickingList(ordersToPrint: any[]) {
    const map = new Map<string, any>();

    ordersToPrint.forEach((order) => {
      (order.order_items || []).forEach((item: any) => {
        const variant = item.product_variants;
        const product = variant?.products;
        const key = `${product?.name || "-"}-${product?.model || "-"}-${variant?.color || "-"}-${variant?.size || "-"}`;

        if (!map.has(key)) {
          map.set(key, {
            name: product?.name || "-",
            model: product?.model || "-",
            color: variant?.color || "-",
            size: variant?.size || "-",
            image: variant?.image_url || product?.main_image_url || "",
            quantity: 0,
          });
        }

        map.get(key).quantity += Number(item.quantity || 0);
      });
    });

    return Array.from(map.values());
  }

  function getCustomerCityName(order: any) {
    return order.customers?.cities?.name || "";
  }

  function isPrivateTripoli(order: any) {
    return getCustomerCityName(order).trim() === "طرابلس (خاصة)";
  }

  function getShippingTypeText(order: any) {
    return isPrivateTripoli(order) ? "مندوب خاص - طرابلس" : "شركة المعيار";
  }

  function getPrintDayAndDate() {
    const now = new Date();
    const arabicDays = [
      "الأحد",
      "الاثنين",
      "الثلاثاء",
      "الأربعاء",
      "الخميس",
      "الجمعة",
      "السبت",
    ];

    const day = arabicDays[now.getDay()];
    const date = `${String(now.getDate()).padStart(2, "0")}/${String(
      now.getMonth() + 1
    ).padStart(2, "0")}/${now.getFullYear()}`;

    return { day, date };
  }

  function buildPrintHtml(
    ordersToPrint: any[],
    printMode: "a4" | "warehouse" | "preparation" | "courier" | "labels"
  ) {
    const pickingItems = buildPickingList(ordersToPrint);

    const pickingRows = pickingItems
      .map(
        (item) => `
          <tr>
            <td>${item.image ? `<img src="${item.image}" />` : ""}</td>
            <td>${item.name}</td>
            <td>${item.model}</td>
            <td>${item.color}</td>
            <td>${item.size}</td>
            <td class="qty">${item.quantity}</td>
          </tr>
        `
      )
      .join("");

    function buildOrderProductsHtml(order: any, className = "label-products") {
      return (order.order_items || [])
        .map((item: any) => {
          const variant = item.product_variants;
          const product = variant?.products;

          return `
            <div class="${className}">
              <b>${product?.name || "-"}</b>
              <span>
                ${variant?.color || "-"} / ${variant?.size || "-"}
                ${Number(item.quantity || 0) > 1 ? ` × ${item.quantity}` : ""}
              </span>
            </div>
          `;
        })
        .join("");
    }

    const ordersHtml = ordersToPrint
      .map((order) => {
        const itemsHtml = (order.order_items || [])
          .map((item: any) => {
            const variant = item.product_variants;
            const product = variant?.products;

            return `
              <div class="order-item">
                ${
                  variant?.image_url || product?.main_image_url
                    ? `<img src="${variant?.image_url || product?.main_image_url}" />`
                    : ""
                }
                <div class="order-item-details">
                  <b class="order-product-name">${product?.name || "-"}</b>
                  <p><b>الموديل:</b> ${product?.model || "-"}</p>
                  <p><b>اللون:</b> ${variant?.color || "-"}</p>
                  <p><b>المقاس:</b> ${variant?.size || "-"}</p>
                  <p class="order-item-quantity"><b>الكمية:</b> ${item.quantity}</p>
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <div class="order-box">
            <h3>${order.order_code}</h3>

            <div class="customer-data">
              <p><b>العميل:</b> ${order.customers?.name || "-"}</p>
              <div class="phone-lines">
                <span><b>الهاتف:</b> ${order.customers?.phone || "-"}</span>
                ${
                  order.customers?.phone2
                    ? `<span><b>الهاتف 2:</b> ${order.customers.phone2}</span>`
                    : ""
                }
              </div>
              <p><b>المدينة:</b> ${getCustomerCityName(order) || "-"}</p>
              <p><b>المنطقة:</b> ${order.customers?.areas?.name || "-"}</p>
              <p><b>المتجر:</b> ${order.stores?.name || "-"}</p>
            </div>

            <div class="order-products-heading">المنتجات</div>
            <div class="order-products-list">${itemsHtml}</div>
            <p class="total">الإجمالي: ${order.total_amount} د.ل</p>
          </div>
        `;
      })
      .join("");

    const privateLabelsHtml = ordersToPrint
      .filter((order) => isPrivateTripoli(order))
      .map((order) => {
        const totalWithShipping =
          Number(order.total_amount || 0) + getOrderShippingFee(order);

        return `
          <div class="label private-label">
            <div class="label-header-row">
              <div>
                <div class="label-title">طرابلس خاصة</div>
                <div class="private-code">${order.order_code || "-"}</div>
              </div>

              <div class="own-qr-box">
                <img
                  class="own-qr"
                  src="${getOwnQrImageUrl(order)}"
                  alt="QR ${order.order_code || ""}"
                />
              </div>
            </div>

            <div class="private-main-data">
              <p><b>الهاتف:</b> <span class="label-phone">${order.customers?.phone || "-"}</span></p>
              ${
                order.customers?.phone2
                  ? `<p><b>الهاتف 2:</b> <span class="label-phone">${order.customers.phone2}</span></p>`
                  : ""
              }
              <p><b>المنطقة:</b> ${order.customers?.areas?.name || "-"}</p>
              <p><b>العنوان:</b> ${order.customers?.address || "-"}</p>
              <p><b>المتجر:</b> ${order.stores?.name || "-"}</p>
            </div>

            <div class="private-products">
              <div class="products-heading">المنتجات</div>
              ${buildOrderProductsHtml(order, "private-product-row")}
            </div>

            <div class="private-total">
              المطلوب كاملاً مع الشحن:
              <span>${totalWithShipping} د.ل</span>
            </div>
          </div>
        `;
      })
      .join("");

    const mayarLabelsHtml = ordersToPrint
      .filter((order) => !isPrivateTripoli(order))
      .map(
        (order) => `
          <div class="label mayar">
            <div class="mayar-caption">كود المعيار</div>
            <div class="mayar-code-large">${getMayarCode(order)}</div>

            <div class="mayar-main-content">
              <div class="mayar-essential-data">
                <p><b>كودنا:</b> <span class="our-order-code">${order.order_code || "-"}</span></p>
                <p><b>المدينة:</b> ${getCustomerCityName(order) || "-"}</p>
                <p><b>رقم الهاتف:</b> <span class="mayar-phone">${order.customers?.phone || "-"}</span></p>
              </div>

              <div class="own-qr-box">
                <img
                  class="own-qr"
                  src="${getOwnQrImageUrl(order)}"
                  alt="QR ${order.order_code || ""}"
                />
                <div>QR الخاص بنا</div>
              </div>
            </div>

            <div class="mayar-secondary-data">
              <p><b>المنطقة:</b> ${order.customers?.areas?.name || "-"}</p>
              <p><b>العنوان:</b> ${order.customers?.address || "-"}</p>
              <p><b>المتجر:</b> ${order.stores?.name || "-"}</p>
              ${
                order.customers?.phone2
                  ? `<p><b>الهاتف 2:</b> ${order.customers.phone2}</p>`
                  : ""
              }
            </div>

            <div class="mayar-products">
              <div class="products-heading">المنتجات</div>
              ${buildOrderProductsHtml(order)}
            </div>
          </div>
        `
      )
      .join("");

    const courierOrders = ordersToPrint.filter((order) =>
      isPrivateTripoli(order)
    );

    const courierGroups = new Map<string, { courier: any; orders: any[] }>();

    courierOrders.forEach((order) => {
      const courier = order.couriers || null;
      const groupKey = String(order.courier_id || courier?.id || "default");
      const existing = courierGroups.get(groupKey);

      if (existing) {
        existing.orders.push(order);
      } else {
        courierGroups.set(groupKey, {
          courier: courier || { name: "المندوب 1", sort_order: 1 },
          orders: [order],
        });
      }
    });

    const sortedCourierGroups = Array.from(courierGroups.values()).sort(
      (a, b) =>
        Number(a.courier?.sort_order || 999) -
        Number(b.courier?.sort_order || 999)
    );

    const { day: printDay, date: printDate } = getPrintDayAndDate();

    const courierDocumentsHtml = sortedCourierGroups
      .map(({ courier, orders: groupOrders }) => {
        const courierRowsHtml = groupOrders
          .map((order) => {
            const finalAmount =
              Number(order.total_amount || 0) + getOrderShippingFee(order);

            return `
              <tr>
                <td class="code">${order.order_code || "-"}</td>
                <td class="phone">
                  <div class="courier-phone-list">
                    <span>${order.customers?.phone || "-"}</span>
                    ${
                      order.customers?.phone2
                        ? `<span>${order.customers.phone2}</span>`
                        : ""
                    }
                  </div>
                </td>
                <td class="area">${order.customers?.areas?.name || "-"}</td>
                <td class="money total-money">${finalAmount} د.ل</td>
                <td class="notes">${order.notes || ""}</td>
              </tr>
            `;
          })
          .join("");

        const courierTotalAmount = groupOrders.reduce((sum, order) => {
          return (
            sum +
            Number(order.total_amount || 0) +
            getOrderShippingFee(order)
          );
        }, 0);

        return `
          <section class="a4-document courier-document">
            <h1>ورقة المندوب - طرابلس خاصة</h1>
            <div class="courier-header-info">
              <span><b>المندوب:</b> ${courier?.name || "المندوب 1"}</span>
              <span><b>اليوم:</b> ${printDay}</span>
              <span><b>التاريخ:</b> ${printDate}</span>
            </div>
            <div class="courier-summary">
              <span>عدد الطلبات: ${groupOrders.length}</span>
              <span>إجمالي التحصيل: ${courierTotalAmount} د.ل</span>
            </div>

            <table class="courier-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>رقم الهاتف</th>
                  <th>المنطقة</th>
                  <th>الإجمالي</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>${courierRowsHtml}</tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const warehouseBody = `
      <h1>ورقة المخزن</h1>
      <p>عدد الطلبات: ${ordersToPrint.length}</p>
      <table>
        <thead>
          <tr>
            <th>الصورة</th>
            <th>المنتج</th>
            <th>الموديل</th>
            <th>اللون</th>
            <th>المقاس</th>
            <th>المطلوب</th>
          </tr>
        </thead>
        <tbody>${pickingRows}</tbody>
      </table>
    `;

    const preparationBody = `
      <h1>ورقة التجهيز</h1>
      <div class="orders-grid">${ordersHtml}</div>
    `;

    const labelsBody = `
      <div class="thermal-labels">
        ${privateLabelsHtml}
        ${mayarLabelsHtml}
      </div>
    `;

    const combinedA4Body = `
      <section class="a4-document">${warehouseBody}</section>
      <section class="a4-document">${preparationBody}</section>
      ${courierDocumentsHtml}
    `;

    const selectedBody =
      printMode === "a4"
        ? combinedA4Body
        : printMode === "warehouse"
          ? warehouseBody
          : printMode === "preparation"
            ? preparationBody
            : printMode === "courier"
              ? courierDocumentsHtml
              : labelsBody;

    const pageTitle =
      printMode === "a4"
        ? "مستندات التجهيز A4"
        : printMode === "warehouse"
          ? "ورقة المخزن"
          : printMode === "preparation"
            ? "ورقة التجهيز"
            : printMode === "courier"
              ? "ورقة المندوب"
              : "بوليصات الشحن";

    return `
      <!doctype html>
      <html dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${pageTitle}</title>
          <style>
            * { box-sizing: border-box; }

            body {
              font-family: Arial, sans-serif;
              direction: rtl;
              color: #111;
              margin: 0;
              padding: ${printMode === "labels" ? "0" : "10mm"};
            }

            h1 { margin: 0 0 20px; }

            .a4-document {
              page-break-after: always;
              break-after: page;
            }

            .a4-document:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #444; padding: 8px; text-align: right; }
            th { background: #eee; }
            img { width: 55px; height: 55px; object-fit: cover; }
            .qty { font-size: 20px; font-weight: bold; }

            .orders-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8mm 6mm;
              align-items: start;
            }

            .order-box {
              border: 1.5px solid #222;
              padding: 10px;
              margin: 0;
              page-break-inside: avoid;
              break-inside: avoid;
              min-height: 250px;
            }

            .order-box h3 {
              margin: 0 0 6px;
              font-size: 21px;
              direction: ltr;
              text-align: center;
              border-bottom: 1px solid #333;
              padding-bottom: 5px;
            }

            .order-box > p { margin: 4px 0; font-size: 13px; }

            .customer-data {
              display: grid;
              gap: 3px;
              padding-bottom: 7px;
              border-bottom: 1px solid #555;
            }

            .customer-data p {
              margin: 0;
              font-size: 13px;
              line-height: 1.35;
            }

            .phone-lines {
              direction: ltr;
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 2px;
              font-size: 13px;
              font-weight: 700;
            }

            .order-products-heading {
              margin-top: 7px;
              margin-bottom: 5px;
              font-size: 13px;
              font-weight: 900;
            }

            .order-products-list {
              display: grid;
              gap: 6px;
            }

            .order-item {
              display: flex;
              gap: 8px;
              align-items: center;
              margin: 0;
              border: 1px solid #888;
              border-radius: 4px;
              padding: 6px;
              page-break-inside: avoid;
              break-inside: avoid;
            }

            .order-item img {
              width: 54px;
              height: 54px;
              flex: 0 0 54px;
              border: 1px solid #bbb;
            }

            .order-item-details {
              min-width: 0;
              flex: 1;
            }

            .order-product-name {
              display: block;
              margin-bottom: 3px;
              font-size: 13px;
            }

            .order-item p {
              margin: 1px 0;
              font-size: 11px;
              line-height: 1.3;
            }

            .order-item-quantity {
              font-size: 12px !important;
              font-weight: 900;
            }

            .total {
              font-weight: bold;
              border-top: 1px solid #333;
              padding-top: 5px;
              margin-top: 7px !important;
            }

            .courier-header-info {
              display: flex;
              flex-wrap: wrap;
              justify-content: space-between;
              gap: 12px 24px;
              margin: 0 0 10px;
              padding: 10px 12px;
              border: 1px solid #444;
              font-size: 16px;
            }

            .courier-summary {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              margin: 8px 0 12px;
              font-size: 14px;
              font-weight: bold;
            }

            .courier-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 15px;
            }

            .courier-table th,
            .courier-table td {
              border: 1px solid #222;
              padding: 7px;
              overflow: visible;
              text-overflow: clip;
            }

            .courier-table th { background: #eee; font-size: 14px; }
            .courier-table .code {
              width: 13%;
              font-weight: bold;
              direction: ltr;
              text-align: center;
              font-size: 17px;
              white-space: nowrap;
            }

            .courier-table .phone {
              width: 26%;
              direction: ltr;
              text-align: center;
              font-size: 20px;
              font-weight: bold;
              white-space: nowrap;
              letter-spacing: 0.3px;
            }

            .courier-phone-list {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 3px;
              line-height: 1.15;
            }

            .courier-phone-list span {
              display: block;
              direction: ltr;
              white-space: nowrap;
            }

            .courier-table .area {
              width: 19%;
              font-size: 16px;
              white-space: normal;
            }

            .courier-table .money {
              width: 17%;
              direction: rtl;
              text-align: center;
              font-size: 18px;
              font-weight: bold;
              white-space: nowrap;
            }

            .courier-table .total-money {
              font-size: 21px;
              font-weight: 900;
            }

            .courier-table .notes {
              width: 25%;
              font-size: 14px;
              white-space: normal;
            }

            .thermal-labels { margin: 0; padding: 0; }

            .label {
              width: 100mm;
              height: 150mm;
              padding: 7mm;
              margin: 0;
              border: 0;
              page-break-after: always;
              break-after: page;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }

            .label:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .label-header-row {
              display: grid;
              grid-template-columns: 1fr 34mm;
              gap: 4mm;
              align-items: center;
            }

            .label-title {
              font-size: 17px;
              font-weight: 900;
            }

            .private-code {
              direction: ltr;
              font-size: 30px;
              font-weight: 900;
              margin-top: 2mm;
            }

            .private-main-data {
              border-top: 1px solid #555;
              border-bottom: 1px solid #555;
              margin-top: 3mm;
              padding: 2mm 0;
              font-size: 14px;
            }

            .private-main-data p { margin: 1.5mm 0; }

            .label-phone {
              direction: ltr;
              display: inline-block;
              font-size: 20px;
              font-weight: 900;
            }

            .private-products {
              margin-top: 3mm;
              font-size: 14px;
            }

            .products-heading {
              font-weight: 900;
              margin-bottom: 1.5mm;
            }

            .private-product-row,
            .label-products {
              display: flex;
              justify-content: space-between;
              gap: 3mm;
              border-top: 1px dashed #777;
              padding: 1.5mm 0;
            }

            .private-product-row {
              font-size: 14px;
            }

            .private-total {
              margin-top: auto;
              border: 3px solid #000;
              padding: 3mm;
              font-size: 18px;
              font-weight: 900;
              text-align: center;
            }

            .private-total span {
              direction: ltr;
              display: inline-block;
              font-size: 24px;
            }

            .mayar { gap: 3mm; }

            .mayar-caption {
              text-align: center;
              font-size: 16px;
              font-weight: 900;
            }

            .mayar-code-large {
              direction: ltr;
              text-align: center;
              font-size: 34px;
              line-height: 1.15;
              font-weight: 900;
              letter-spacing: 1px;
              border: 3px solid #000;
              padding: 3mm 2mm;
              overflow-wrap: anywhere;
            }

            .mayar-main-content {
              display: grid;
              grid-template-columns: 1fr 34mm;
              gap: 4mm;
              align-items: center;
            }

            .mayar-essential-data {
              font-size: 18px;
              line-height: 1.45;
            }

            .mayar-essential-data p { margin: 1.5mm 0; }

            .our-order-code {
              direction: ltr;
              display: inline-block;
              font-size: 22px;
              font-weight: 900;
            }

            .mayar-phone {
              direction: ltr;
              display: inline-block;
              font-size: 21px;
              font-weight: 900;
            }

            .own-qr-box {
              text-align: center;
              font-size: 10px;
              font-weight: bold;
            }

            .own-qr {
              width: 31mm;
              height: 31mm;
              object-fit: contain;
              display: block;
              margin: 0 auto 1mm;
            }

            .mayar-secondary-data {
              border-top: 1px solid #555;
              padding-top: 2mm;
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 1mm 4mm;
              font-size: 12px;
            }

            .mayar-secondary-data p { margin: 1mm 0; }

            .mayar-products {
              margin-top: auto;
              border-top: 1px solid #555;
              padding-top: 2mm;
              font-size: 12px;
            }

            .label-products {
              font-size: 12px;
            }

            @page {
              size: ${printMode === "labels" ? "100mm 150mm" : "A4"};
              margin: ${printMode === "labels" ? "0" : "7mm"};
            }
          </style>
        </head>

        <body>${selectedBody}</body>
      </html>
    `;
  }

  useEffect(() => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;

    if (!top || !table) return;

    const updateWidth = () => {
      setTableScrollWidth(table.scrollWidth || 1900);
    };

    updateWidth();

    const syncFromTop = () => {
      if (table.scrollLeft !== top.scrollLeft) {
        table.scrollLeft = top.scrollLeft;
      }
    };

    const syncFromTable = () => {
      if (top.scrollLeft !== table.scrollLeft) {
        top.scrollLeft = table.scrollLeft;
      }
    };

    top.addEventListener("scroll", syncFromTop);
    table.addEventListener("scroll", syncFromTable);
    window.addEventListener("resize", updateWidth);

    return () => {
      top.removeEventListener("scroll", syncFromTop);
      table.removeEventListener("scroll", syncFromTable);
      window.removeEventListener("resize", updateWidth);
    };
  }, [filteredOrders.length]);

  function waitForIframeImages(iframe: HTMLIFrameElement) {
    return new Promise<void>((resolve) => {
      const iframeDocument = iframe.contentDocument;

      if (!iframeDocument) {
        resolve();
        return;
      }

      const images = Array.from(iframeDocument.images || []);

      if (images.length === 0) {
        resolve();
        return;
      }

      let remaining = images.length;

      const finishOne = () => {
        remaining -= 1;

        if (remaining <= 0) {
          resolve();
        }
      };

      images.forEach((image) => {
        if (image.complete) {
          finishOne();
          return;
        }

        image.addEventListener("load", finishOne, { once: true });
        image.addEventListener("error", finishOne, { once: true });
      });

      window.setTimeout(resolve, 8000);
    });
  }

  async function printHtmlInsidePage(html: string) {
    return new Promise<void>(async (resolve, reject) => {
      const parser = new DOMParser();
      const parsedDocument = parser.parseFromString(html, "text/html");
      const printRoot = document.createElement("div");
      const documentStyles = Array.from(
        parsedDocument.head.querySelectorAll("style")
      )
        .map((style) => style.textContent || "")
        .join("\n");

      printRoot.id = "elzade-print-root";
      printRoot.setAttribute("dir", "rtl");
      printRoot.innerHTML = parsedDocument.body.innerHTML;

      const printStyle = document.createElement("style");
      printStyle.id = "elzade-print-style";
      printStyle.textContent = `
        ${documentStyles}

        #elzade-print-root {
          display: none;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body > *:not(#elzade-print-root) {
            display: none !important;
          }

          #elzade-print-root {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `;

      let finished = false;

      const cleanup = () => {
        window.removeEventListener("afterprint", finish);
        printRoot.remove();
        printStyle.remove();
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve();
      };

      try {
        document.head.appendChild(printStyle);
        document.body.appendChild(printRoot);

        const images = Array.from(printRoot.querySelectorAll("img"));

        await Promise.all(
          images.map(
            (image) =>
              new Promise<void>((done) => {
                if ((image as HTMLImageElement).complete) {
                  done();
                  return;
                }

                image.addEventListener("load", () => done(), { once: true });
                image.addEventListener("error", () => done(), { once: true });
              })
          )
        );

        if (document.fonts?.ready) {
          await document.fonts.ready;
        }

        await new Promise<void>((done) =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => done())
          )
        );

        window.addEventListener("afterprint", finish, { once: true });
        window.focus();
        window.print();

        window.setTimeout(finish, 1500);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  async function handleStartPreparing() {
    const ordersToProcess = filteredOrders.filter((order) =>
      isPrivateTripoli(order)
        ? order.status === "new"
        : order.mayar_status === "sent"
    );

    if (ordersToProcess.length === 0) {
      setMessage(
        "لا توجد طلبات جاهزة للطباعة. طلبات المعيار التي فشل إرسالها لا تطبع حتى يتم تصحيحها."
      );
      return;
    }

    const privateTripoliCount = ordersToProcess.filter((order) =>
      isPrivateTripoli(order)
    ).length;

    setPreparedPrintBatch({
      orders: ordersToProcess,
      a4Html: buildPrintHtml(ordersToProcess, "a4"),
      labelsHtml: buildPrintHtml(ordersToProcess, "labels"),
      ordersCount: ordersToProcess.length,
      privateTripoliCount,
      mayarCount: ordersToProcess.length - privateTripoliCount,
    });

    setA4PrintDialogCompleted(false);
    setLabelsPrintDialogCompleted(false);
    setMessage("تم تجهيز الطباعة. اطبع أوراق A4 ثم البوليصات.");
  }

  async function handlePrintA4() {
    if (!preparedPrintBatch || printingDocument || finalizingPrint) return;

    setPrintingDocument("a4");
    setMessage("جاري فتح نافذة طباعة أوراق A4...");

    try {
      await printHtmlInsidePage(preparedPrintBatch.a4Html);
      setA4PrintDialogCompleted(true);
      setMessage("تم إغلاق نافذة طباعة A4. اطبع البوليصات الآن.");
    } catch (printError: any) {
      setMessage(
        "تعذر فتح طباعة A4: " +
          (printError?.message || "خطأ غير معروف")
      );
    } finally {
      setPrintingDocument(null);
    }
  }

  async function handlePrintLabels() {
    if (!preparedPrintBatch || printingDocument || finalizingPrint) return;

    setPrintingDocument("labels");
    setMessage("جاري فتح نافذة طباعة البوليصات 100×150...");

    try {
      await printHtmlInsidePage(preparedPrintBatch.labelsHtml);
      setLabelsPrintDialogCompleted(true);
      setMessage(
        "تم إغلاق نافذة طباعة البوليصات. بعد التأكد من الطباعة اضغط تأكيد اكتمال الطباعة."
      );
    } catch (printError: any) {
      setMessage(
        "تعذر فتح طباعة البوليصات: " +
          (printError?.message || "خطأ غير معروف")
      );
    } finally {
      setPrintingDocument(null);
    }
  }

  async function handleConfirmPrinted() {
    if (!preparedPrintBatch || finalizingPrint) return;

    setFinalizingPrint(true);
    setMessage("جاري تحديث حالات الطلبات بعد تأكيد الطباعة...");

    try {
      for (const order of preparedPrintBatch.orders) {
        const privateTripoli = isPrivateTripoli(order);
        const shippingCompany = privateTripoli
          ? "private_tripoli"
          : "mayar";
        // طرابلس خاصة لا تعتبر مباعة عند بدء التجهيز.
        // بعد الطباعة تنتقل فقط إلى "جاري الشحن"، والتسوية المالية تتم
        // لاحقًا من صفحة طرابلس خاصة حسب نتيجة التوصيل الفعلية.
        const nextStatus = "shipped";

        const { error } = await supabase
          .from("orders")
          .update({
            status: nextStatus,
            shipping_company: shippingCompany,
            printed_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        if (error) {
          throw new Error(
            "حدث خطأ في تحديث الطلب " +
              (order.order_code || "") +
              ": " +
              error.message
          );
        }

      }

      setPreparedPrintBatch(null);
      setA4PrintDialogCompleted(false);
      setLabelsPrintDialogCompleted(false);
      setMessage(
        "تم تأكيد الطباعة وتحديث الحالات بنجاح. طلبات طرابلس خاصة أصبحت جاري الشحن دون أي حركة مالية."
      );
      await loadData();
    } catch (error: any) {
      setMessage(
        "توقفت عملية التحديث: " +
          (error?.message || "خطأ غير معروف")
      );
    } finally {
      setFinalizingPrint(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">الطلبات</h1>
          <p className="mt-2 text-neutral-400">
            مراجعة الطلبات قبل الطباعة وتسليمها للمناديب
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href="/private-tripoli"
            className="rounded-xl bg-purple-500 px-5 py-3 font-bold text-white"
          >
            طرابلس خاصة
          </a>

          <button
            onClick={handleStartPreparing}
            className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
          >
            بدء التجهيز
          </button>

          <a
            href="/orders/new"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            + إضافة طلب
          </a>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <input
          className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
          placeholder="بحث برقم الطلب / الاسم / الهاتف / المنتج"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        >
          <option value="">كل المتاجر</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">كل حالات الطلب</option>
          <option value="new">جديد</option>
          <option value="shipped">جاري الشحن</option>
          <option value="delivered">تم التسليم</option>
          <option value="partial_delivered">تسليم جزئي</option>
          <option value="returned">مرتجع</option>
        </select>

        <button
          onClick={() => {
            setSearch("");
            setStoreFilter("");
            setStatusFilter("");
          }}
          className="rounded-xl border border-neutral-700 p-4"
        >
          مسح الفلاتر
        </button>
      </div>

      {message && <p className="mb-4 text-yellow-400">{message}</p>}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
          جاهزة للطباعة: <b className="text-white">{printableOrdersVisible.length}</b>
        </div>
        <div className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
          فشل إرسال المعيار: <b className="text-red-400">{failedMayarOrdersVisible.length}</b>
        </div>
        <div className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
          الإجمالي الظاهر: <b className="text-white">{filteredOrders.length}</b>
        </div>
      </div>

      <div
        ref={topScrollRef}
        className="mb-2 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900"
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      <div ref={tableScrollRef} className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
        <table className="w-full min-w-[1900px] text-right">
          <thead className="bg-neutral-800 text-sm text-neutral-300">
            <tr>
              <th className="p-4">رقم الطلب</th>
              <th className="p-4">العميل</th>
              <th className="p-4">الهاتف</th>
              <th className="p-4">المدينة</th>
              <th className="p-4">المنتجات</th>
              <th className="p-4">المتجر</th>
              <th className="p-4">حالة الطلب</th>
              <th className="p-4">كود المعيار</th>
              <th className="p-4">خطأ المعيار</th>
              <th className="p-4">المبلغ</th>
              <th className="p-4">التاريخ</th>
              <th className="p-4">المحادثة</th>
              <th className="p-4">الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-neutral-400">
                  جاري تحميل الطلبات...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-neutral-400">
                  لا توجد طلبات
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="border-t border-neutral-800 align-top">
                  <td className="p-4 font-bold">{order.order_code}</td>

                  <td className="p-4">{order.customers?.name || "-"}</td>

                  <td className="p-4">
                    <div>
                      <p>{order.customers?.phone || "-"}</p>
                      {order.customers?.phone2 && (
                        <p className="text-sm text-neutral-400">
                          {order.customers.phone2}
                        </p>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    <div>
                      <p>{order.customers?.cities?.name || "-"}</p>
                      <p className="text-sm text-neutral-400">
                        {isPrivateTripoli(order) ? "مندوب خاص" : "المعيار"}
                      </p>
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="grid gap-3">
                      {(order.order_items || []).map((item: any) => {
                        const variant = item.product_variants;
                        const product = variant?.products;
                        const imageUrl = variant?.image_url || product?.main_image_url;

                        return (
                          <div key={item.id} className="flex items-center gap-3 rounded-xl bg-neutral-800 p-3">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                className="h-14 w-14 rounded-lg object-cover"
                                alt="product"
                              />
                            ) : (
                              <div className="h-14 w-14 rounded-lg bg-neutral-700" />
                            )}

                            <div>
                              <p className="font-bold">{product?.name || "-"}</p>
                              <p className="text-sm text-neutral-400">
                                {product?.model || "-"} / {variant?.color || "-"} / {variant?.size || "-"}
                              </p>
                              <p className="text-sm text-neutral-400">
                                الكمية: {item?.quantity || 0}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>

                  <td className="p-4">{order.stores?.name || "-"}</td>

                  <td className={`p-4 font-bold ${getOrderReviewStatusClass(order)}`}>
                    {getOrderReviewStatusText(order)}
                  </td>

                  <td className="p-4 font-bold" dir="ltr">
                    {isPrivateTripoli(order) ? "-" : getMayarCode(order)}
                  </td>

                  <td className="max-w-[220px] p-4 text-sm text-red-300">
                    {!isPrivateTripoli(order) && order.mayar_status === "failed"
                      ? order.mayar_error || "فشل الإرسال"
                      : "-"}
                  </td>

                  <td className="p-4">{order.total_amount} د.ل</td>

                  <td className="p-4">
                    {new Date(order.created_at).toLocaleDateString("ar-LY")}
                  </td>

                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      {order.customers?.meta_link ? (
                        <a
                          href={order.customers.meta_link}
                          target="_blank"
                          className="rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-bold"
                        >
                          Messenger
                        </a>
                      ) : (
                        <span className="rounded-lg bg-neutral-800 px-3 py-2 text-center text-sm text-neutral-500">
                          Messenger
                        </span>
                      )}

                      {order.customers?.whatsapp_link ? (
                        <a
                          href={order.customers.whatsapp_link}
                          target="_blank"
                          className="rounded-lg bg-green-600 px-3 py-2 text-center text-sm font-bold"
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span className="rounded-lg bg-neutral-800 px-3 py-2 text-center text-sm text-neutral-500">
                          WhatsApp
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => openEdit(order)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold"
                      >
                        تعديل
                      </button>

                      <button
                        onClick={() => setDeleteOrder(order)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {preparedPrintBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">الطباعة جاهزة</h2>
                <p className="mt-2 text-neutral-400">
                  اطبع أوراق A4 أولاً، ثم اطبع البوليصات 100×150.
                </p>
              </div>

              {!printingDocument && !finalizingPrint && (
                <button
                  type="button"
                  onClick={() => {
                    setPreparedPrintBatch(null);
                    setA4PrintDialogCompleted(false);
                    setLabelsPrintDialogCompleted(false);
                  }}
                  className="rounded-xl border border-neutral-700 px-4 py-2"
                >
                  إغلاق
                </button>
              )}
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-neutral-800 p-4 text-center">
                <p className="text-sm text-neutral-400">كل الطلبات</p>
                <p className="mt-1 text-2xl font-bold">
                  {preparedPrintBatch.ordersCount}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4 text-center">
                <p className="text-sm text-neutral-400">طرابلس خاصة</p>
                <p className="mt-1 text-2xl font-bold">
                  {preparedPrintBatch.privateTripoliCount}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4 text-center">
                <p className="text-sm text-neutral-400">المعيار</p>
                <p className="mt-1 text-2xl font-bold">
                  {preparedPrintBatch.mayarCount}
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-xl border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-300">
              <p>1. اضغط طباعة أوراق A4 واختر الطابعة العادية.</p>
              <p className="mt-2">2. اضغط طباعة البوليصات واختر طابعة 100×150.</p>
              <p className="mt-2">
                3. لا تتغير الحالات أو الأرصدة إلا بعد تأكيد اكتمال الطباعة.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handlePrintA4}
                disabled={Boolean(printingDocument) || finalizingPrint}
                className="rounded-xl bg-blue-500 p-4 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {printingDocument === "a4"
                  ? "جاري فتح طباعة A4..."
                  : a4PrintDialogCompleted
                    ? "إعادة طباعة أوراق A4 ✓"
                    : "طباعة أوراق A4"}
              </button>

              <button
                type="button"
                onClick={handlePrintLabels}
                disabled={Boolean(printingDocument) || finalizingPrint}
                className="rounded-xl bg-orange-500 p-4 text-lg font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {printingDocument === "labels"
                  ? "جاري فتح طباعة البوليصات..."
                  : labelsPrintDialogCompleted
                    ? "إعادة طباعة البوليصات ✓"
                    : "طباعة البوليصات 100×150"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleConfirmPrinted}
              disabled={
                finalizingPrint ||
                Boolean(printingDocument) ||
                !a4PrintDialogCompleted ||
                !labelsPrintDialogCompleted
              }
              className="mt-3 w-full rounded-xl bg-green-500 p-4 text-lg font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {finalizingPrint
                ? "جاري تحديث الطلبات..."
                : "تأكيد اكتمال الطباعة"}
            </button>

            {(!a4PrintDialogCompleted || !labelsPrintDialogCompleted) && (
              <p className="mt-3 text-center text-sm text-neutral-400">
                يصبح زر التأكيد متاحًا بعد فتح نافذتي طباعة A4 والبوليصات.
              </p>
            )}
          </div>
        </div>
      )}

      {editOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-8 w-full max-w-6xl rounded-2xl bg-neutral-900 p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">تعديل الطلب</h2>
                <p className="mt-1 text-neutral-400">{editOrder.order_code}</p>
              </div>

              <button
                onClick={() => setEditOrder(null)}
                className="rounded-xl border border-neutral-700 px-4 py-2"
              >
                إغلاق
              </button>
            </div>

            <div className="grid gap-8">
              <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input className="rounded-xl bg-neutral-800 p-4" placeholder="اسم العميل" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} />
                <input className="rounded-xl bg-neutral-800 p-4" placeholder="رقم الهاتف" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                <input className="rounded-xl bg-neutral-800 p-4" placeholder="رقم هاتف ثاني" value={editPhone2} onChange={(e) => setEditPhone2(e.target.value)} />
                <input className="rounded-xl bg-neutral-800 p-4" placeholder="رابط Messenger" value={editMetaLink} onChange={(e) => setEditMetaLink(e.target.value)} />
                <input className="rounded-xl bg-neutral-800 p-4" placeholder="رابط WhatsApp" value={editWhatsappLink} onChange={(e) => setEditWhatsappLink(e.target.value)} />

                <select
                  className="rounded-xl bg-neutral-800 p-4"
                  value={editStoreId}
                  onChange={(e) => {
                    setEditStoreId(e.target.value);
                    setEditSelectedProductKey("");
                    setEditSize("");
                  }}
                >
                  <option value="">اختر المتجر</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>

                <textarea className="rounded-xl bg-neutral-800 p-4 md:col-span-2" placeholder="ملاحظات" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </section>

              <section>
                <h3 className="mb-4 text-xl font-bold">تغيير أو إضافة منتج</h3>

                {editingCartVariantId && (
                  <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-500 bg-blue-950/40 p-4">
                    <p className="text-blue-200">
                      أنت الآن تعدل منتجًا موجودًا داخل الطلب. اختر اللون/المقاس الجديد ثم اضغط تطبيق التعديل.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingCartVariantId("");
                        setEditSelectedProductKey("");
                        setEditSize("");
                        setEditQuantity(1);
                      }}
                      className="rounded-lg border border-blue-400 px-3 py-2 text-sm"
                    >
                      إلغاء التعديل
                    </button>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-4">
                  {editProductCards.length === 0 ? (
                    <p className="text-neutral-400">لا توجد منتجات متوفرة لهذا المتجر</p>
                  ) : (
                    editProductCards.map((card) => (
                      <button
                        type="button"
                        key={card.key}
                        onClick={() => {
                          setEditSelectedProductKey(card.key);
                          setEditSize("");
                        }}
                        className={`rounded-2xl border p-3 text-right ${
                          editSelectedProductKey === card.key
                            ? "border-white bg-neutral-800"
                            : "border-neutral-800 bg-neutral-950"
                        }`}
                      >
                        {card.image ? (
                          <img
                            src={card.image}
                            className="mb-3 h-40 w-full rounded-xl object-cover"
                            alt="product"
                          />
                        ) : (
                          <div className="mb-3 flex h-40 items-center justify-center rounded-xl bg-neutral-800 text-neutral-500">
                            بدون صورة
                          </div>
                        )}

                        <p className="font-bold">{card.product?.name}</p>
                        <p className="text-sm text-neutral-400">{card.product?.model || "بدون موديل"}</p>
                        <p className="text-sm text-neutral-400">اللون: {card.color}</p>
                        <p className="text-sm text-neutral-400">المتوفر: {card.total_stock}</p>
                        <p className="mt-2 font-bold">{card.sale_price} د.ل</p>
                      </button>
                    ))
                  )}
                </div>

                {editSelectedCard && (
                  <div className="mt-4 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
                    <select
                      className="rounded-xl bg-neutral-800 p-4"
                      value={editSize}
                      onChange={(e) => setEditSize(e.target.value)}
                    >
                      <option value="">اختر المقاس</option>
                      {editAvailableSizes.map((v) => (
                        <option key={v.id} value={v.size}>
                          {v.size} - متوفر {getEditAvailableQuantity(v)}
                        </option>
                      ))}
                    </select>

                    <div>
                      <input
                        className="w-full rounded-xl bg-neutral-800 p-4"
                        type="number"
                        min="1"
                        placeholder="الكمية"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(Number(e.target.value))}
                      />

                      {editSelectedVariant && (
                        <p className="mt-2 text-sm text-neutral-400">
                          المتبقي بعد الطلب: {editSelectedAvailableQuantity}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={addProductToEditCart}
                      className="rounded-xl bg-white p-4 font-bold text-black"
                    >
                      {editingCartVariantId ? "تطبيق التعديل" : "+ إضافة إلى الطلب"}
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
                <h3 className="mb-4 text-xl font-bold">المنتجات داخل الطلب</h3>

                <div className="grid gap-3">
                  {editCart.map((item, index) => (
                    <div key={`${item.variant_id}-${index}`} className="flex items-center justify-between rounded-xl bg-neutral-800 p-4">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <img src={item.image_url} className="h-16 w-16 rounded-lg object-cover" alt="product" />
                        ) : (
                          <div className="h-16 w-16 rounded-lg bg-neutral-700" />
                        )}

                        <div>
                          <p className="font-bold">{item.product_name}</p>
                          <p className="text-sm text-neutral-400">
                            {item.model || "-"} / {item.color} / {item.size}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-sm text-neutral-300">
                            <span>السعر:</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              dir="ltr"
                              className="w-28 rounded-lg bg-neutral-950 px-3 py-2 text-left font-bold"
                              value={item.sale_price}
                              onChange={(event) =>
                                updateEditCartPrice(item.variant_id, event.target.value)
                              }
                            />
                            <span>د.ل</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          className="w-24 rounded-lg bg-neutral-900 p-3"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateEditCartQuantity(
                              item.variant_id,
                              Number(e.target.value)
                            )
                          }
                        />

                        <p className="w-28 font-bold">
                          {item.quantity * Number(item.sale_price)} د.ل
                        </p>

                        <button
                          type="button"
                          onClick={() => startEditCartItem(item)}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold"
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          onClick={() => removeFromEditCart(item.variant_id)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-neutral-700 pt-4">
                  <p className="text-xl font-bold">الإجمالي: {editTotalAmount} د.ل</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    التكلفة: {editTotalCost} د.ل
                  </p>
                </div>
              </section>

              <button
                onClick={handleSaveEdit}
                className="rounded-xl bg-white p-4 font-bold text-black"
              >
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 p-6">
            <h2 className="mb-3 text-2xl font-bold text-red-400">حذف الطلب</h2>
            <p className="mb-6 text-neutral-300">
              هل أنت متأكد من حذف {deleteOrder.order_code}؟ سيتم إرجاع المنتجات إلى المخزون تلقائيًا.
            </p>

            <div className="flex gap-3">
              <button onClick={handleDeleteOrder} className="flex-1 rounded-xl bg-red-600 p-3 font-bold">
                نعم، حذف
              </button>
              <button onClick={() => setDeleteOrder(null)} className="flex-1 rounded-xl border border-neutral-700 p-3">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
