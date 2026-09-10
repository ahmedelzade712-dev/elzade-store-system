"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import EnglishDatePicker from "@/app/components/EnglishDatePicker";

const expenseCategories = [
  "إعلانات ممولة",
  "طباعة وتغليف",
  "شحن",
  "رواتب",
  "مكافآت",
  "صيانة",
  "إيجار",
  "اشتراكات",
  "أخرى",
];

function money(value: number) {
  return `${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} د.ل`;
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return dateInputValue(date);
}

function firstDayOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return dateInputValue(date);
}

function getRelatedOrder(transaction: any) {
  return Array.isArray(transaction.orders)
    ? transaction.orders[0]
    : transaction.orders;
}

function getOrderCode(transaction: any) {
  return getRelatedOrder(transaction)?.order_code || "—";
}

function getMayarCode(transaction: any) {
  const order = getRelatedOrder(transaction);
  const metadata = transaction?.metadata || {};

  return (
    order?.mayar_code ||
    metadata?.mayar_code ||
    metadata?.mayar_shipment_code ||
    "—"
  );
}

function displayDescription(transaction: any) {
  const description = String(transaction.description || "").trim();

  if (
    transaction.reversed_transaction_id ||
    description.includes("حركة عكسية")
  ) {
    return description.replace(/حركة عكسية/g, "طلبية مرتجعة") ||
      "طلبية مرتجعة";
  }

  return description || "—";
}

function displayMovementType(transaction: any) {
  if (
    transaction.reversed_transaction_id ||
    String(transaction.description || "").includes("حركة عكسية")
  ) {
    return "طلبية مرتجعة";
  }

  if (transaction.transaction_type === "sale") return "مبيعات";
  if (transaction.transaction_type === "courier_reward")
    return "مكافأة مندوب";
  if (transaction.transaction_type === "expense")
    return transaction.category || "مصروف";
  if (transaction.transaction_type === "adjustment")
    return transaction.direction === "credit" ? "إضافة يدوية" : "خصم يدوي";

  return transaction.category || transaction.transaction_type || "حركة مالية";
}

function asOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "غير مسجل";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير مسجل";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function orderStatusText(status: string) {
  if (status === "delivered") return "تم التسليم";
  if (status === "partial_delivered") return "تسليم جزئي";
  return status || "—";
}

function orderPieces(order: any) {
  return (order.order_items || []).reduce(
    (sum: number, item: any) => sum + Number(item.quantity || 0),
    0
  );
}

function inferPartialDeliveredPieces(order: any): number | null {
  if (order.status !== "partial_delivered") return orderPieces(order);

  const targetCost = Number(order.total_cost || 0);
  const units: number[] = [];

  for (const item of order.order_items || []) {
    const qty = Math.max(0, Math.trunc(Number(item.quantity || 0)));
    const unitCost = Number(item.unit_cost || 0);

    for (let i = 0; i < qty; i += 1) {
      units.push(unitCost);
    }
  }

  if (units.length === 0) return 0;

  const scale = 100;
  const target = Math.round(targetCost * scale);
  const costs = units.map((value) => Math.round(value * scale));

  const possible = new Map<number, Set<number>>();
  possible.set(0, new Set([0]));

  for (const cost of costs) {
    const snapshot = Array.from(possible.entries()).map(
      ([sum, counts]) => [sum, new Set(counts)] as const
    );

    for (const [sum, counts] of snapshot) {
      const nextSum = sum + cost;
      const nextCounts = possible.get(nextSum) || new Set<number>();

      for (const count of counts) {
        nextCounts.add(count + 1);
      }

      possible.set(nextSum, nextCounts);
    }
  }

  const counts = possible.get(target);

  if (!counts || counts.size !== 1) return null;
  return Array.from(counts)[0];
}

