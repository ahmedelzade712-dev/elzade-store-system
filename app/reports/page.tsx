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
            mayar_code,
            total_amount,
            total_cost,
            order_items(quantity)
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
    ]);

    if (storesError) {
      setMessage("خطأ في تحميل المتاجر: " + storesError.message);
    } else if (transactionsError) {
      setMessage("خطأ في تحميل الحركات المالية: " + transactionsError.message);
    } else if (variantsError) {
      setMessage("خطأ في تحميل رأس المال: " + variantsError.message);
    } else {
      setStores(storesData || []);
      setTransactions(transactionsData || []);
      setVariants(variantsData || []);
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

  const periodSalesTransactions = useMemo(
    () =>
      filteredTransactions.filter(
        (transaction) =>
          transaction.transaction_type === "sale" &&
          transaction.direction === "credit"
      ),
    [filteredTransactions]
  );

  const periodSales = periodSalesTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount || 0),
    0
  );

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

  const uniqueSoldOrders = useMemo(() => {
    const map = new Map<string, any>();

    periodSalesTransactions.forEach((transaction) => {
      const order = Array.isArray(transaction.orders)
        ? transaction.orders[0]
        : transaction.orders;

      if (order?.id) {
        map.set(order.id, order);
      }
    });

    return Array.from(map.values());
  }, [periodSalesTransactions]);

  const soldOrdersCount = uniqueSoldOrders.length;

  const soldPiecesCount = uniqueSoldOrders.reduce((sum, order) => {
    return (
      sum +
      (order.order_items || []).reduce(
        (itemsSum: number, item: any) =>
          itemsSum + Number(item.quantity || 0),
        0
      )
    );
  }, 0);

  const goodsCost = uniqueSoldOrders.reduce(
    (sum, order) => sum + Number(order.total_cost || 0),
    0
  );

  const periodProfit = periodSales - goodsCost - periodCourierRewards;

  const currentCapital = variants
    .filter((variant) => !storeFilter || variant.store_id === storeFilter)
    .reduce(
      (sum, variant) =>
        sum +
        Number(variant.stock_quantity || 0) *
          Number(variant.cost_price || 0),
      0
    );

  const storesReport = useMemo(() => {
    return stores.map((store) => {
      const storeTransactions = transactions.filter(
        (transaction) => transaction.store_id === store.id
      );

      const storePeriodTransactions = storeTransactions.filter((transaction) =>
        transactionDateMatches(transaction)
      );

      const saleTransactions = storePeriodTransactions.filter(
        (transaction) =>
          transaction.transaction_type === "sale" &&
          transaction.direction === "credit"
      );

      const orderMap = new Map<string, any>();

      saleTransactions.forEach((transaction) => {
        const order = Array.isArray(transaction.orders)
          ? transaction.orders[0]
          : transaction.orders;

        if (order?.id) orderMap.set(order.id, order);
      });

      const orders = Array.from(orderMap.values());

      const sales = saleTransactions.reduce(
        (sum, transaction) => sum + Number(transaction.amount || 0),
        0
      );

      const courierRewards = storePeriodTransactions
        .filter(
          (transaction) =>
            transaction.transaction_type === "courier_reward" &&
            transaction.direction === "debit"
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      const expenses = storePeriodTransactions
        .filter(
          (transaction) =>
            transaction.direction === "debit" &&
            transaction.is_system_generated === false
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

      const cost = orders.reduce(
        (sum, order) => sum + Number(order.total_cost || 0),
        0
      );

      const pieces = orders.reduce((sum, order) => {
        return (
          sum +
          (order.order_items || []).reduce(
            (itemsSum: number, item: any) =>
              itemsSum + Number(item.quantity || 0),
            0
          )
        );
      }, 0);

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

      return {
        ...store,
        balance,
        capital,
        sales,
        profit: sales - cost - courierRewards,
        expenses,
        courierRewards,
        ordersCount: orders.length,
        pieces,
      };
    });
  }, [stores, transactions, variants, dateFrom, dateTo]);

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
            الرصيد، المبيعات، الأرباح، المصروفات ورأس المال
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
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

      <div className="mb-6 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <button
          type="button"
          onClick={() => setShowBalanceDetails(true)}
          className="rounded-2xl border border-green-800 bg-green-950/30 p-5 text-right transition hover:border-green-500 hover:bg-green-950/50"
        >
          <p className="text-sm text-green-300">الرصيد الحالي</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(allTimeBalance)}
          </p>
          <p className="mt-3 text-xs text-green-400">
            اضغط لعرض جميع الإضافات والخصومات
          </p>
        </button>

        <div className="rounded-2xl border border-blue-800 bg-blue-950/30 p-5">
          <p className="text-sm text-blue-300">مبيعات الفترة</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">{money(periodSales)}</p>
        </div>

        <div className="rounded-2xl border border-purple-800 bg-purple-950/30 p-5">
          <p className="text-sm text-purple-300">الربح</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">{money(periodProfit)}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowManualExpensesDetails(true)}
          className="rounded-2xl border border-red-800 bg-red-950/30 p-5 text-right transition hover:border-red-500 hover:bg-red-950/50"
        >
          <p className="text-sm text-red-300">المصروفات والخصومات</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(periodExpenses)}
          </p>
          <p className="mt-3 text-xs text-red-400">
            اضغط لعرض المصروفات والخصومات اليدوية
          </p>
        </button>

        <div className="rounded-2xl border border-orange-800 bg-orange-950/30 p-5">
          <p className="text-sm text-orange-300">مكافآت المناديب</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">
            {money(periodCourierRewards)}
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 p-5">
          <p className="text-sm text-neutral-300">الطلبات / القطع</p>
          <p dir="ltr" className="mt-2 text-xl font-black text-right">
            {soldOrdersCount} طلب / {soldPiecesCount} قطعة
          </p>
        </div>

        <div className="rounded-2xl border border-yellow-800 bg-yellow-950/30 p-5">
          <p className="text-sm text-yellow-300">رأس المال في المخزون</p>
          <p dir="ltr" className="mt-2 text-2xl font-black text-right">{money(currentCapital)}</p>
        </div>
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
      </div>

      {message && <p className="mb-5 text-yellow-400">{message}</p>}

      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-bold">تقرير المتاجر</h2>

        <div className="grid gap-4 xl:grid-cols-3">
          {storesReport.map((store) => (
            <div
              key={store.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <h3 className="mb-5 text-xl font-bold">{store.name}</h3>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">الرصيد</p>
                  <p className="mt-1 font-bold">{money(store.balance)}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">رأس المال</p>
                  <p className="mt-1 font-bold">{money(store.capital)}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">المبيعات</p>
                  <p className="mt-1 font-bold">{money(store.sales)}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">الربح</p>
                  <p className="mt-1 font-bold">{money(store.profit)}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">المصروفات</p>
                  <p className="mt-1 font-bold">{money(store.expenses)}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">مكافآت المناديب</p>
                  <p className="mt-1 font-bold">
                    {money(store.courierRewards)}
                  </p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">عدد الطلبات</p>
                  <p className="mt-1 font-bold">{store.ordersCount}</p>
                </div>

                <div className="rounded-xl bg-neutral-800 p-3">
                  <p className="text-neutral-400">عدد القطع</p>
                  <p className="mt-1 font-bold">{store.pieces}</p>
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
