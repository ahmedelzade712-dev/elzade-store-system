"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserProfile } from "@/lib/auth";

export default function NewOrderPage() {
  const [profile, setProfile] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [cityId, setCityId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [metaLink, setMetaLink] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [storeId, setStoreId] = useState("");

  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [shippingFeeInput, setShippingFeeInput] = useState("0");
  const [shippingFeeTouched, setShippingFeeTouched] = useState(false);
  const [isTrialOrder, setIsTrialOrder] = useState(false);
  const [mayarParcelType, setMayarParcelType] = useState<"full_delivery" | "exchange">("full_delivery");
  const [mayarSentPiecesCount, setMayarSentPiecesCount] = useState(1);
  const [mayarReturnPiecesCount, setMayarReturnPiecesCount] = useState(1);
  const [mayarOpenable, setMayarOpenable] = useState(true);
  const [exchangeOriginalCode, setExchangeOriginalCode] = useState("");
  const [exchangeOriginalOrder, setExchangeOriginalOrder] = useState<any>(null);
  const [exchangeReturnSelections, setExchangeReturnSelections] = useState<Record<string, number>>({});
  const [exchangeLookupLoading, setExchangeLookupLoading] = useState(false);

  function sortCitiesByPriority(citiesList: any[]) {
    function normalizeCityName(name: string) {
      return String(name || "")
        .replace(/[()]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, " ")
        .trim();
    }

    function getCityPriority(name: string) {
      const cityName = normalizeCityName(name);

      if (cityName.includes("طرابلس") && cityName.includes("خاصه")) return 1;
      if (cityName === "طرابلس") return 2;
      if (cityName.includes("بنغازي")) return 3;
      if (cityName.includes("مصراته")) return 4;
      if (cityName.includes("الزاويه")) return 5;
      if (cityName.includes("طبرق")) return 6;
      if (cityName.includes("البيضاء")) return 7;
      if (cityName.includes("اجدابيا")) return 8;
      if (cityName.includes("صبراته")) return 9;
      if (cityName.includes("صرمان")) return 10;
      if (cityName.includes("زواره")) return 11;
      if (cityName.includes("سبها")) return 12;
      if (cityName.includes("الخمس")) return 13;
      if (cityName.includes("زليتن")) return 14;
      if (cityName.includes("بني وليد")) return 15;
      if (cityName.includes("ترهونه")) return 16;
      if (cityName.includes("مسلاته")) return 17;
      if (cityName.includes("درنه")) return 18;

      return 999;
    }

    return [...citiesList].sort((a, b) => {
      const aPriority = getCityPriority(a.name);
      const bPriority = getCityPriority(b.name);

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    });
  }

  function getSizeSortValue(size: string) {
    const normalized = String(size || "").trim().toUpperCase();
    const order: Record<string, number> = {
      M: 1,
      L: 2,
      XL: 3,
      "2XL": 4,
      "3XL": 5,
    };

    return order[normalized] || 999;
  }

  function sortBySize(a: any, b: any) {
    const sizeDiff = getSizeSortValue(a.size) - getSizeSortValue(b.size);
    if (sizeDiff !== 0) return sizeDiff;

    return String(a.size || "").localeCompare(String(b.size || ""), "en");
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadData() {
      const result = await getCurrentUserProfile();

      if (result.error) {
        window.location.href = "/login";
        return;
      }

      setProfile(result.profile);

      const { data: storesData } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");

      const { data: citiesData, error: citiesError } = await supabase
        .from("cities")
        .select("id, name, mayar_zone_id")
        .order("name");

      if (citiesError) {
        setMessage("خطأ في تحميل المدن: " + citiesError.message);
        return;
      }

      const { data: areasData, error: areasError } = await supabase
        .from("areas")
        .select("id, name, city_id, mayar_subzone_id, is_active")
        .eq("is_active", true)
        .order("name");

      if (areasError) {
        setMessage("خطأ في تحميل المناطق: " + areasError.message);
        return;
      }

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
        .gt("stock_quantity", 0)
        .order("created_at", { ascending: false });

      const usableCities = (citiesData || []).filter(
        (city) =>
          city.name === "طرابلس (خاصة)" ||
          city.mayar_zone_id !== null
      );

      setStores(storesData || []);
      setCities(sortCitiesByPriority(usableCities));
      setAreas(areasData || []);
      setVariants(variantsData || []);
    }

    loadData();
  }, []);

  const productCards = useMemo(() => {
    const map = new Map<string, any>();

    variants
      .filter((v) => !storeId || v.store_id === storeId)
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

        const quantityInCart = cart
          .filter((item) => item.variant_id === v.id)
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

        map.get(key).total_stock +=
          Number(v.stock_quantity || 0) - quantityInCart;
      });

    return Array.from(map.values()).filter((card) => card.total_stock > 0);
  }, [variants, storeId, cart]);

  const selectedCard = productCards.find((p) => p.key === selectedProductKey);

  const availableSizes = variants
    .filter(
      (v) =>
        selectedCard &&
        v.product_id === selectedCard.product_id &&
        v.color === selectedCard.color &&
        v.stock_quantity > 0
    )
    .sort(sortBySize);

  function getCartQuantityForVariant(variantId: string) {
    return cart
      .filter((item) => item.variant_id === variantId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function getAvailableQuantity(variant: any) {
    const quantityInCart = getCartQuantityForVariant(variant.id);
    return Number(variant.stock_quantity || 0) - quantityInCart;
  }

  const selectedVariant = availableSizes.find((v) => v.size === size);
  const selectedAvailableQuantity = selectedVariant
    ? getAvailableQuantity(selectedVariant)
    : 0;

  const filteredCities = useMemo(() => {
    const term = citySearch.trim();

    if (!term) return cities;

    return cities.filter((city) =>
      String(city.name || "").includes(term)
    );
  }, [cities, citySearch]);

  const filteredAreas = useMemo(() => {
    const term = areaSearch.trim();
    const currentCity = cities.find((city) => city.id === cityId);
    const isPrivateTripoli =
      currentCity?.name === "طرابلس (خاصة)";

    return areas.filter((area) => {
      const matchesCity = Boolean(cityId) && area.city_id === cityId;
      const matchesSearch =
        !term || String(area.name || "").includes(term);

      const hasRequiredMayarLink =
        isPrivateTripoli || area.mayar_subzone_id !== null;

      return matchesCity && matchesSearch && hasRequiredMayarLink;
    });
  }, [areas, cities, cityId, areaSearch]);

  const selectedCity = cities.find((city) => city.id === cityId);
  const selectedArea = areas.find((area) => area.id === areaId);

  const isMayarShippingSelected = Boolean(cityId && selectedCity?.name !== "طرابلس (خاصة)");

  function isPrivateTripoliSelected() {
    const selectedCity = cities.find((city) => city.id === cityId);
    return selectedCity?.name === "طرابلس (خاصة)";
  }

  function getPrivateTripoliShippingFee() {
    if (!isPrivateTripoliSelected()) return 0;

    const selectedArea = areas.find((area) => area.id === areaId);
    const areaName = selectedArea?.name || "";

    if (["الخلة", "خلة الفرجان", "النجيلة"].includes(areaName)) {
      return 20;
    }

    return 15;
  }

  const defaultShippingFee = getPrivateTripoliShippingFee();
  const shippingFee = isPrivateTripoliSelected()
    ? Number(shippingFeeInput || 0)
    : 0;

  useEffect(() => {
    if (!isPrivateTripoliSelected()) {
      setShippingFeeInput("0");
      setShippingFeeTouched(false);
      return;
    }

    if (!shippingFeeTouched) {
      setShippingFeeInput(String(defaultShippingFee));
    }
  }, [cityId, areaId, defaultShippingFee, shippingFeeTouched]);

  function getTrialGroupKey(item: any) {
    return `${item.product_id}-${item.color}`;
  }

  function calculateTrialGroupedTotal(priceField: "sale_price" | "cost_price") {
    const groups = new Map<string, number>();

    cart.forEach((item) => {
      const groupKey = getTrialGroupKey(item);
      const currentPrice = Number(groups.get(groupKey) || 0);
      const itemPrice = Number(item[priceField] || 0);

      groups.set(groupKey, Math.max(currentPrice, itemPrice));
    });

    return Array.from(groups.values()).reduce((sum, price) => sum + price, 0);
  }

  const totalAmount =
    isTrialOrder && isPrivateTripoliSelected()
      ? calculateTrialGroupedTotal("sale_price")
      : cart.reduce(
          (sum, item) => sum + item.quantity * Number(item.sale_price || 0),
          0
        );

  const totalCost =
    isTrialOrder && isPrivateTripoliSelected()
      ? calculateTrialGroupedTotal("cost_price")
      : cart.reduce(
          (sum, item) => sum + item.quantity * Number(item.cost_price || 0),
          0
        );

  function getStoreLetter(storeName: string) {
    const normalized = (storeName || "").toLowerCase();

    if (normalized.includes("adora")) return "A";
    if (normalized.includes("aban")) return "B";
    if (normalized.includes("diana")) return "D";

    if (!mounted) {
    return null;
  }

  return (storeName || "X").trim().charAt(0).toUpperCase() || "X";
  }

  useEffect(() => {
    if (!isPrivateTripoliSelected() && isTrialOrder) {
      setIsTrialOrder(false);
    }
  }, [cityId, isTrialOrder]);

  useEffect(() => {
    if (!isMayarShippingSelected) {
      setMayarParcelType("full_delivery");
      setMayarSentPiecesCount(1);
      setMayarReturnPiecesCount(1);
      setMayarOpenable(true);
    }
  }, [isMayarShippingSelected]);


  async function generateOrderCode() {
    const selectedStore = stores.find((store) => store.id === storeId);
    const prefix = getStoreLetter(selectedStore?.name || "");

    const { data, error } = await supabase
      .from("orders")
      .select("order_code")
      .ilike("order_code", `${prefix}%`);

    if (error) {
      throw new Error(error.message);
    }

    const maxNumber = (data || []).reduce((max, order) => {
      const match = String(order.order_code || "").match(
        new RegExp(`^${prefix}(\\d+)$`)
      );

      if (!match) return max;

      const orderNumber = Number(match[1]);
      return orderNumber > max ? orderNumber : max;
    }, 0);

    const nextNumber = maxNumber + 1;
    const paddedNumber =
      nextNumber < 1000 ? String(nextNumber).padStart(3, "0") : String(nextNumber);

    return `${prefix}${paddedNumber}`;
  }

  function addToCart() {
    setMessage("");

    if (!selectedVariant) {
      setMessage("اختر المنتج والمقاس أولاً");
      return;
    }

    if (!quantity || quantity <= 0) {
      setMessage("الكمية غير صحيحة");
      return;
    }

    if (quantity > selectedAvailableQuantity) {
      setMessage(`الكمية المطلوبة أكبر من المتوفر. المتبقي الآن: ${selectedAvailableQuantity}`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find(
        (item) => item.variant_id === selectedVariant.id
      );

      if (existing) {
        const newQty = existing.quantity + quantity;

        if (quantity > selectedAvailableQuantity) {
          setMessage(`لا يمكن تجاوز الكمية المتوفرة. المتبقي الآن: ${selectedAvailableQuantity}`);
          return prev;
        }

        return prev.map((item) =>
          item.variant_id === selectedVariant.id
            ? { ...item, quantity: newQty }
            : item
        );
      }

      return [
        ...prev,
        {
          variant_id: selectedVariant.id,
          product_id: selectedVariant.product_id,
          product_name: selectedVariant.products?.name,
          model: selectedVariant.products?.model,
          color: selectedVariant.color,
          size: selectedVariant.size,
          image_url:
            selectedVariant.image_url ||
            selectedVariant.products?.main_image_url,
          quantity,
          stock_quantity: selectedVariant.stock_quantity,
          sale_price: selectedVariant.sale_price,
          cost_price: selectedVariant.cost_price,
        },
      ];
    });

    setSize("");
    setQuantity(1);
  }

  function updateCartItemPrice(variantId: string, value: string) {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = normalized === "" ? 0 : Number(normalized);

    setCart((prev) =>
      prev.map((item) =>
        item.variant_id === variantId
          ? { ...item, sale_price: Number.isFinite(parsed) ? parsed : 0 }
          : item
      )
    );
  }

  async function lookupExchangeOriginalOrder() {
    const code = exchangeOriginalCode.trim();

    if (!code) {
      setMessage("أدخل كود الطلب الأصلي المراد استبداله");
      return;
    }

    setExchangeLookupLoading(true);
    setMessage("");
    setExchangeOriginalOrder(null);
    setExchangeReturnSelections({});

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        status,
        store_id,
        mayar_parcel_type,
        customers(name, phone),
        order_items(
          id,
          variant_id,
          quantity,
          product_variants(
            id,
            color,
            size,
            products(name, model)
          )
        )
      `)
      .eq("order_code", code)
      .maybeSingle();

    setExchangeLookupLoading(false);

    if (error) {
      setMessage("خطأ في البحث عن الطلب الأصلي: " + error.message);
      return;
    }

    if (!data) {
      setMessage("لم يتم العثور على الطلب الأصلي");
      return;
    }

    if (data.store_id !== storeId) {
      setMessage("الطلب الأصلي يتبع متجرًا مختلفًا عن المتجر المحدد");
      return;
    }

    if (data.status !== "delivered") {
      setMessage("الطلب الأصلي يجب أن يكون طلب بيع تم تسليمه قبل إنشاء الاستبدال");
      return;
    }

    const { data: existingExchange, error: exchangeError } = await supabase
      .from("orders")
      .select("id, order_code, exchange_return_received")
      .eq("exchange_original_order_id", data.id)
      .eq("mayar_parcel_type", "exchange")
      .eq("exchange_return_received", false)
      .maybeSingle();

    if (exchangeError) {
      setMessage("خطأ في فحص عمليات الاستبدال السابقة: " + exchangeError.message);
      return;
    }

    if (existingExchange) {
      setMessage(`هذا الطلب مرتبط بالفعل باستبدال مفتوح: ${existingExchange.order_code}`);
      return;
    }

    setExchangeOriginalOrder(data);
    setMessage(`تم العثور على الطلب الأصلي ${data.order_code}. اختر القطعة التي ستعود من الزبونة.`);
  }

  function updateExchangeReturnQuantity(orderItemId: string, maxQuantity: number, value: string) {
    const quantityValue = Math.max(0, Math.min(maxQuantity, Number(value.replace(/\D/g, "") || 0)));

    setExchangeReturnSelections((prev) => ({
      ...prev,
      [orderItemId]: quantityValue,
    }));
  }

  function removeFromCart(variantId: string) {
    setCart((prev) => prev.filter((item) => item.variant_id !== variantId));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("جاري حفظ الطلب...");

    const cleanPhone = phone.replace(/\D/g, "");

    if (!phone || !storeId) {
      setMessage("يجب تعبئة رقم الهاتف والمتجر");
      return;
    }

    if (!/^09\d{8}$/.test(cleanPhone)) {
      setMessage("رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09 مثل 0921234567");
      return;
    }

    const { data: duplicateOrders, error: duplicateError } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        status,
        customers!inner(phone)
      `)
      .eq("customers.phone", cleanPhone)
      .eq("status", "new")
      .limit(1);

    if (duplicateError) {
      setMessage("خطأ في فحص الرقم المكرر: " + duplicateError.message);
      return;
    }

    if (duplicateOrders && duplicateOrders.length > 0) {
      setMessage(
        `هذا الرقم لديه طلب جديد سابق: ${duplicateOrders[0].order_code}. راجع صفحة الطلبات قبل إضافة طلب آخر.`
      );
      return;
    }

    if (isScheduled && !scheduledFor) {
      setMessage("اختر تاريخ تجهيز الطلب المؤجل");
      return;
    }

    if (cart.length === 0) {
      setMessage("يجب إضافة منتج واحد على الأقل إلى الطلب");
      return;
    }

    if (isTrialOrder && !isPrivateTripoliSelected()) {
      setMessage("طلب التجربة مسموح فقط لطلبات طرابلس (خاصة)");
      return;
    }

    if (!cityId) {
      setMessage("يجب اختيار المدينة");
      return;
    }

    if (!areaId) {
      setMessage("يجب اختيار المنطقة");
      return;
    }

    if (!selectedArea || selectedArea.city_id !== cityId) {
      setMessage("المنطقة المختارة لا تتبع المدينة الحالية. أعد اختيار المنطقة.");
      return;
    }

    if (isMayarShippingSelected) {
      if (!selectedCity?.mayar_zone_id) {
        setMessage("المدينة غير مرتبطة بمعرّف المعيار. أعد مزامنة المدن.");
        return;
      }

      if (!selectedArea?.mayar_subzone_id) {
        setMessage("المنطقة غير مرتبطة بمعرّف المعيار. أعد مزامنة المناطق.");
        return;
      }

      if (!mayarSentPiecesCount || mayarSentPiecesCount < 1) {
        setMessage("عدد القطع المرسلة يجب أن يكون 1 أو أكثر");
        return;
      }

      if (
        mayarParcelType === "exchange" &&
        (!mayarReturnPiecesCount || mayarReturnPiecesCount < 1)
      ) {
        setMessage("في طرد مقابل طرد يجب إدخال عدد القطع المسترجعة");
        return;
      }

      if (mayarParcelType === "exchange") {
        if (!exchangeOriginalOrder) {
          setMessage("ابحث عن الطلب الأصلي واختر القطعة المستبدلة أولاً");
          return;
        }

        const selectedReturnQuantity = Object.values(exchangeReturnSelections).reduce(
          (sum, value) => sum + Number(value || 0),
          0
        );

        if (selectedReturnQuantity < 1) {
          setMessage("اختر قطعة واحدة على الأقل ستعود من الطلب الأصلي");
          return;
        }

        if (selectedReturnQuantity !== Number(mayarReturnPiecesCount || 0)) {
          setMessage(
            `عدد القطع المختارة من الطلب الأصلي (${selectedReturnQuantity}) يجب أن يساوي عدد القطع المسترجعة للمعيار (${mayarReturnPiecesCount})`
          );
          return;
        }
      }
    }

    for (const item of cart) {
      const { data: currentVariant, error: currentVariantError } = await supabase
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", item.variant_id)
        .single();

      if (currentVariantError) {
        setMessage("خطأ في مراجعة المخزون: " + currentVariantError.message);
        return;
      }

      if (Number(currentVariant.stock_quantity || 0) < Number(item.quantity || 0)) {
        setMessage(
          `الكمية غير كافية للمنتج ${item.product_name} / ${item.color} / ${item.size}. المتوفر الآن: ${currentVariant.stock_quantity}`
        );
        return;
      }
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: customerName.trim() || "بدون اسم",
        phone: cleanPhone,
        phone2: phone2 || null,
        city_id: cityId || null,
        area_id: areaId || null,
        address,
        meta_link: metaLink || null,
        whatsapp_link: whatsappLink || null,
      })
      .select()
      .single();

    if (customerError) {
      setMessage("خطأ في حفظ العميل: " + customerError.message);
      return;
    }

    let orderCode = "";

    try {
      orderCode = await generateOrderCode();
    } catch (error: any) {
      setMessage("خطأ في إنشاء رقم الطلب: " + error.message);
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: storeId,
        customer_id: customer.id,
        order_code: orderCode,
        status: "new",
        is_trial_order: isTrialOrder && isPrivateTripoliSelected(),
        trial_status: isTrialOrder && isPrivateTripoliSelected() ? "open" : null,
        trial_due_at:
          isTrialOrder && isPrivateTripoliSelected()
            ? new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
            : null,
        total_amount:
          isMayarShippingSelected && mayarParcelType === "exchange"
            ? 0
            : totalAmount,
        total_cost: totalCost,
        shipping_fee: shippingFee,
        mayar_parcel_type: isMayarShippingSelected ? mayarParcelType : "full_delivery",
        mayar_sent_pieces_count: isMayarShippingSelected ? mayarSentPiecesCount : 1,
        mayar_return_pieces_count:
          isMayarShippingSelected && mayarParcelType === "exchange"
            ? mayarReturnPiecesCount
            : 0,
        mayar_openable: isMayarShippingSelected ? mayarOpenable : true,
        exchange_original_order_id:
          isMayarShippingSelected && mayarParcelType === "exchange"
            ? exchangeOriginalOrder?.id || null
            : null,
        exchange_return_received: false,
        scheduled_for: isScheduled && scheduledFor ? scheduledFor : null,
        notes,
        created_by: profile.id,
      })
      .select()
      .single();

    if (orderError) {
      setMessage("خطأ في حفظ الطلب: " + orderError.message);
      return;
    }

    for (const item of cart) {
      const { error: itemError } = await supabase.from("order_items").insert({
        order_id: order.id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price:
          isMayarShippingSelected && mayarParcelType === "exchange"
            ? 0
            : item.sale_price,
        unit_cost: item.cost_price,
        is_trial_item: isTrialOrder && isPrivateTripoliSelected(),
        trial_group_key:
          isTrialOrder && isPrivateTripoliSelected()
            ? getTrialGroupKey(item)
            : null,
        trial_kept: false,
      });

      if (itemError) {
        setMessage(
          "تم حفظ الطلب لكن حدث خطأ في أحد المنتجات: " + itemError.message
        );
        return;
      }

      const { data: freshVariant, error: freshVariantError } = await supabase
        .from("product_variants")
        .select("stock_quantity")
        .eq("id", item.variant_id)
        .single();

      if (freshVariantError) {
        setMessage(
          "تم حفظ الطلب لكن حدث خطأ في قراءة المخزون الحالي: " +
            freshVariantError.message
        );
        return;
      }

      const beforeQty = Number(freshVariant.stock_quantity || 0);
      const afterQty = beforeQty - Number(item.quantity || 0);

      if (afterQty < 0) {
        setMessage(
          `تم حفظ الطلب لكن الكمية أصبحت غير كافية للمنتج ${item.product_name} / ${item.color} / ${item.size}`
        );
        return;
      }

      const { error: stockError } = await supabase
        .from("product_variants")
        .update({ stock_quantity: afterQty })
        .eq("id", item.variant_id);

      if (stockError) {
        setMessage(
          "تم حفظ الطلب لكن حدث خطأ في خصم المخزون: " + stockError.message
        );
        return;
      }

      await supabase.from("inventory_movements").insert({
        variant_id: item.variant_id,
        movement_type: "sale",
        quantity_change: -item.quantity,
        quantity_before: beforeQty,
        quantity_after: afterQty,
        reason: `بيع - ${orderCode}`,
      });
    }

    if (isMayarShippingSelected && mayarParcelType === "exchange") {
      const originalItems = exchangeOriginalOrder?.order_items || [];
      const exchangeRows = originalItems
        .map((originalItem: any) => ({
          exchange_order_id: order.id,
          original_order_id: exchangeOriginalOrder.id,
          original_order_item_id: originalItem.id,
          variant_id: originalItem.variant_id,
          quantity: Number(exchangeReturnSelections[originalItem.id] || 0),
          inventory_restored: false,
        }))
        .filter((row: any) => row.quantity > 0);

      const { error: exchangeItemsError } = await supabase
        .from("order_exchange_return_items")
        .insert(exchangeRows);

      if (exchangeItemsError) {
        setMessage(
          "تم حفظ الطلب وخصم القطعة الجديدة، لكن فشل حفظ بيانات القطعة الراجعة: " +
            exchangeItemsError.message
        );
        return;
      }
    }

    let mayarMessage = "";

    if (isMayarShippingSelected) {
      setMessage("تم حفظ الطلب. جاري إرساله إلى شركة المعيار...");

      try {
        const mayarResponse = await fetch(
          `/api/mayar/send-order?code=${encodeURIComponent(orderCode)}`
        );

        const mayarResult = await mayarResponse.json();

        if (!mayarResponse.ok || !mayarResult.ok) {
          mayarMessage = ` تم حفظ الطلب لكن فشل الإرسال إلى المعيار: ${
            mayarResult.error || "خطأ غير معروف"
          }`;
        } else {
          const mayarCode =
            mayarResult.shipment?.code ||
            mayarResult.mayar_shipment_code ||
            mayarResult.mayar_code ||
            "";

          mayarMessage = mayarCode
            ? ` وتم إرساله إلى المعيار. كود المعيار: ${mayarCode}`
            : " وتم إرساله إلى المعيار.";
        }
      } catch (error: any) {
        mayarMessage =
          " تم حفظ الطلب لكن فشل الاتصال بخدمة إرسال المعيار: " +
          (error.message || "خطأ غير معروف");
      }
    }

    setCustomerName("");
    setPhone("");
    setPhone2("");
    setCityId("");
    setAreaId("");
    setCitySearch("");
    setAreaSearch("");
    setCityDropdownOpen(false);
    setAreaDropdownOpen(false);
    setAddress("");
    setMetaLink("");
    setWhatsappLink("");
    setSelectedProductKey("");
    setSize("");
    setQuantity(1);
    setCart([]);
    setNotes("");
    setIsScheduled(false);
    setScheduledFor("");
    setShippingFeeInput("0");
    setShippingFeeTouched(false);
    setIsTrialOrder(false);
    setMayarParcelType("full_delivery");
    setMayarSentPiecesCount(1);
    setMayarReturnPiecesCount(1);
    setMayarOpenable(true);
    setExchangeOriginalCode("");
    setExchangeOriginalOrder(null);
    setExchangeReturnSelections({});
    setExchangeLookupLoading(false);
    setMessage(`تم حفظ الطلب ${orderCode} بنجاح.${mayarMessage} يمكنك إدخال طلب جديد الآن.`);

    const { data: refreshedVariants } = await supabase
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
      .gt("stock_quantity", 0)
      .order("created_at", { ascending: false });

    setVariants(refreshedVariants || []);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">إضافة طلب جديد</h1>

        <a
          href="/orders"
          className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
        >
          الانتقال إلى صفحة الطلبات
        </a>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-8">
        <section className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
          <input
            className="w-full rounded-xl bg-neutral-900 p-4"
            placeholder="اسم العميل اختياري"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <input
            className="w-full rounded-xl bg-neutral-900 p-4"
            placeholder="رقم الهاتف"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            className="w-full rounded-xl bg-neutral-900 p-4"
            placeholder="رقم هاتف ثاني اختياري"
            dir="ltr"
            value={phone2}
            onChange={(e) => setPhone2(e.target.value)}
          />

          <div className="relative">
            <input
              className="w-full rounded-xl bg-neutral-900 p-4"
              placeholder="اختر المدينة أو ابحث مثل طر / بن / مص"
              value={citySearch || selectedCity?.name || ""}
              onFocus={() => {
                setCitySearch("");
                setCityDropdownOpen(true);
              }}
              onChange={(e) => {
                setCitySearch(e.target.value);
                setCityDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredCities.length > 0) {
                  e.preventDefault();
                  const city = filteredCities[0];

                  setCityId(city.id);
                  setCitySearch("");
                  setAreaId("");
                  setAreaSearch("");
                  setCityDropdownOpen(false);
                }
              }}
            />

            {cityDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
                {filteredCities.length === 0 ? (
                  <div className="p-4 text-neutral-400">لا توجد مدينة بهذا البحث</div>
                ) : (
                  filteredCities.map((city) => (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => {
                        setCityId(city.id);
                        setCitySearch("");
                        setAreaId("");
                        setAreaSearch("");
                        setShippingFeeTouched(false);
                        setCityDropdownOpen(false);
                      }}
                      className="block w-full border-b border-neutral-800 p-4 text-right hover:bg-neutral-800"
                    >
                      {city.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <input
              className="w-full rounded-xl bg-neutral-900 p-4 disabled:opacity-50"
              placeholder="اختر المنطقة التابعة للمدينة"
              value={areaSearch || selectedArea?.name || ""}
              onFocus={() => {
                if (cityId) {
                  setAreaSearch("");
                  setAreaDropdownOpen(true);
                }
              }}
              onChange={(e) => {
                setAreaSearch(e.target.value);
                if (cityId) setAreaDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredAreas.length > 0) {
                  e.preventDefault();
                  const area = filteredAreas[0];

                  setAreaId(area.id);
                  setAreaSearch("");
                  setAreaDropdownOpen(false);
                }
              }}
              disabled={!cityId}
            />

            {areaDropdownOpen && cityId && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
                {filteredAreas.length === 0 ? (
                  <div className="p-4 text-neutral-400">
                    لا توجد منطقة فعالة ومربوطة بهذه المدينة
                  </div>
                ) : (
                  filteredAreas.map((area) => (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => {
                        setAreaId(area.id);
                        setAreaSearch("");
                        setAreaDropdownOpen(false);
                      }}
                      className="block w-full border-b border-neutral-800 p-4 text-right hover:bg-neutral-800"
                    >
                      {area.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {isMayarShippingSelected && selectedCity && selectedArea && (
            <div className="rounded-xl border border-green-800 bg-green-950/30 p-4 text-sm text-green-200 md:col-span-2">
              تم ربط الوجهة مباشرة ببيانات المعيار:
              <span className="mx-2 font-bold">{selectedCity.name}</span>
              /
              <span className="mx-2 font-bold">{selectedArea.name}</span>
            </div>
          )}

          {isPrivateTripoliSelected() && (
            <div className="grid gap-2">
              <input
                className="w-full rounded-xl bg-neutral-900 p-4"
                type="text"
                dir="ltr"
                inputMode="numeric"
                placeholder="قيمة الشحن (د.ل)"
                value={shippingFeeInput}
                onChange={(e) => {
                  setShippingFeeTouched(true);
                  setShippingFeeInput(e.target.value.replace(/\D/g, ""));
                }}
              />

            </div>
          )}

          {isPrivateTripoliSelected() && (
            <label className="flex items-center gap-3 rounded-xl bg-neutral-900 p-4">
              <input
                type="checkbox"
                checked={isTrialOrder}
                onChange={(e) => setIsTrialOrder(e.target.checked)}
              />
              <span className="font-bold">طلب تجربة</span>
              <span className="text-sm text-neutral-400">
                يسمح بأكثر من مقاس/لون ويحسب سعر قطعة واحدة لكل لون
              </span>
            </label>
          )}

          {isTrialOrder && isPrivateTripoliSelected() && (
            <div className="rounded-xl border border-yellow-600 bg-yellow-950/40 p-4 text-sm text-yellow-100 md:col-span-2">
              تنبيه: سيتم خصم كل القطع المرسلة من المخزون مؤقتًا. بعد رجوع المنذوب افتح صفحة طلبات التجربة واختر القطع التي أخذها الزبون حتى يرجع النظام باقي المقاسات للمخزون.
            </div>
          )}

          <input
            className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
            placeholder="العنوان التفصيلي"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4"
            placeholder="رابط محادثة Messenger"
            dir="ltr"
            value={metaLink}
            onChange={(e) => setMetaLink(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4"
            placeholder="رابط WhatsApp"
            dir="ltr"
            value={whatsappLink}
            onChange={(e) => setWhatsappLink(e.target.value)}
          />

          <select
            className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setSelectedProductKey("");
              setSize("");
              setCart([]);
            }}
          >
            <option value="">اختر المتجر</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </section>

        {storeId && (
          <section>
            <h2 className="mb-4 text-xl font-bold">اختر المنتج من الصورة</h2>

            <div className="grid gap-4 md:grid-cols-4">
              {productCards.length === 0 ? (
                <p className="text-neutral-400">
                  لا توجد منتجات متوفرة لهذا المتجر
                </p>
              ) : (
                productCards.map((card) => (
                  <button
                    type="button"
                    key={card.key}
                    onClick={() => {
                      setSelectedProductKey(card.key);
                      setSize("");
                    }}
                    className={`rounded-2xl border p-3 text-right ${
                      selectedProductKey === card.key
                        ? "border-white bg-neutral-800"
                        : "border-neutral-800 bg-neutral-900"
                    }`}
                  >
                    {card.image ? (
                      <img
                        src={card.image}
                        className="mb-3 h-48 w-full rounded-xl object-cover"
                        alt="product"
                      />
                    ) : (
                      <div className="mb-3 flex h-48 items-center justify-center rounded-xl bg-neutral-800 text-neutral-500">
                        بدون صورة
                      </div>
                    )}

                    <p className="font-bold">{card.product?.name}</p>
                    <p className="text-sm text-neutral-400">
                      {card.product?.model || "بدون موديل"}
                    </p>
                    <p className="text-sm text-neutral-400">اللون: {card.color}</p>
                    <p className="text-sm text-neutral-400">
                      المتوفر: {card.total_stock}
                    </p>
                    <p className="mt-2 font-bold">{card.sale_price} د.ل</p>
                  </button>
                ))
              )}
            </div>
          </section>
        )}

        {selectedCard && (
          <section className="grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
            <select
              className="rounded-xl bg-neutral-900 p-4"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            >
              <option value="">اختر المقاس</option>
              {availableSizes
                .filter((v) => getAvailableQuantity(v) > 0)
                .map((v) => (
                  <option key={v.id} value={v.size}>
                    {v.size} - متوفر {getAvailableQuantity(v)}
                  </option>
                ))}
            </select>

            <div>
              <input
                className="w-full rounded-xl bg-neutral-900 p-4"
                type="text"
                  dir="ltr"
                  inputMode="numeric"
                min="1"
                placeholder="الكمية"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value.replace(/\D/g, "")))}
              />

              {selectedVariant && (
                <p className="mt-2 text-sm text-neutral-400">
                  المتبقي بعد السلة: {selectedAvailableQuantity}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={addToCart}
              className="rounded-xl bg-white p-4 font-bold text-black"
            >
              + إضافة إلى الطلب
            </button>
          </section>
        )}

        {cart.length > 0 && (
          <section className="max-w-5xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-xl font-bold">المنتجات داخل الطلب</h2>

            <div className="grid gap-3">
              {cart.map((item) => (
                <div
                  key={item.variant_id}
                  className="flex items-center justify-between rounded-xl bg-neutral-800 p-4"
                >
                  <div className="flex items-center gap-3">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        className="h-16 w-16 rounded-lg object-cover"
                        alt="product"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-neutral-700" />
                    )}

                    <div>
                      <p className="font-bold">{item.product_name}</p>
                      <p className="text-sm text-neutral-400">
                        {item.model || "-"} / {item.color} / {item.size}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
                        <span>الكمية: {item.quantity} ×</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          className="w-28 rounded-lg bg-neutral-950 px-3 py-2 text-left font-bold"
                          value={item.sale_price}
                          onChange={(event) =>
                            updateCartItemPrice(item.variant_id, event.target.value)
                          }
                          aria-label={`سعر ${item.product_name}`}
                        />
                        <span>د.ل</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <p className="font-bold">
                      {item.quantity * Number(item.sale_price)} د.ل
                    </p>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.variant_id)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-neutral-700 pt-4 text-xl font-bold">
              الإجمالي: {totalAmount} د.ل
            </div>
          </section>
        )}

        {isMayarShippingSelected && (
          <section className="max-w-5xl rounded-2xl border border-blue-700 bg-blue-950/30 p-6">
            <h2 className="mb-4 text-xl font-bold">إعدادات شحنة المعيار</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  نوع الطرد
                </label>
                <select
                  className="w-full rounded-xl bg-neutral-900 p-4"
                  value={mayarParcelType}
                  onChange={(e) => {
                    const value = e.target.value as "full_delivery" | "exchange";

                    setMayarParcelType(value);

                    if (value === "full_delivery") {
                      setMayarReturnPiecesCount(1);
                    }
                  }}
                >
                  <option value="full_delivery">تسليم كامل الطرد</option>
                  <option value="exchange">طرد مقابل طرد</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  فتح الطرد
                </label>
                <select
                  className="w-full rounded-xl bg-neutral-900 p-4"
                  value={mayarOpenable ? "yes" : "no"}
                  onChange={(e) => setMayarOpenable(e.target.value === "yes")}
                >
                  <option value="yes">مسموح بفتح الطرد</option>
                  <option value="no">غير مسموح بفتح الطرد</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-neutral-300">
                  عدد القطع المرسلة
                </label>
                <input
                  className="w-full rounded-xl bg-neutral-900 p-4"
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  value={mayarSentPiecesCount}
                  onChange={(e) =>
                    setMayarSentPiecesCount(
                      Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1))
                    )
                  }
                />
              </div>

              {mayarParcelType === "exchange" && (
                <div>
                  <label className="mb-2 block text-sm text-neutral-300">
                    عدد القطع المسترجعة من الزبون
                  </label>
                  <input
                    className="w-full rounded-xl bg-neutral-900 p-4"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    value={mayarReturnPiecesCount}
                    onChange={(e) =>
                      setMayarReturnPiecesCount(
                        Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1))
                      )
                    }
                  />
                </div>
              )}
            </div>

            {mayarParcelType === "exchange" && (
              <div className="mt-5 grid gap-4 rounded-xl border border-yellow-600 bg-yellow-950/40 p-5">
                <div>
                  <h3 className="font-bold text-yellow-100">بيانات الطلب الأصلي المستبدل</h3>
                  <p className="mt-1 text-sm text-yellow-200/80">
                    الاستبدال لا يغيّر الرصيد. القطعة الجديدة تخصم الآن، والقطعة القديمة تعود للمخزون فقط عند إدخال الطلب الأصلي في صفحة المرتجعات.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    className="rounded-xl bg-neutral-900 p-4"
                    dir="ltr"
                    placeholder="كود الطلب الأصلي مثل A011"
                    value={exchangeOriginalCode}
                    onChange={(event) => {
                      setExchangeOriginalCode(event.target.value);
                      setExchangeOriginalOrder(null);
                      setExchangeReturnSelections({});
                    }}
                  />
                  <button
                    type="button"
                    onClick={lookupExchangeOriginalOrder}
                    disabled={exchangeLookupLoading}
                    className="rounded-xl bg-yellow-500 px-5 py-4 font-bold text-black disabled:opacity-50"
                  >
                    {exchangeLookupLoading ? "جاري البحث..." : "بحث عن الطلب"}
                  </button>
                </div>

                {exchangeOriginalOrder && (
                  <div className="grid gap-3">
                    <div className="rounded-xl bg-neutral-900 p-4">
                      <p className="font-bold">
                        الطلب: <span dir="ltr">{exchangeOriginalOrder.order_code}</span>
                      </p>
                      <p className="text-sm text-neutral-400">
                        العميل: {exchangeOriginalOrder.customers?.name || "-"} — الهاتف: {exchangeOriginalOrder.customers?.phone || "-"}
                      </p>
                    </div>

                    {(exchangeOriginalOrder.order_items || []).map((originalItem: any) => {
                      const variant = originalItem.product_variants;
                      const product = variant?.products;

                      return (
                        <div
                          key={originalItem.id}
                          className="grid items-center gap-3 rounded-xl bg-neutral-900 p-4 md:grid-cols-[1fr_150px]"
                        >
                          <div>
                            <p className="font-bold">{product?.name || "-"}</p>
                            <p className="text-sm text-neutral-400">
                              {product?.model || "-"} / {variant?.color || "-"} / المقاس {variant?.size || "-"}
                            </p>
                            <p className="text-xs text-neutral-500">الكمية الأصلية: {originalItem.quantity}</p>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-neutral-400">الكمية الراجعة</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              className="w-full rounded-lg bg-neutral-800 p-3 text-left"
                              value={exchangeReturnSelections[originalItem.id] || 0}
                              onChange={(event) =>
                                updateExchangeReturnQuantity(
                                  originalItem.id,
                                  Number(originalItem.quantity || 0),
                                  event.target.value
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <div className="max-w-5xl rounded-xl bg-neutral-900 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isScheduled}
              onChange={(e) => setIsScheduled(e.target.checked)}
            />
            <span>طلب مؤجل</span>
          </label>

          {isScheduled && (
            <div className="mt-4">
              <label className="mb-2 block text-sm text-neutral-400">
                تاريخ تجهيز الطلبية
              </label>
              <input
                type="date"
                className="w-full rounded-xl bg-neutral-800 p-4"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          )}
        </div>

        <textarea
          className="max-w-5xl rounded-xl bg-neutral-900 p-4"
          placeholder="ملاحظات"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button className="max-w-5xl rounded-xl bg-white p-4 font-bold text-black">
          حفظ الطلب
        </button>

        {message && <p className="text-red-400">{message}</p>}
      </form>
    </main>
  );
}
