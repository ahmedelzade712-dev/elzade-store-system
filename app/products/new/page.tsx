"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const COLORS = [
  "╪ث╪│┘ê╪»",
  "╪ث╪ذ┘è╪╢",
  "┘â╪ص┘┘è",
  "┘ê╪▒╪»┘è",
  "┘à┘ê┘",
  "╪ذ┘è╪ش",
  "╪▒┘à╪د╪»┘è",
  "╪ث╪ص┘à╪▒",
  "╪ث╪«╪╢╪▒",
  "╪ذ┘┘è",
  "╪│┘à╪د┘ê┘è",
  "╪▓┘è╪ز┘è",
  "┘â┘è┘ê┘è",
  "┘╪│┘┘ê╪▒┘è",
  "╪ذ┘┘è ╪║╪د┘à┘é",
  "┘┘ê╪┤┘è╪د",
  "┘┘ê╪»",
  "╪ذ╪▒╪║┘╪»┘è",
  "╪ث╪▓╪▒┘é",
  "╪ذ┘┘╪│╪ش┘è",
  "╪ش┘è╪┤┘è",
  "┘à┘ê┘ ┘ç╪د╪»┘è",
  "┘â╪▒┘è┘à┘è",
  "╪ذ╪╖╪د╪╖┘è",
  "╪ذ┘è╪ذ┘è ╪ذ┘┘ê",
  "┘é┘ç┘ê┘è ╪║╪د┘à┘é",
  "╪ذ┘┘è ┘à╪ص╪▒┘ê┘é",
  "┘┘è╪▒┘ê╪▓┘è",
  "╪ذ╪▒╪ز┘é╪د┘┘è",
  "╪ث╪╡┘╪▒",
  "┘â╪┤┘à┘è╪▒┘è",
  "╪▓┘ç╪▒┘è",
  "╪╣┘╪د╪ذ┘è",
];

const SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  ...Array.from({ length: 25 }, (_, i) => String(i + 36)),
];

const PRODUCT_TYPES = ["╪ذ┘è╪ش╪د┘à╪ر", "╪╣╪ذ╪د┘è╪ر", "╪ذ╪»┘╪ر", "╪ص┘é┘è╪ذ╪ر", "╪ص╪░╪د╪ة", "╪ث╪«╪▒┘ë"];