export default function FinancialReportsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [storeFilter, setStoreFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showAddMovement, setShowAddMovement] = useState(false);
  const [movementDirection, setMovementDirection] = useState<"debit" | "credit">(
    "debit"
  );
  const [movementCategory, setMovementCategory] = useState(
    expenseCategories[0]
  );
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementStoreId, setMovementStoreId] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [showBalanceDetails, setShowBalanceDetails] = useState(false);
  const [showManualExpensesDetails, setShowManualExpensesDetails] =
    useState(false);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [showCapitalDetails, setShowCapitalDetails] = useState(false);
  const [showOrdersDetails, setShowOrdersDetails] = useState(false);
  const [showOrderSearch, setShowOrderSearch] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [storeDetails, setStoreDetails] = useState<{
    storeId: string;
    type: "balance" | "expenses" | "orders";
  } | null>(null);

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

    if (result.profile?.role !== "admin") {
      window.location.href = "/";
      return;
    }

    setProfile(result.profile);

    const [
      { data: storesData, error: storesError },
      { data: transactionsData, error: transactionsError },
      { data: variantsData, error: variantsError },
      { data: completedOrdersData, error: completedOrdersError },
    ] = await Promise.all([
      supabase.from("stores").select("id, name").order("name"),
      supabase
        .from("financial_transactions")
        .select(`
          id,
          store_id,
          order_id,
          transaction_type,
          direction,
          category,
          amount,
          description,
          source_key,
          is_system_generated,
          reversed_transaction_id,
          metadata,
          occurred_at,
          created_at,
          stores(id, name),
          orders(
            id,
            order_code,
            status,
            created_at,
            mayar_code,
            mayar_shipment_code,
            mayar_live_status_name,
            mayar_status_updated_at,
            total_amount,
            total_cost,
            order_items(quantity, unit_price, unit_cost)
          )
        `)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select(`
          id,
          store_id,
          stock_quantity,
          cost_price,
          stores(id, name)
        `)
        .eq("is_active", true),
      supabase
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
          created_at,
          mayar_code,
          mayar_shipment_code,
          mayar_live_status_name,
          mayar_status_updated_at,
          stores(id, name),
          couriers(id, name),
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
            variant_id,
            quantity,
            unit_price,
            unit_cost,
            product_variants(
              id,
              color,
              size,
              products(id, name, model)
            )
          )
        `)
        .in("status", ["delivered", "partial_delivered"])
        .order("created_at", { ascending: false }),
    ]);

    if (storesError) {
      setMessage("خطأ في تحميل المتاجر: " + storesError.message);
    } else if (transactionsError) {
      setMessage("خطأ في تحميل الحركات المالية: " + transactionsError.message);
    } else if (variantsError) {
      setMessage("خطأ في تحميل رأس المال: " + variantsError.message);
    } else if (completedOrdersError) {
      setMessage("خطأ في تحميل الطلبات المسلمة: " + completedOrdersError.message);
    } else {
      setStores(storesData || []);
      setTransactions(transactionsData || []);
      setVariants(variantsData || []);
      setCompletedOrders(completedOrdersData || []);
    }

    setLoading(false);
  }

  function transactionDateMatches(transaction: any) {
    const date = String(transaction.occurred_at || "").slice(0, 10);

    return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter(
      (transaction) =>
        transactionDateMatches(transaction) &&
        (!storeFilter || transaction.store_id === storeFilter)
    );
  }, [transactions, storeFilter, dateFrom, dateTo]);

  const allTimeBalance = useMemo(() => {
    return transactions
      .filter(
        (transaction) => !storeFilter || transaction.store_id === storeFilter
      )
      .reduce((sum, transaction) => {
        const amount = Number(transaction.amount || 0);
        return sum + (transaction.direction === "credit" ? amount : -amount);
      }, 0);
  }, [transactions, storeFilter]);

  const periodCourierRewards = filteredTransactions
    .filter(
      (transaction) =>
        transaction.transaction_type === "courier_reward" &&
        transaction.direction === "debit"
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  const manualExpenseTransactions = useMemo(
    () =>
      filteredTransactions.filter(
        (transaction) =>
          transaction.direction === "debit" &&
          transaction.is_system_generated === false
      ),
    [filteredTransactions]
  );

  const periodExpenses = manualExpenseTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0
  );

  const balanceTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          !storeFilter || transaction.store_id === storeFilter
      ),
    [transactions, storeFilter]
  );

  const balanceRows = useMemo(() => {
    let runningBalance = 0;

    return [...balanceTransactions]
      .sort(
        (a, b) =>
          new Date(a.occurred_at).getTime() -
          new Date(b.occurred_at).getTime()
      )
      .map((transaction) => {
        const amount = Number(transaction.amount || 0);
        runningBalance +=
          transaction.direction === "credit" ? amount : -amount;

        return {
          ...transaction,
          runningBalance,
        };
      })
      .reverse();
  }, [balanceTransactions]);

  const currentCapital = variants
    .filter((variant) => !storeFilter || variant.store_id === storeFilter)
    .reduce(
      (sum, variant) =>
        sum +
        Number(variant.stock_quantity || 0) *
          Number(variant.cost_price || 0),
      0
    );

  const currentStockPieces = variants
    .filter((variant) => !storeFilter || variant.store_id === storeFilter)
    .reduce(
      (sum, variant) => sum + Number(variant.stock_quantity || 0),
      0
    );

  function orderTransactions(orderId: string) {
    return transactions.filter((transaction) => transaction.order_id === orderId);
  }

  function creditedAmountForOrder(orderId: string) {
    return orderTransactions(orderId)
      .filter(
        (transaction) =>
          transaction.transaction_type === "sale" &&
          transaction.direction === "credit"
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  }

  function debitedAmountForOrder(orderId: string) {
    return orderTransactions(orderId)
      .filter((transaction) => transaction.direction === "debit")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  }

  function deliveryTimeForOrder(order: any) {
    const mayarStatus = String(order.mayar_live_status_name || "");

    if (
      order.mayar_status_updated_at &&
      mayarStatus.includes("تم التسليم")
    ) {
      return order.mayar_status_updated_at;
    }

    const deliveryMovements = orderTransactions(order.id).filter((transaction) => {
      const source = String(transaction.source_key || "");
      const metadata = transaction.metadata || {};

      if (metadata.payment_type === "bank_transfer") return false;

      return (
        source.includes("private_tripoli_sale") ||
        source.includes("private_tripoli_courier_reward") ||
        source.includes("mayar_sale") ||
        source.includes("mayar_delivery") ||
        source.includes("courier_reward")
      );
    });

    if (deliveryMovements.length === 0) return null;

    return [...deliveryMovements].sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    )[0].occurred_at;
  }

  const completedOrdersWithMetrics = useMemo(() => {
    return completedOrders.map((order) => ({
      ...order,
      creditedAmount: creditedAmountForOrder(order.id),
      debitedAmount: debitedAmountForOrder(order.id),
      deliveredPieces: inferPartialDeliveredPieces(order),
      deliveryTime: deliveryTimeForOrder(order),
    }));
  }, [completedOrders, transactions]);

  const creditedCompletedOrders = completedOrdersWithMetrics.filter(
    (order) => Number(order.creditedAmount || 0) > 0
  );

  const totalCompletedOrders = creditedCompletedOrders.length;

  const knownDeliveredPieces = creditedCompletedOrders.reduce(
    (sum, order) =>
      sum +
      (typeof order.deliveredPieces === "number" ? order.deliveredPieces : 0),
    0
  );

  const unresolvedPartialOrders = creditedCompletedOrders.filter(
    (order) =>
      order.status === "partial_delivered" &&
      order.deliveredPieces === null
  ).length;

  const storesReport = useMemo(() => {
    return stores.map((store) => {
      const storeTransactions = transactions.filter(
        (transaction) => transaction.store_id === store.id
      );

      const balance = storeTransactions.reduce((sum, transaction) => {
        const amount = Number(transaction.amount || 0);
        return sum + (transaction.direction === "credit" ? amount : -amount);
      }, 0);

      const capital = variants
        .filter((variant) => variant.store_id === store.id)
        .reduce(
          (sum, variant) =>
            sum +
            Number(variant.stock_quantity || 0) *
              Number(variant.cost_price || 0),
          0
        );

      const stockPieces = variants
        .filter((variant) => variant.store_id === store.id)
        .reduce(
          (sum, variant) => sum + Number(variant.stock_quantity || 0),
          0
        );

      const orders = creditedCompletedOrders.filter(
        (order) => order.store_id === store.id
      );

      const deliveredPieces = orders.reduce(
        (sum, order) =>
          sum +
          (typeof order.deliveredPieces === "number"
            ? order.deliveredPieces
            : 0),
        0
      );

      const unresolvedPartials = orders.filter(
        (order) =>
          order.status === "partial_delivered" &&
          order.deliveredPieces === null
      ).length;

      const expenses = storeTransactions
        .filter(
          (transaction) =>
            transaction.direction === "debit" &&
            transaction.is_system_generated === false
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      return {
        ...store,
        balance,
        capital,
        stockPieces,
        orders,
        ordersCount: orders.length,
        deliveredPieces,
        unresolvedPartials,
        expenses,
      };
    });
  }, [stores, transactions, variants, completedOrdersWithMetrics]);

  const searchedOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();

    if (!term) return creditedCompletedOrders;

    return creditedCompletedOrders.filter((order) =>
      String(order.order_code || "").toLowerCase().includes(term)
    );
  }, [completedOrdersWithMetrics, orderSearch]);

  const selectedStoreReport = storeDetails
    ? storesReport.find((store) => store.id === storeDetails.storeId)
    : null;

  async function addFinancialMovement() {
    const amount = Number(movementAmount);

    if (!amount || amount <= 0) {
      setMessage("أدخل قيمة صحيحة أكبر من صفر");
      return;
    }

    if (!movementDescription.trim()) {
      setMessage("اكتب سبب الحركة المالية");
      return;
    }

    setSavingMovement(true);
    setMessage("");

    const transactionType =
      movementDirection === "debit" ? "expense" : "adjustment";

    const sourceKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `manual:${crypto.randomUUID()}`
        : `manual:${Date.now()}:${Math.random()}`;

    const { error } = await supabase.from("financial_transactions").insert({
      store_id: movementStoreId || null,
      order_id: null,
      transaction_type: transactionType,
      direction: movementDirection,
      category: movementCategory,
      amount,
      description: movementDescription.trim(),
      source_key: sourceKey,
      is_system_generated: false,
      metadata: {
        added_from: "financial_reports",
      },
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      setMessage("خطأ في حفظ الحركة المالية: " + error.message);
      setSavingMovement(false);
      return;
    }

    setMovementAmount("");
    setMovementDescription("");
    setMovementStoreId("");
    setMovementDirection("debit");
    setMovementCategory(expenseCategories[0]);
    setShowAddMovement(false);
    setMessage("تم تسجيل الحركة المالية بنجاح");
    setSavingMovement(false);
    await loadData();
  }

  function setPreset(period: "today" | "yesterday" | "month" | "year" | "all") {
    const now = new Date();

    if (period === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (period === "today") {
      const today = dateInputValue(now);
      setDateFrom(today);
      setDateTo(today);
      return;
    }

    if (period === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const value = dateInputValue(yesterday);
      setDateFrom(value);
      setDateTo(value);
      return;
    }

    if (period === "month") {
      setDateFrom(
        dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
      );
      setDateTo(dateInputValue(now));
      return;
    }

    setDateFrom(dateInputValue(new Date(now.getFullYear(), 0, 1)));
    setDateTo(dateInputValue(now));
  }

  if (!profile) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-neutral-950 text-white"
      >
        جاري التحميل...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">التقارير المالية</h1>
          <p className="mt-2 text-neutral-400">
            الرصيد الحالي، المصروفات، مكافآت المناديب، رأس مال المخزون والطلبات المسلمة
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowOrderSearch(true)}
            className="rounded-xl border border-blue-600 px-5 py-3 font-bold text-blue-200"
          >
            بحث عن طلب
          </button>

          <button
            onClick={() => setShowAddMovement(true)}
            className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
          >
            + إضافة حركة مالية
          </button>

          <button
            onClick={loadData}
            className="rounded-xl border border-neutral-700 px-5 py-3 font-bold"
          >
            تحديث
          </button>

          <a
            href="/"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            لوحة التحكم
          </a>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => setShowBalanceDetails(true)}
          className="rounded-2xl border border-green-800 bg-green-950/30 p-5 text-right transition hover:border-green-500 hover:bg-green-950/50"
        >
          <p className="text-sm text-green-300">الرصيد الحالي</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(allTimeBalance)}
          </p>
          <p className="mt-3 text-xs text-green-400">اضغط لعرض التفاصيل</p>
        </button>

        <button
          type="button"
          onClick={() => setShowManualExpensesDetails(true)}
          className="rounded-2xl border border-red-800 bg-red-950/30 p-5 text-right transition hover:border-red-500 hover:bg-red-950/50"
        >
          <p className="text-sm text-red-300">المصروفات والخصومات</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(periodExpenses)}
          </p>
          <p className="mt-3 text-xs text-red-400">اضغط لعرض التفاصيل</p>
        </button>

        <div className="rounded-2xl border border-orange-800 bg-orange-950/30 p-5">
          <p className="text-sm text-orange-300">مكافآت المناديب</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(periodCourierRewards)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCapitalDetails(true)}
          className="rounded-2xl border border-yellow-800 bg-yellow-950/30 p-5 text-right transition hover:border-yellow-500"
        >
          <p className="text-sm text-yellow-300">رأس مال المخزون</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(currentCapital)}
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            {currentStockPieces} قطعة موجودة
          </p>
          <p className="mt-3 text-xs text-yellow-400">اضغط لعرض المتاجر</p>
        </button>

        <button
          type="button"
          onClick={() => setShowOrdersDetails(true)}
          className="rounded-2xl border border-blue-800 bg-blue-950/30 p-5 text-right transition hover:border-blue-500"
        >
          <p className="text-sm text-blue-300">الطلبات المسلمة</p>
          <p className="mt-2 text-2xl font-black">{totalCompletedOrders} طلب</p>
          <p className="mt-1 font-bold">{knownDeliveredPieces} قطعة مؤكدة</p>
          {unresolvedPartialOrders > 0 && (
            <p className="mt-1 text-xs text-yellow-300">
              {unresolvedPartialOrders} طلب جزئي لا يمكن تحديد عدد قطعه بدقة من البيانات الحالية
            </p>
          )}
          <p className="mt-3 text-xs text-blue-400">اضغط لعرض الطلبات</p>
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setPreset("today")}
            className="rounded-lg border border-neutral-700 px-4 py-2"
          >
            اليوم
          </button>
          <button
            onClick={() => setPreset("yesterday")}
            className="rounded-lg border border-neutral-700 px-4 py-2"
          >
            أمس
          </button>
          <button
            onClick={() => setPreset("month")}
            className="rounded-lg border border-neutral-700 px-4 py-2"
          >
            هذا الشهر
          </button>
          <button
            onClick={() => setPreset("year")}
            className="rounded-lg border border-neutral-700 px-4 py-2"
          >
            هذه السنة
          </button>
          <button
            onClick={() => setPreset("all")}
            className="rounded-lg border border-neutral-700 px-4 py-2"
          >
            كل الوقت
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-xl bg-neutral-800 p-4"
            value={storeFilter}
            onChange={(event) => setStoreFilter(event.target.value)}
          >
            <option value="">كل المتاجر</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>

          <EnglishDatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="DD/MM/YYYY"
          />

          <EnglishDatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="DD/MM/YYYY"
          />
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          الفترة الزمنية تؤثر على المصروفات ومكافآت المناديب وسجل الحركات فقط. الرصيد ورأس المال وبيانات المتاجر لحظية لكل الوقت.
        </p>
      </div>

      {message && <p className="mb-5 text-yellow-400">{message}</p>}

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-bold">المتاجر</h2>

        <div className="grid gap-4 xl:grid-cols-3">
          {storesReport.map((store) => (
            <div
              key={store.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <h3 className="mb-5 text-xl font-bold">{store.name}</h3>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setStoreDetails({ storeId: store.id, type: "balance" })
                  }
                  className="rounded-xl bg-neutral-800 p-3 text-right transition hover:bg-neutral-700"
                >
                  <p className="text-neutral-400">الرصيد الحالي</p>
                  <p className="mt-1 font-bold text-green-300">
                    {money(store.balance)}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">عرض التفاصيل</p>
                </button>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">رأس مال المخزون</p>
                  <p className="mt-1 font-bold">{money(store.capital)}</p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setStoreDetails({ storeId: store.id, type: "orders" })
                  }
                  className="rounded-xl bg-neutral-800 p-3 text-right transition hover:bg-neutral-700"
                >
                  <p className="text-neutral-400">عدد الطلبات المسلمة</p>
                  <p className="mt-1 font-bold">{store.ordersCount} طلب</p>
                  <p className="mt-2 text-xs text-neutral-500">عرض الطلبات</p>
                </button>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">القطع المسلمة المؤكدة</p>
                  <p className="mt-1 font-bold">{store.deliveredPieces} قطعة</p>
                  {store.unresolvedPartials > 0 && (
                    <p className="mt-1 text-xs text-yellow-300">
                      + {store.unresolvedPartials} طلب جزئي غير محسوم بالعدد
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setStoreDetails({ storeId: store.id, type: "expenses" })
                  }
                  className="rounded-xl bg-neutral-800 p-3 text-right transition hover:bg-neutral-700"
                >
                  <p className="text-neutral-400">المصروفات</p>
                  <p className="mt-1 font-bold text-red-300">
                    {money(store.expenses)}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">عرض التفاصيل</p>
                </button>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">قطع المخزون الحالية</p>
                  <p className="mt-1 font-bold">{store.stockPieces} قطعة</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">سجل الحركات المالية</h2>

        <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
          <table className="w-full min-w-[1300px] text-right">
            <thead className="bg-neutral-800 text-sm text-neutral-300">
              <tr>
                <th className="p-4">التاريخ والوقت</th>
                <th className="p-4">المتجر</th>
                <th className="p-4">الاتجاه</th>
                <th className="p-4">التصنيف</th>
                <th className="p-4">السبب</th>
                <th className="p-4">كود المعيار</th>
                <th className="p-4">القيمة</th>
                <th className="p-4">المصدر</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-400">
                    جاري تحميل التقرير...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-400">
                    لا توجد حركات مالية ضمن الفترة المحددة
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-t border-neutral-800"
                  >
                    <td className="p-4">
                      {new Date(transaction.occurred_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </td>
                    <td className="p-4">
                      {transaction.stores?.name || "عام"}
                    </td>
                    <td
                      className={`p-4 font-bold ${
                        transaction.direction === "credit"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {transaction.direction === "credit" ? "إضافة" : "خصم"}
                    </td>
                    <td className="p-4">{transaction.category}</td>
                    <td className="p-4">{displayDescription(transaction)}</td>
                    <td dir="ltr" className="p-4 text-right font-bold">
                      {getMayarCode(transaction)}
                    </td>
                    <td className="p-4 font-black">
                      {transaction.direction === "credit" ? "+" : "-"}
                      {money(transaction.amount)}
                    </td>
                    <td className="p-4 text-sm text-neutral-400">
                      {transaction.is_system_generated
                        ? "تلقائي"
                        : "إدخال يدوي"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>


      {showCapitalDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-5xl rounded-2xl border border-yellow-900 bg-neutral-950 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">رأس مال المخزون</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  القيمة الحالية للمخزون حسب سعر التكلفة
                </p>
              </div>
              <button
                onClick={() => setShowCapitalDetails(false)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-4">
                <p className="text-yellow-300">رأس المال الكلي</p>
                <p className="mt-1 text-3xl font-black">
                  {money(storesReport.reduce((sum, store) => sum + store.capital, 0))}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
                <p className="text-neutral-300">إجمالي قطع المخزون</p>
                <p className="mt-1 text-3xl font-black">
                  {storesReport.reduce((sum, store) => sum + store.stockPieces, 0)} قطعة
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {storesReport.map((store) => (
                <div key={store.id} className="rounded-xl bg-neutral-900 p-4">
                  <h3 className="mb-3 text-lg font-bold">{store.name}</h3>
                  <p className="text-neutral-400">رأس المال</p>
                  <p className="font-black">{money(store.capital)}</p>
                  <p className="mt-3 text-neutral-400">عدد القطع الموجودة</p>
                  <p className="font-black">{store.stockPieces} قطعة</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showOrdersDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-7xl rounded-2xl border border-blue-900 bg-neutral-950 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">الطلبات المسلمة</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  يعرض فقط الطلبات بحالة تم التسليم أو تسليم جزئي
                </p>
              </div>
              <button
                onClick={() => setShowOrdersDetails(false)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full min-w-[1500px] text-right">
                <thead className="bg-neutral-900 text-sm text-neutral-300">
                  <tr>
                    <th className="p-4">كود الطلب</th>
                    <th className="p-4">المتجر</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">العميل</th>
                    <th className="p-4">القطع المسلمة</th>
                    <th className="p-4">دخل إلى الرصيد</th>
                    <th className="p-4">تاريخ الإنشاء</th>
                    <th className="p-4">وقت التسليم</th>
                    <th className="p-4">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {creditedCompletedOrders.map((order) => (
                    <tr key={order.id} className="border-t border-neutral-800">
                      <td dir="ltr" className="p-4 text-right font-black">{order.order_code}</td>
                      <td className="p-4">{asOne(order.stores)?.name || "—"}</td>
                      <td className="p-4">{orderStatusText(order.status)}</td>
                      <td className="p-4">{asOne(order.customers)?.name || "—"}</td>
                      <td className="p-4 font-bold">
                        {typeof order.deliveredPieces === "number"
                          ? `${order.deliveredPieces} قطعة`
                          : "غير محدد بدقة"}
                      </td>
                      <td className="p-4 font-black text-green-300">
                        {money(order.creditedAmount)}
                      </td>
                      <td className="p-4">{formatDateTime(order.created_at)}</td>
                      <td className="p-4">{formatDateTime(order.deliveryTime)}</td>
                      <td className="p-4">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="rounded-lg bg-blue-600 px-3 py-2 font-bold"
                        >
                          فتح
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showOrderSearch && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-5xl rounded-2xl border border-blue-900 bg-neutral-950 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">بحث عن طلب مسلم</h2>
              <button
                onClick={() => {
                  setShowOrderSearch(false);
                  setOrderSearch("");
                }}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <input
              dir="ltr"
              className="mb-5 w-full rounded-xl bg-neutral-900 p-4 text-left"
              placeholder="مثال: A423"
              value={orderSearch}
              onChange={(event) => setOrderSearch(event.target.value)}
            />

            <div className="grid gap-3">
              {searchedOrders.length === 0 ? (
                <p className="rounded-xl bg-neutral-900 p-5 text-neutral-400">
                  لا يوجد طلب مسلم بهذا الكود
                </p>
              ) : (
                searchedOrders.slice(0, 30).map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-right transition hover:border-blue-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span dir="ltr" className="text-xl font-black">{order.order_code}</span>
                      <span>{orderStatusText(order.status)}</span>
                    </div>
                    <p className="mt-2 text-neutral-400">
                      {asOne(order.stores)?.name || "—"} — {asOne(order.customers)?.name || "—"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 p-4">
          <div className="mx-auto my-6 w-full max-w-6xl rounded-2xl border border-neutral-700 bg-neutral-950 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 dir="ltr" className="text-right text-3xl font-black">
                  {selectedOrder.order_code}
                </h2>
                <p className="mt-1 text-neutral-400">{orderStatusText(selectedOrder.status)}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">المتجر</p>
                <p className="mt-1 font-bold">{asOne(selectedOrder.stores)?.name || "—"}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">تاريخ إنشاء الطلب</p>
                <p className="mt-1 font-bold">{formatDateTime(selectedOrder.created_at)}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">وقت التسليم</p>
                <p className="mt-1 font-bold">{formatDateTime(selectedOrder.deliveryTime)}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">المندوب</p>
                <p className="mt-1 font-bold">{asOne(selectedOrder.couriers)?.name || "—"}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">القيمة التي دخلت الرصيد</p>
                <p className="mt-1 font-black text-green-300">{money(selectedOrder.creditedAmount)}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">الخصومات المرتبطة بالطلب</p>
                <p className="mt-1 font-black text-red-300">{money(selectedOrder.debitedAmount)}</p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">القطع المسلمة</p>
                <p className="mt-1 font-black">
                  {typeof selectedOrder.deliveredPieces === "number"
                    ? `${selectedOrder.deliveredPieces} قطعة`
                    : "غير محدد بدقة"}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">كود المعيار</p>
                <p dir="ltr" className="mt-1 text-right font-bold">
                  {selectedOrder.mayar_code || selectedOrder.mayar_shipment_code || "—"}
                </p>
              </div>
            </div>

            <div className="mb-5 rounded-2xl bg-neutral-900 p-5">
              <h3 className="mb-3 text-xl font-bold">بيانات العميل</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <p>الاسم: <b>{asOne(selectedOrder.customers)?.name || "—"}</b></p>
                <p dir="ltr" className="text-right">الهاتف: <b>{asOne(selectedOrder.customers)?.phone || "—"}</b></p>
                <p>المدينة: <b>{asOne(asOne(selectedOrder.customers)?.cities)?.name || "—"}</b></p>
                <p>المنطقة: <b>{asOne(asOne(selectedOrder.customers)?.areas)?.name || "—"}</b></p>
                <p className="md:col-span-2">العنوان: <b>{asOne(selectedOrder.customers)?.address || "—"}</b></p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full min-w-[900px] text-right">
                <thead className="bg-neutral-900 text-neutral-300">
                  <tr>
                    <th className="p-4">المنتج</th>
                    <th className="p-4">اللون</th>
                    <th className="p-4">المقاس</th>
                    <th className="p-4">الكمية في الطلب</th>
                    <th className="p-4">سعر الوحدة</th>
                    <th className="p-4">تكلفة الوحدة</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.order_items || []).map((item: any) => {
                    const variant = asOne(item.product_variants);
                    const product = asOne(variant?.products);

                    return (
                      <tr key={item.id} className="border-t border-neutral-800">
                        <td className="p-4">
                          {product?.name || "—"}
                          {product?.model ? ` — ${product.model}` : ""}
                        </td>
                        <td className="p-4">{variant?.color || "—"}</td>
                        <td className="p-4">{variant?.size || "—"}</td>
                        <td className="p-4">{Number(item.quantity || 0)}</td>
                        <td className="p-4">{money(Number(item.unit_price || 0))}</td>
                        <td className="p-4">{money(Number(item.unit_cost || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedOrder.notes && (
              <div className="mt-5 rounded-xl bg-neutral-900 p-4">
                <p className="text-neutral-400">ملاحظات الطلب</p>
                <p className="mt-1 font-bold">{selectedOrder.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {storeDetails && selectedStoreReport && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-7xl rounded-2xl border border-neutral-700 bg-neutral-950 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{selectedStoreReport.name}</h2>
                <p className="text-neutral-400">
                  {storeDetails.type === "balance"
                    ? "تفاصيل الرصيد"
                    : storeDetails.type === "expenses"
                      ? "تفاصيل المصروفات"
                      : "الطلبات المسلمة"}
                </p>
              </div>
              <button
                onClick={() => setStoreDetails(null)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            {storeDetails.type === "balance" && (
              <div className="grid gap-3">
                <div className="rounded-xl bg-green-950/30 p-4">
                  <p className="text-green-300">الرصيد الحالي</p>
                  <p className="text-3xl font-black">{money(selectedStoreReport.balance)}</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-neutral-800">
                  <table className="w-full min-w-[1000px] text-right">
                    <thead className="bg-neutral-900">
                      <tr>
                        <th className="p-4">الوقت</th>
                        <th className="p-4">كود الطلب</th>
                        <th className="p-4">البيان</th>
                        <th className="p-4">إضافة</th>
                        <th className="p-4">خصم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions
                        .filter((transaction) => transaction.store_id === selectedStoreReport.id)
                        .map((transaction) => (
                          <tr key={transaction.id} className="border-t border-neutral-800">
                            <td className="p-4">{formatDateTime(transaction.occurred_at)}</td>
                            <td dir="ltr" className="p-4 text-right">{getOrderCode(transaction)}</td>
                            <td className="p-4">{displayDescription(transaction)}</td>
                            <td className="p-4 text-green-300">
                              {transaction.direction === "credit" ? money(transaction.amount) : "—"}
                            </td>
                            <td className="p-4 text-red-300">
                              {transaction.direction === "debit" ? money(transaction.amount) : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {storeDetails.type === "expenses" && (
              <div className="grid gap-3">
                <div className="rounded-xl bg-red-950/30 p-4">
                  <p className="text-red-300">إجمالي المصروفات</p>
                  <p className="text-3xl font-black">{money(selectedStoreReport.expenses)}</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-neutral-800">
                  <table className="w-full min-w-[800px] text-right">
                    <thead className="bg-neutral-900">
                      <tr>
                        <th className="p-4">الوقت</th>
                        <th className="p-4">التصنيف</th>
                        <th className="p-4">البيان</th>
                        <th className="p-4">القيمة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions
                        .filter(
                          (transaction) =>
                            transaction.store_id === selectedStoreReport.id &&
                            transaction.direction === "debit" &&
                            transaction.is_system_generated === false
                        )
                        .map((transaction) => (
                          <tr key={transaction.id} className="border-t border-neutral-800">
                            <td className="p-4">{formatDateTime(transaction.occurred_at)}</td>
                            <td className="p-4">{transaction.category || "—"}</td>
                            <td className="p-4">{displayDescription(transaction)}</td>
                            <td className="p-4 text-red-300">{money(transaction.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {storeDetails.type === "orders" && (
              <div className="grid gap-3">
                {selectedStoreReport.orders.length === 0 ? (
                  <p className="rounded-xl bg-neutral-900 p-5 text-neutral-400">
                    لا توجد طلبات مسلمة
                  </p>
                ) : (
                  selectedStoreReport.orders.map((order: any) => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-right"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span dir="ltr" className="text-xl font-black">{order.order_code}</span>
                        <span>{orderStatusText(order.status)}</span>
                        <span>
                          {typeof order.deliveredPieces === "number"
                            ? `${order.deliveredPieces} قطعة`
                            : "العدد غير محدد بدقة"}
                        </span>
                        <span className="text-green-300">{money(order.creditedAmount)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showBalanceDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-7xl rounded-2xl border border-green-900 bg-neutral-950 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">تفاصيل الرصيد الحالي</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  جميع الحركات التي أثرت على الرصيد للمتجر المحدد، من الأحدث إلى الأقدم
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBalanceDetails(false)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-green-800 bg-green-950/30 p-4">
              <p className="text-sm text-green-300">الرصيد الحالي</p>
              <p dir="ltr" className="mt-1 text-3xl font-black text-right">
                {money(allTimeBalance)}
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full min-w-[1250px] text-right">
                <thead className="bg-neutral-900 text-sm text-neutral-300">
                  <tr>
                    <th className="p-4">التاريخ والوقت</th>
                    <th className="p-4">المتجر</th>
                    <th className="p-4">نوع الحركة</th>
                    <th className="p-4">كود الطلب</th>
                    <th className="p-4">كود المعيار</th>
                    <th className="p-4">البيان</th>
                    <th className="p-4">إضافة</th>
                    <th className="p-4">خصم</th>
                    <th className="p-4">الرصيد بعد الحركة</th>
                    <th className="p-4">المصدر</th>
                  </tr>
                </thead>

                <tbody>
                  {balanceRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="p-8 text-center text-neutral-400"
                      >
                        لا توجد حركات مالية
                      </td>
                    </tr>
                  ) : (
                    balanceRows.map((transaction) => (
                      <tr
                        key={`balance-${transaction.id}`}
                        className="border-t border-neutral-800"
                      >
                        <td className="whitespace-nowrap p-4">
                          {new Date(transaction.occurred_at).toLocaleString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            }
                          )}
                        </td>
                        <td className="p-4">
                          {transaction.stores?.name || "عام"}
                        </td>
                        <td className="p-4 font-bold">
                          {displayMovementType(transaction)}
                        </td>
                        <td dir="ltr" className="p-4 text-right font-bold">
                          {getOrderCode(transaction)}
                        </td>
                        <td dir="ltr" className="p-4 text-right font-bold">
                          {getMayarCode(transaction)}
                        </td>
                        <td className="p-4">
                          {displayDescription(transaction)}
                        </td>
                        <td className="p-4 font-black text-green-400">
                          {transaction.direction === "credit"
                            ? `+${money(transaction.amount)}`
                            : "—"}
                        </td>
                        <td className="p-4 font-black text-red-400">
                          {transaction.direction === "debit"
                            ? `-${money(transaction.amount)}`
                            : "—"}
                        </td>
                        <td
                          dir="ltr"
                          className={`p-4 text-right font-black ${
                            transaction.runningBalance >= 0
                              ? "text-green-300"
                              : "text-red-300"
                          }`}
                        >
                          {money(transaction.runningBalance)}
                        </td>
                        <td className="p-4 text-sm text-neutral-400">
                          {transaction.is_system_generated
                            ? "تلقائي"
                            : "إدخال يدوي"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showManualExpensesDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-6 w-full max-w-6xl rounded-2xl border border-red-900 bg-neutral-950 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">
                  تفاصيل المصروفات والخصومات
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  يعرض فقط الحركات اليدوية التي أُدخلت ضمن الفترة المحددة
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowManualExpensesDetails(false)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-bold"
              >
                إغلاق
              </button>
            </div>

            <div className="mb-5 rounded-xl border border-red-800 bg-red-950/30 p-4">
              <p className="text-sm text-red-300">
                إجمالي المصروفات والخصومات
              </p>
              <p dir="ltr" className="mt-1 text-3xl font-black text-right">
                {money(periodExpenses)}
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="w-full min-w-[1000px] text-right">
                <thead className="bg-neutral-900 text-sm text-neutral-300">
                  <tr>
                    <th className="p-4">التاريخ والوقت</th>
                    <th className="p-4">المتجر</th>
                    <th className="p-4">التصنيف</th>
                    <th className="p-4">البيان</th>
                    <th className="p-4">القيمة</th>
                  </tr>
                </thead>

                <tbody>
                  {manualExpenseTransactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-neutral-400"
                      >
                        لا توجد مصروفات أو خصومات يدوية ضمن الفترة المحددة
                      </td>
                    </tr>
                  ) : (
                    manualExpenseTransactions.map((transaction) => (
                      <tr
                        key={`manual-expense-${transaction.id}`}
                        className="border-t border-neutral-800"
                      >
                        <td className="whitespace-nowrap p-4">
                          {new Date(transaction.occurred_at).toLocaleString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            }
                          )}
                        </td>
                        <td className="p-4">
                          {transaction.stores?.name || "عام"}
                        </td>
                        <td className="p-4 font-bold">
                          {transaction.category || "أخرى"}
                        </td>
                        <td className="p-4">
                          {displayDescription(transaction)}
                        </td>
                        <td
                          dir="ltr"
                          className="p-4 text-right font-black text-red-400"
                        >
                          -{money(transaction.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showAddMovement && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-6 w-full max-w-xl rounded-2xl bg-neutral-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">إضافة حركة مالية</h2>
              <button
                onClick={() => setShowAddMovement(false)}
                className="rounded-lg border border-neutral-700 px-3 py-2"
              >
                إغلاق
              </button>
            </div>

            <div className="grid gap-4">
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={movementDirection}
                onChange={(event) =>
                  setMovementDirection(
                    event.target.value as "debit" | "credit"
                  )
                }
              >
                <option value="debit">خصم من الرصيد</option>
                <option value="credit">إضافة إلى الرصيد</option>
              </select>

              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={movementStoreId}
                onChange={(event) => setMovementStoreId(event.target.value)}
              >
                <option value="">عام لكل المتاجر</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={movementCategory}
                onChange={(event) => setMovementCategory(event.target.value)}
              >
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                className="rounded-xl bg-neutral-800 p-4 text-left"
                placeholder="القيمة"
                value={movementAmount}
                onChange={(event) => {
                  const cleanedValue = event.target.value
                    .replace(/[^0-9.]/g, "")
                    .replace(/(\..*)\./g, "$1");

                  setMovementAmount(cleanedValue);
                }}
              />

              <textarea
                className="min-h-28 rounded-xl bg-neutral-800 p-4"
                placeholder="السبب أو الوصف"
                value={movementDescription}
                onChange={(event) =>
                  setMovementDescription(event.target.value)
                }
              />

              <button
                onClick={addFinancialMovement}
                disabled={savingMovement}
                className="rounded-xl bg-white p-4 font-bold text-black disabled:opacity-50"
              >
                {savingMovement ? "جاري الحفظ..." : "حفظ الحركة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
