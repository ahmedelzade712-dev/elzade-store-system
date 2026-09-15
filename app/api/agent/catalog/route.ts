import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CatalogRow = {
  product_id: string;
  store_id: string;
  name: string | null;
  design_code: string | null;
  description: string | null;
  fabric: string | null;
  product_type: string | null;
  main_image_url: string | null;

  variant_id: string;
  color: string | null;
  size: string | null;
  sale_price: number | null;
  variant_image_url: string | null;
  stock_quantity: number | null;
  is_active: boolean | null;
};

type ProductVariant = {
  variant_id: string;
  size: string | null;
  sale_price: number;
  stock_quantity: number;
  is_active: boolean;
};

type ProductMediaGroup = {
  image_url: string | null;
  color: string | null;
  variants: ProductVariant[];
};

type AgentProduct = {
  product_id: string;
  store_id: string;

  name: string | null;
  design_code: string | null;
  description: string | null;
  fabric: string | null;
  product_type: string | null;

  main_image_url: string | null;

  media: ProductMediaGroup[];
};

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const storeId =
      url.searchParams
        .get("store_id")
        ?.trim() || "";

    if (!storeId) {
      return NextResponse.json(
        {
          ok: false,
          error: "store_id is required",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("agent_product_catalog")
      .select(`
        product_id,
        store_id,
        name,
        design_code,
        description,
        fabric,
        product_type,
        main_image_url,
        variant_id,
        color,
        size,
        sale_price,
        variant_image_url,
        stock_quantity,
        is_active
      `)
      .eq(
        "store_id",
        storeId
      )
      .order(
        "design_code",
        {
          ascending: true,
        }
      )
      .order(
        "color",
        {
          ascending: true,
        }
      )
      .order(
        "size",
        {
          ascending: true,
        }
      );

    if (error) {
      throw new Error(
        error.message
      );
    }

    const rows =
      (data || []) as CatalogRow[];

    const productMap =
      new Map<
        string,
        AgentProduct
      >();

    for (const row of rows) {
      let product =
        productMap.get(
          row.product_id
        );

      if (!product) {
        product = {
          product_id:
            row.product_id,

          store_id:
            row.store_id,

          name:
            row.name,

          design_code:
            row.design_code,

          description:
            row.description,

          fabric:
            row.fabric,

          product_type:
            row.product_type,

          main_image_url:
            row.main_image_url,

          media: [],
        };

        productMap.set(
          row.product_id,
          product
        );
      }

      const imageUrl =
        row.variant_image_url ||
        row.main_image_url ||
        null;

      let media =
        product.media.find(
          (item) =>
            item.image_url ===
              imageUrl &&
            item.color ===
              row.color
        );

      if (!media) {
        media = {
          image_url:
            imageUrl,

          color:
            row.color,

          variants: [],
        };

        product.media.push(
          media
        );
      }

      media.variants.push({
        variant_id:
          row.variant_id,

        size:
          row.size,

        sale_price:
          asNumber(
            row.sale_price
          ),

        stock_quantity:
          asNumber(
            row.stock_quantity
          ),

        is_active:
          row.is_active !==
          false,
      });
    }

    const products =
      Array.from(
        productMap.values()
      );

    const uniqueImages =
      new Set<string>();

    for (
      const product of products
    ) {
      if (
        product.main_image_url
      ) {
        uniqueImages.add(
          product.main_image_url
        );
      }

      for (
        const media of
          product.media
      ) {
        if (
          media.image_url
        ) {
          uniqueImages.add(
            media.image_url
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,

      store_id:
        storeId,

      product_count:
        products.length,

      image_count:
        uniqueImages.size,

      products,
    });
  } catch (error: any) {
    console.error(
      "Agent catalog error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error?.message ||
          "Failed to load agent catalog",
      },
      {
        status: 500,
      }
    );
  }
}