export default function NewProductPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [storeId, setStoreId] = useState("");
  const [sku, setSku] = useState("");
  const [designCode, setDesignCode] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [visualFeatures, setVisualFeatures] = useState("");
  const [productType, setProductType] = useState("");
  const [color, setColor] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [fabric, setFabric] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const [sizeRows, setSizeRows] = useState(
    SIZES.map((size) => ({ size, quantity: "" }))
  );

  const selectedSizeRows = useMemo(() => {
    return sizeRows.filter((row) => Number(row.quantity) > 0);
  }, [sizeRows]);

  useEffect(() => {
    async function loadStores() {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");

      if (error) {
        setMessage("╪ز╪╣╪░╪▒ ╪ز╪ص┘à┘è┘ ╪د┘┘à╪ز╪د╪ش╪▒: " + error.message);
        return;
      }

      setStores(data || []);
    }

    loadStores();
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("╪د┘┘à┘┘ ╪د┘┘à╪«╪ز╪د╪▒ ┘è╪ش╪ذ ╪ث┘ ┘è┘â┘ê┘ ╪╡┘ê╪▒╪ر");
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage("");
  }

  function updateSizeQuantity(size: string, quantity: string) {
    setSizeRows((prev) =>
      prev.map((row) => (row.size === size ? { ...row, quantity } : row))
    );
  }

  function resetForm() {
    setSku("");
    setDesignCode("");
    setName("");
    setModel("");
    setDescription("");
    setVisualFeatures("");
    setProductType("");
    setColor("");
    setCostPrice("");
    setSalePrice("");
    setFabric("");
    setImageFile(null);

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setPreview("");
    setSizeRows(SIZES.map((size) => ({ size, quantity: "" })));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (saving) return;

    setMessage("");

    const requiredMissing =
      !storeId ||
      !designCode.trim() ||
      !name.trim() ||
      !productType ||
      !color ||
      !fabric.trim() ||
      !description.trim() ||
      !visualFeatures.trim() ||
      !costPrice ||
      !salePrice ||
      !imageFile;

    if (requiredMissing) {
      setMessage(
        "┘è╪ش╪ذ ╪ز╪╣╪ذ╪خ╪ر ╪د┘┘à╪ز╪ش╪▒╪î ┘â┘ê╪» ╪د┘╪ز╪╡┘à┘è┘à╪î ╪د╪│┘à ╪د┘┘à┘╪ز╪ش╪î ╪د┘┘┘ê╪╣╪î ╪د┘┘┘ê┘╪î ╪د┘╪«╪د┘à╪ر╪î ┘ê╪╡┘ ╪د┘┘à┘╪ز╪ش╪î ╪د┘╪╣┘╪د┘à╪د╪ز ╪د┘┘à┘à┘è╪▓╪ر ┘┘┘AI╪î ╪د┘╪ز┘â┘┘╪ر╪î ╪│╪╣╪▒ ╪د┘╪ذ┘è╪╣╪î ┘ê╪╡┘ê╪▒╪ر ╪د┘┘à┘╪ز╪ش"
      );
      return;
    }

    if (selectedSizeRows.length === 0) {
      setMessage("┘è╪ش╪ذ ╪ح╪»╪«╪د┘ ┘â┘à┘è╪ر ┘┘à┘é╪د╪│ ┘ê╪د╪ص╪» ╪╣┘┘ë ╪د┘╪ث┘é┘");
      return;
    }

    const numericCostPrice = Number(costPrice);
    const numericSalePrice = Number(salePrice);

    if (
      !Number.isFinite(numericCostPrice) ||
      numericCostPrice < 0 ||
      !Number.isFinite(numericSalePrice) ||
      numericSalePrice < 0
    ) {
      setMessage("╪د┘╪ز┘â┘┘╪ر ┘ê╪│╪╣╪▒ ╪د┘╪ذ┘è╪╣ ┘è╪ش╪ذ ╪ث┘ ┘è┘â┘ê┘╪د ╪ث╪▒┘é╪د┘à┘ï╪د ╪╡╪ص┘è╪ص╪ر");
      return;
    }

    setSaving(true);
    setMessage("╪ش╪د╪▒┘è ╪ص┘╪╕ ╪د┘┘à┘╪ز╪ش...");

    const finalSku = sku.trim() || `PRD-${Date.now()}`;
    let imageUrl = "";
    let uploadedFileName = "";
    let createdProductId = "";

    try {
      const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      uploadedFileName = `${Date.now()}-${finalSku}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(uploadedFileName, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error("╪«╪╖╪ث ┘┘è ╪▒┘╪╣ ╪د┘╪╡┘ê╪▒╪ر: " + uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(uploadedFileName);

      imageUrl = publicUrlData.publicUrl;

      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          store_id: storeId,
          sku: finalSku,
          design_code: designCode.trim(),
          name: name.trim(),
          model: model.trim() || null,
          description: description.trim(),
          visual_features: visualFeatures.trim(),
          product_type: productType,
          fabric: fabric.trim(),
          main_image_url: imageUrl,
          default_cost_price: numericCostPrice,
          default_sale_price: numericSalePrice,
          is_active: true,
        })
        .select("id")
        .single();

      if (productError || !product) {
        throw new Error("╪«╪╖╪ث ┘┘è ╪ص┘╪╕ ╪د┘┘à┘╪ز╪ش: " + (productError?.message || "╪«╪╖╪ث ╪║┘è╪▒ ┘à╪╣╪▒┘ê┘"));
      }

      createdProductId = product.id;

      const variantsToInsert = selectedSizeRows.map((row) => ({
        store_id: storeId,
        product_id: product.id,
        color,
        size: row.size,
        stock_quantity: Number(row.quantity),
        cost_price: numericCostPrice,
        sale_price: numericSalePrice,
        image_url: imageUrl,
        is_active: true,
      }));

      const { error: variantError } = await supabase
        .from("product_variants")
        .insert(variantsToInsert);

      if (variantError) {
        throw new Error("╪«╪╖╪ث ┘┘è ╪ص┘╪╕ ╪د┘┘à┘é╪د╪│╪د╪ز: " + variantError.message);
      }

      setMessage("╪ز┘à ╪ص┘╪╕ ╪د┘┘à┘╪ز╪ش ┘ê┘â┘ ╪د┘┘à┘é╪د╪│╪د╪ز ┘┘è ╪د┘┘à╪«╪▓┘ê┘ ╪ذ┘╪ش╪د╪ص");
      resetForm();
    } catch (error: any) {
      if (createdProductId) {
        await supabase.from("products").delete().eq("id", createdProductId);
      }

      if (uploadedFileName) {
        await supabase.storage.from("product-images").remove([uploadedFileName]);
      }

      setMessage(error?.message || "╪ص╪»╪س ╪«╪╖╪ث ╪ث╪س┘╪د╪ة ╪ص┘╪╕ ╪د┘┘à┘╪ز╪ش");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">╪ح╪╢╪د┘╪ر ┘à┘╪ز╪ش ╪ح┘┘ë ╪د┘┘à╪«╪▓┘ê┘</h1>
          <p className="mt-2 text-neutral-400">
            ╪ث╪»╪«┘ ╪ذ┘è╪د┘╪د╪ز ╪د┘┘┘ê┘ ╪د┘╪ص╪د┘┘è ╪ذ╪»┘é╪ر. ╪د╪│╪ز╪«╪»┘à ┘┘╪│ ┘â┘ê╪» ╪د┘╪ز╪╡┘à┘è┘à ┘┘â┘ ╪ث┘┘ê╪د┘ ┘┘╪│ ╪د┘╪ز╪╡┘à┘è┘à.
          </p>
        </div>

        <a
          href="/products"
          className="rounded-xl border border-neutral-700 px-5 py-3"
        >
          ╪╣╪▒╪╢ ╪د┘┘à┘╪ز╪ش╪د╪ز
        </a>
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-6xl grid-cols-1 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">╪د┘╪ذ┘è╪د┘╪د╪ز ╪د┘╪ث╪│╪د╪│┘è╪ر</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د┘┘à╪ز╪ش╪▒ *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                required
              >
                <option value="">╪د╪«╪ز╪▒ ╪د┘┘à╪ز╪ش╪▒</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">┘â┘ê╪» ╪د┘┘à┘╪ز╪ش</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="╪د╪«╪ز┘è╪د╪▒┘è - ┘è╪╢╪د┘ ╪ز┘┘é╪د╪خ┘è┘ï╪د ╪ح╪░╪د ╪ز╪▒┘â╪ز┘ç ┘╪د╪▒╪║┘ï╪د"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">┘â┘ê╪» ╪د┘╪ز╪╡┘à┘è┘à *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="┘à╪س╪د┘: LIENE-R-001"
                value={designCode}
                onChange={(e) => setDesignCode(e.target.value)}
                required
              />
              <span className="text-xs text-neutral-500">
                ╪ش┘à┘è╪╣ ╪ث┘┘ê╪د┘ ┘┘╪│ ╪د┘╪ز╪╡┘à┘è┘à ┘è╪ش╪ذ ╪ث┘ ╪ز╪ص┘à┘ ┘┘╪│ ╪د┘┘â┘ê╪».
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د╪│┘à ╪د┘┘à┘╪ز╪ش *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="┘à╪س╪د┘: ╪ذ╪»┘╪ر ┘┘è┘┘ê"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">┘┘ê╪╣ ╪د┘┘à┘╪ز╪ش *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                required
              >
                <option value="">╪د╪«╪ز╪▒ ┘┘ê╪╣ ╪د┘┘à┘╪ز╪ش</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د┘┘à┘ê╪»┘è┘ / ╪د┘┘é╪╡╪ر</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="╪د╪«╪ز┘è╪د╪▒┘è - ┘à╪س╪د┘: Oversize"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د┘╪«╪د┘à╪ر *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="┘à╪س╪د┘: ┘┘è┘┘ê / ╪│╪ز╪د┘ / ┘é╪╖┘"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د┘┘┘ê┘ *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                required
              >
                <option value="">╪د╪«╪ز╪▒ ╪د┘┘┘ê┘</option>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-2 text-xl font-bold">╪ذ┘è╪د┘╪د╪ز ╪ز╪│╪د╪╣╪» ╪د┘┘AI ╪╣┘┘ë ┘┘ç┘à ╪د┘╪ز╪╡┘à┘è┘à</h2>
          <p className="mb-4 text-sm text-neutral-400">
            ╪د┘╪╡┘ê╪▒╪ر ┘ç┘è ╪د┘┘à╪▒╪ش╪╣ ╪د┘╪ث╪│╪د╪│┘è. ┘ç╪░┘ç ╪د┘╪ص┘é┘ê┘ ╪ز╪│╪د╪╣╪» ╪د┘┘AI ╪╣┘╪» ┘ê╪ش┘ê╪» ╪ز╪╡┘à┘è┘à╪د╪ز ┘à╪ز╪┤╪د╪ذ┘ç╪ر.
          </p>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">┘ê╪╡┘ ╪د┘┘à┘╪ز╪ش *</span>
              <textarea
                className="min-h-28 rounded-xl bg-neutral-800 p-4"
                placeholder="┘à╪س╪د┘: ╪ذ╪»┘╪ر ┘┘è┘┘ê ╪ذ┘é╪╡╪ر ┘ê╪د╪│╪╣╪ر╪î ┘è╪د┘é╪ر V╪î ╪▒╪د╪ذ╪╖╪ر ╪ش╪د┘╪ذ┘è╪ر╪î ╪ذ╪»┘ê┘ ╪ث╪▓╪▒╪د╪▒ ╪╕╪د┘ç╪▒╪ر╪î ╪ذ┘╪╖╪د┘ ┘ê╪د╪│╪╣"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪د┘╪╣┘╪د┘à╪د╪ز ╪د┘┘à┘à┘è╪▓╪ر ┘┘┘AI *</span>
              <textarea
                className="min-h-24 rounded-xl bg-neutral-800 p-4"
                placeholder="┘à╪س╪د┘: ┘è╪د┘é╪ر V | ╪▒╪د╪ذ╪╖╪ر ╪ش╪د┘╪ذ┘è╪ر | ╪ذ╪»┘ê┘ ╪ث╪▓╪▒╪د╪▒ | ╪ث┘â┘à╪د┘à ┘ê╪د╪│╪╣╪ر | ╪ذ┘╪╖╪د┘ ┘ê╪د╪│╪╣"
                value={visualFeatures}
                onChange={(e) => setVisualFeatures(e.target.value)}
                required
              />
              <span className="text-xs text-neutral-500">
                ╪د┘â╪ز╪ذ ┘┘é╪╖ ╪د┘╪╣┘╪د┘à╪د╪ز ╪د┘╪ذ╪╡╪▒┘è╪ر ╪د┘╪ز┘è ╪ز┘à┘è╪▓ ╪د┘╪ز╪╡┘à┘è┘à. ┘╪د ╪ز┘â╪▒╪▒ ╪د┘┘┘ê┘ ┘ç┘╪د.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">╪د┘╪│╪╣╪▒</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪ز┘â┘┘╪ر ╪د┘┘é╪╖╪╣╪ر *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="╪ز┘â┘┘╪ر ╪د┘┘é╪╖╪╣╪ر"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">╪│╪╣╪▒ ╪د┘╪ذ┘è╪╣ *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="╪│╪╣╪▒ ╪د┘╪ذ┘è╪╣"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="mb-3 block font-bold">╪╡┘ê╪▒╪ر ╪د┘┘à┘╪ز╪ش / ╪د┘┘┘ê┘ *</label>
          <p className="mb-4 text-sm text-neutral-400">
            ╪╢╪╣ ╪ث┘ê╪╢╪ص ╪╡┘ê╪▒╪ر ┘┘ç╪░╪د ╪د┘┘┘ê┘. ╪د┘╪╡┘ê╪▒╪ر ┘┘╪│┘ç╪د ╪│╪ز┘╪│╪ز╪«╪»┘à ┘╪د╪ص┘é┘ï╪د ┘â┘à╪▒╪ش╪╣ ╪ذ╪╡╪▒┘è ┘┘┘AI.
          </p>

          <input type="file" accept="image/*" onChange={handleImageChange} required />

          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="mt-4 h-64 w-64 rounded-xl object-cover"
            />
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">╪د┘┘à┘é╪د╪│╪د╪ز ┘ê╪د┘┘â┘à┘è╪د╪ز</h2>
              <p className="mt-1 text-sm text-neutral-400">
                ╪د┘â╪ز╪ذ ╪د┘┘â┘à┘è╪ر ┘┘é╪╖ ┘┘┘à┘é╪د╪│╪د╪ز ╪د┘┘à╪ز┘ê┘╪▒╪ر. ╪د┘┘à┘é╪د╪│╪د╪ز ╪د┘┘╪د╪▒╪║╪ر ┘┘ ╪ز┘╪ص┘╪╕.
              </p>
            </div>

            <p className="rounded-xl bg-neutral-800 px-4 py-2 text-sm">
              ╪د┘┘à┘é╪د╪│╪د╪ز ╪د┘┘à╪»╪«┘╪ر: {selectedSizeRows.length}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {sizeRows.map((row) => (
              <div key={row.size} className="rounded-xl bg-neutral-800 p-3">
                <label className="mb-2 block font-bold">{row.size}</label>
                <input
                  className="w-full rounded-lg bg-neutral-900 p-3"
                  type="number"
                  min="0"
                  placeholder="╪د┘┘â┘à┘è╪ر"
                  value={row.quantity}
                  onChange={(e) => updateSizeQuantity(row.size, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        {message && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-950/30 p-4 text-yellow-300">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-white p-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "╪ش╪د╪▒┘è ╪د┘╪ص┘╪╕..." : "╪ص┘╪╕ ╪د┘┘à┘╪ز╪ش ┘┘è ╪د┘┘à╪«╪▓┘ê┘"}
        </button>
      </form>
    </main>
  );
}
