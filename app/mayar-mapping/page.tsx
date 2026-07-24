"use client";

import { useEffect, useMemo, useState } from "react";

export default function MayarMappingPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [areas, setAreas] = useState<any[]>([]);
  const [citySearch, setCitySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [showLinkedCities, setShowLinkedCities] = useState(false);
  const [showLinkedAreas, setShowLinkedAreas] = useState(false);
  const [manualIds, setManualIds] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCities();
  }, []);

  async function loadCities() {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/mayar/mapping");
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "حدث خطأ في تحميل المدن");
      setLoading(false);
      return;
    }

    setCities(json.cities || []);
    setLoading(false);
  }

  async function loadAreas(cityId: string) {
    setSelectedCityId(cityId);
    setAreas([]);
    setAreaSearch("");
    setMessage("");

    if (!cityId) return;

    const response = await fetch(`/api/mayar/subzones?city_id=${cityId}`);
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "حدث خطأ في تحميل المناطق");
      return;
    }

    setAreas(json.areas || []);
  }

  async function saveCity(city: any) {
    const value = manualIds[`city-${city.id}`] || "";
    if (!value.trim()) {
      setMessage("اكتب رقم Mayar ID أولًا");
      return;
    }

    const ok = confirm(`تأكيد ربط المدينة:\n${city.name}\nبرقم المعيار: ${value}`);
    if (!ok) return;

    const response = await fetch("/api/mayar/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "city", id: city.id, mayar_zone_id: value }),
    });

    const json = await response.json();
    if (!json.ok) {
      setMessage(json.error || "فشل حفظ ربط المدينة");
      return;
    }

    setMessage("تم حفظ ربط المدينة");
    await loadCities();
  }

  async function unlinkCity(city: any) {
    const ok = confirm(`إلغاء ربط المدينة: ${city.name} ؟`);
    if (!ok) return;

    const response = await fetch("/api/mayar/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "city", id: city.id, action: "unlink" }),
    });

    const json = await response.json();
    if (!json.ok) {
      setMessage(json.error || "فشل إلغاء الربط");
      return;
    }

    setMessage("تم إلغاء ربط المدينة");
    await loadCities();
  }

  async function saveArea(area: any) {
    const value = manualIds[`area-${area.id}`] || "";
    if (!value.trim()) {
      setMessage("اكتب رقم Mayar ID أولًا");
      return;
    }

    const ok = confirm(`تأكيد ربط المنطقة:\n${area.name}\nبرقم المعيار: ${value}`);
    if (!ok) return;

    const response = await fetch("/api/mayar/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "area", id: area.id, mayar_subzone_id: value }),
    });

    const json = await response.json();
    if (!json.ok) {
      setMessage(json.error || "فشل حفظ ربط المنطقة");
      return;
    }

    setMessage("تم حفظ ربط المنطقة");
    await loadAreas(selectedCityId);
  }

  async function unlinkArea(area: any) {
    const ok = confirm(`إلغاء ربط المنطقة: ${area.name} ؟`);
    if (!ok) return;

    const response = await fetch("/api/mayar/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "area", id: area.id, action: "unlink" }),
    });

    const json = await response.json();
    if (!json.ok) {
      setMessage(json.error || "فشل إلغاء الربط");
      return;
    }

    setMessage("تم إلغاء ربط المنطقة");
    await loadAreas(selectedCityId);
  }

  const filteredCities = useMemo(() => {
    const term = citySearch.trim();
    return cities
      .filter((city) => !city.is_private_tripoli)
      .filter((city) => showLinkedCities || !city.mayar_zone_id)
      .filter((city) => !term || String(city.name || "").includes(term))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }, [cities, citySearch, showLinkedCities]);

  const filteredAreas = useMemo(() => {
    const term = areaSearch.trim();
    return areas
      .filter((area) => showLinkedAreas || !area.mayar_subzone_id)
      .filter((area) => !term || String(area.name || "").includes(term))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
  }, [areas, areaSearch, showLinkedAreas]);

  const cityStats = useMemo(() => {
    const active = cities.filter((city) => !city.is_private_tripoli);
    const linked = active.filter((city) => city.mayar_zone_id).length;
    return { total: active.length, linked, missing: active.length - linked };
  }, [cities]);

  const areaStats = useMemo(() => {
    const linked = areas.filter((area) => area.mayar_subzone_id).length;
    return { total: areas.length, linked, missing: areas.length - linked };
  }, [areas]);

  if (loading) {
    return <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">جاري التحميل...</main>;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">ربط المعيار اليدوي الآمن</h1>
          <p className="mt-2 text-red-300">
            لا توجد قوائم اختيار. اكتب Mayar ID يدويًا فقط بعد التأكد منه من شركة المعيار.
          </p>
        </div>
        <a href="/" className="rounded-xl bg-white px-5 py-3 font-bold text-black">الرجوع</a>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-yellow-700 bg-yellow-950/40 p-4 text-yellow-100">
          {message}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-neutral-900 p-5">مدن النظام: <b className="text-3xl">{cityStats.total}</b></div>
        <div className="rounded-2xl bg-neutral-900 p-5">مرتبطة: <b className="text-3xl text-green-400">{cityStats.linked}</b></div>
        <div className="rounded-2xl bg-neutral-900 p-5">غير مرتبطة: <b className="text-3xl text-red-400">{cityStats.missing}</b></div>
      </div>

      <section className="mb-10 rounded-2xl bg-neutral-900 p-5">
        <h2 className="mb-4 text-2xl font-bold">المدن</h2>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-xl bg-neutral-800 p-4"
            placeholder="ابحث عن مدينة النظام..."
            value={citySearch}
            onChange={(e) => setCitySearch(e.target.value)}
          />
          <label className="flex items-center gap-3 rounded-xl bg-neutral-800 p-4">
            <input type="checkbox" checked={showLinkedCities} onChange={(e) => setShowLinkedCities(e.target.checked)} />
            إظهار المدن المرتبطة
          </label>
        </div>

        <div className="grid gap-3">
          {filteredCities.map((city) => (
            <div key={city.id} className="grid grid-cols-1 items-center gap-3 rounded-xl bg-neutral-950 p-4 md:grid-cols-5">
              <div>
                <b>{city.name}</b>
                <p className="text-sm text-neutral-400">Mayar ID الحالي: {city.mayar_zone_id || "غير مربوط"}</p>
              </div>

              <input
                className="rounded-xl bg-neutral-800 p-3 md:col-span-2"
                placeholder="اكتب Mayar Zone ID يدويًا"
                value={manualIds[`city-${city.id}`] || ""}
                onChange={(e) => setManualIds({ ...manualIds, [`city-${city.id}`]: e.target.value })}
              />

              <button onClick={() => saveCity(city)} className="rounded-xl bg-green-600 px-4 py-3 font-bold">حفظ</button>

              {city.mayar_zone_id && (
                <button onClick={() => unlinkCity(city)} className="rounded-xl bg-red-700 px-4 py-3 font-bold">إلغاء الربط</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-neutral-900 p-5">
        <h2 className="mb-4 text-2xl font-bold">المناطق</h2>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <select
            className="rounded-xl bg-neutral-800 p-4 md:col-span-2"
            value={selectedCityId}
            onChange={(e) => loadAreas(e.target.value)}
          >
            <option value="">اختر مدينة النظام</option>
            {cities
              .filter((city) => !city.is_private_tripoli)
              .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"))
              .map((city) => (
                <option key={city.id} value={city.id}>{city.name}</option>
              ))}
          </select>

          <div className="rounded-xl bg-neutral-950 p-4">مرتبطة: <b className="text-green-400">{areaStats.linked}</b></div>
          <div className="rounded-xl bg-neutral-950 p-4">غير مرتبطة: <b className="text-red-400">{areaStats.missing}</b></div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className="rounded-xl bg-neutral-800 p-4"
            placeholder="ابحث عن منطقة النظام..."
            value={areaSearch}
            onChange={(e) => setAreaSearch(e.target.value)}
            disabled={!selectedCityId}
          />
          <label className="flex items-center gap-3 rounded-xl bg-neutral-800 p-4">
            <input type="checkbox" checked={showLinkedAreas} onChange={(e) => setShowLinkedAreas(e.target.checked)} />
            إظهار المناطق المرتبطة
          </label>
        </div>

        <div className="grid gap-3">
          {selectedCityId && filteredAreas.map((area) => (
            <div key={area.id} className="grid grid-cols-1 items-center gap-3 rounded-xl bg-neutral-950 p-4 md:grid-cols-5">
              <div>
                <b>{area.name}</b>
                <p className="text-sm text-neutral-400">Mayar ID الحالي: {area.mayar_subzone_id || "غير مربوط"}</p>
              </div>

              <input
                className="rounded-xl bg-neutral-800 p-3 md:col-span-2"
                placeholder="اكتب Mayar Area/Zone ID يدويًا"
                value={manualIds[`area-${area.id}`] || ""}
                onChange={(e) => setManualIds({ ...manualIds, [`area-${area.id}`]: e.target.value })}
              />

              <button onClick={() => saveArea(area)} className="rounded-xl bg-green-600 px-4 py-3 font-bold">حفظ</button>

              {area.mayar_subzone_id && (
                <button onClick={() => unlinkArea(area)} className="rounded-xl bg-red-700 px-4 py-3 font-bold">إلغاء الربط</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
