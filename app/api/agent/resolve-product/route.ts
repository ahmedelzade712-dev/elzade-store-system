import { NextResponse } from "next/server";
import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

type CatalogImage = {
  catalog_index: number;

  product_id: string;
  store_id: string;

  name: string | null;
  design_code: string | null;
  description: string | null;
  fabric: string | null;
  product_type: string | null;

  color: string | null;
  image_url: string;

  variants: {
    variant_id: string;
    size: string | null;
    sale_price: number;
    stock_quantity: number;
    is_active: boolean;
  }[];
};

function asNumber(
  value: unknown,
  fallback = 0
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function cleanText(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function extractJson(
  value: string
): any {
  const text = value.trim();

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace =
      text.indexOf("{");

    const lastBrace =
      text.lastIndexOf("}");

    if (
      firstBrace === -1 ||
      lastBrace === -1 ||
      lastBrace <= firstBrace
    ) {
      throw new Error(
        "AI response did not contain valid JSON."
      );
    }

    const jsonText =
      text.slice(
        firstBrace,
        lastBrace + 1
      );

    return JSON.parse(
      jsonText
    );
  }
}

async function loadCatalog(
  storeId: string
): Promise<CatalogImage[]> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "agent_product_catalog"
    )
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
      "Failed to load catalog: " +
        error.message
    );
  }

  const rows =
    (data || []) as CatalogRow[];

  /*
    كل صورة منتج تظهر مرة واحدة فقط
    مهما كان لها عدة مقاسات.
  */
  const imageMap =
    new Map<
      string,
      CatalogImage
    >();

  for (
    const row of rows
  ) {
    const imageUrl =
      cleanText(
        row.variant_image_url
      ) ||
      cleanText(
        row.main_image_url
      );

    if (!imageUrl) {
      continue;
    }

    /*
      نفس الصورة + نفس المنتج + اللون
      تعتبر مدخل بصري واحد.
    */
    const key = [
      row.product_id,
      row.color || "",
      imageUrl,
    ].join("|");

    let item =
      imageMap.get(key);

    if (!item) {
      item = {
        catalog_index: 0,

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

        color:
          row.color,

        image_url:
          imageUrl,

        variants: [],
      };

      imageMap.set(
        key,
        item
      );
    }

    item.variants.push({
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

  const catalog =
    Array.from(
      imageMap.values()
    );

  catalog.forEach(
    (
      item,
      index
    ) => {
      item.catalog_index =
        index + 1;
    }
  );

  return catalog;
}

function buildCatalogText(
  item: CatalogImage
): string {
  const availableVariants =
    item.variants.filter(
      (variant) =>
        variant.is_active &&
        variant.stock_quantity > 0
    );

  const variantText =
    availableVariants
      .map(
        (variant) =>
          `${variant.size ?? "?"}: stock=${variant.stock_quantity}, price=${variant.sale_price}`
      )
      .join(" | ");

  return [
    `CATALOG IMAGE #${item.catalog_index}`,
    `product_id: ${item.product_id}`,
    `name: ${item.name ?? ""}`,
    `design_code: ${item.design_code ?? ""}`,
    `description: ${item.description ?? ""}`,
    `fabric: ${item.fabric ?? ""}`,
    `product_type: ${item.product_type ?? ""}`,
    `color: ${item.color ?? ""}`,
    `available_variants: ${variantText || "NONE"}`,
  ].join("\n");
}

export async function POST(
  request: Request
) {
  try {
    if (
      !process.env
        .OPENAI_API_KEY
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const body =
      await request.json();

    const storeId =
      cleanText(
        body.store_id
      );

    const customerImageUrl =
      cleanText(
        body.customer_image_url
      );

    const customerImageBase64 =
      cleanText(
        body.customer_image_base64
      );

    const customerImageMimeType =
      cleanText(
        body.customer_image_mime_type
      ) ||
      "image/jpeg";

    if (!storeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "store_id is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !customerImageUrl &&
      !customerImageBase64
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "customer_image_url or customer_image_base64 is required.",
        },
        {
          status: 400,
        }
      );
    }

    const catalog =
      await loadCatalog(
        storeId
      );

    if (
      catalog.length === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No catalog images found for this store.",
        },
        {
          status: 404,
        }
      );
    }

    /*
      صورة الزبونة يمكن أن تكون:
      - رابط عام
      - Base64

      لاحقًا صور Meta الخاصة
      سنحولها إلى Base64 قبل
      إرسالها للـAI.
    */
    const customerImage =
      customerImageBase64
        ? `data:${customerImageMimeType};base64,${customerImageBase64}`
        : customerImageUrl;

    const content: any[] =
      [];

    content.push({
      type: "input_text",
      text: `
أنت المسؤول عن التعرف البصري على منتجات متجر ملابس نسائية.

مهمتك هي مقارنة صورة أرسلها العميل مع جميع صور الكتالوج التي ستظهر لك بعد صورة العميل.

القواعد الصارمة:

1. أنت الذي تتخذ قرار المطابقة بصريًا. لا توجد خوارزمية hash أو image matching خارجية تقوم بالقرار.

2. لا تعتمد على اللون وحده إطلاقًا.

3. افهم التصميم أولًا:
   - شكل القطعة
   - القصة
   - الياقة
   - الأزرار
   - الربطات
   - الأكمام
   - الجيوب
   - شكل البنطال
   - الخامة الظاهرة
   - التفاصيل والخياطة
   - مواضع العناصر في التصميم

4. صورة العميل قد تكون:
   - Screenshot
   - Crop
   - Zoom
   - صورة مضغوطة
   - صورة معاد إرسالها
   - لقطة من Reel
   - لقطة من فيديو
   - جزء فقط من الصورة الأصلية
   - أبعاد مختلفة
   - امتداد ملف مختلف
   - جودة مختلفة

هذه الاختلافات وحدها لا تعني أن المنتج مختلف.

5. يمكن أن توجد عدة ألوان لنفس التصميم.

6. يمكن أن يوجد نفس اللون في تصميمين مختلفين.

7. Design first.
   Variant/color second.
   Color name third.

8. إذا كانت صورة العميل تطابق نفس التصميم واللون الموجود في إحدى صور الكتالوج، اخترها.

9. إذا كانت نفس القطعة لكن من زاوية مختلفة، يمكنك اعتبارها تطابقًا إذا كانت التفاصيل البصرية كافية.

10. لا تجبر الصورة على أقرب منتج.

11. إذا لم يوجد منتج مطابق بدرجة ثقة عالية، matched يجب أن تكون false.

12. إذا كان هناك منتجان محتملان ولا تستطيع الفصل بينهما بثقة عالية، matched يجب أن تكون false و ambiguous يجب أن تكون true.

13. لا تختر منتجًا لأن اسمه أو وصفه يبدو مناسبًا إذا الصورة نفسها لا تؤيد ذلك.

14. بيانات النص المرفقة مع كل صورة تساعدك بعد المقارنة البصرية، لكنها لا تستبدل الرؤية.

15. الدقة أهم من السرعة والتكلفة.

أعد JSON فقط بهذا الشكل:

{
  "matched": true,
  "ambiguous": false,
  "catalog_index": 1,
  "product_id": "uuid",
  "design_code": "code-or-null",
  "color": "color-or-null",
  "confidence": 0.99,
  "same_design_confidence": 0.99,
  "same_variant_confidence": 0.99,
  "reason": "شرح مختصر للسبب البصري",
  "observed_customer_details": [
    "تفصيل 1",
    "تفصيل 2"
  ],
  "matched_visual_details": [
    "تفصيل مطابق 1",
    "تفصيل مطابق 2"
  ],
  "differences": [],
  "alternative_catalog_indexes": []
}

إذا لم يوجد تطابق:

{
  "matched": false,
  "ambiguous": false,
  "catalog_index": null,
  "product_id": null,
  "design_code": null,
  "color": null,
  "confidence": 0,
  "same_design_confidence": 0,
  "same_variant_confidence": 0,
  "reason": "لم أجد تطابقًا موثوقًا",
  "observed_customer_details": [],
  "matched_visual_details": [],
  "differences": [],
  "alternative_catalog_indexes": []
}

إذا يوجد غموض بين أكثر من منتج:
matched=false
ambiguous=true
وضع أرقام الصور المحتملة في alternative_catalog_indexes.

لا تكتب أي كلام خارج JSON.
      `.trim(),
    });

    content.push({
      type: "input_text",
      text:
        "CUSTOMER IMAGE — هذه هي الصورة التي أرسلها العميل. قارن جميع صور الكتالوج التالية بها.",
    });

    content.push({
      type: "input_image",
      image_url:
        customerImage,
      detail: "high",
    });

    /*
      الآن نرسل صور الكتالوج واحدة
      واحدة مع تعريف واضح قبل كل صورة.
    */
    for (
      const item of catalog
    ) {
      content.push({
        type: "input_text",
        text:
          buildCatalogText(
            item
          ),
      });

      content.push({
        type: "input_image",
        image_url:
          item.image_url,
        detail: "high",
      });
    }

    const response =
      await openai.responses.create({
        model:
          "gpt-5.6-sol",

        reasoning: {
          effort: "high",
        },

        input: [
          {
            role: "user",
            content,
          },
        ],
      });

    const outputText =
      response.output_text ||
      "";

    const decision =
      extractJson(
        outputText
      );

    /*
      حماية إضافية:
      حتى لو أعاد النموذج product_id،
      نتحقق أنه موجود فعلًا داخل
      الكتالوج الذي قدمناه له.
    */
    let matchedCatalogItem:
      | CatalogImage
      | null = null;

    if (
      decision.matched === true &&
      decision.catalog_index
    ) {
      matchedCatalogItem =
        catalog.find(
          (item) =>
            item.catalog_index ===
            Number(
              decision.catalog_index
            )
        ) || null;
    }

    if (
      decision.matched === true &&
      !matchedCatalogItem
    ) {
      return NextResponse.json({
        ok: true,

        matched: false,
        ambiguous: true,

        confidence: 0,

        reason:
          "AI returned a catalog item that does not exist in the provided catalog.",

        ai_decision:
          decision,
      });
    }

    /*
      لا نسمح للـAI أن يخترع
      بيانات السعر أو المخزون.
      نعيدها من Supabase نفسها.
    */
    const liveProduct =
      matchedCatalogItem
        ? {
            catalog_index:
              matchedCatalogItem.catalog_index,

            product_id:
              matchedCatalogItem.product_id,

            name:
              matchedCatalogItem.name,

            design_code:
              matchedCatalogItem.design_code,

            description:
              matchedCatalogItem.description,

            fabric:
              matchedCatalogItem.fabric,

            product_type:
              matchedCatalogItem.product_type,

            color:
              matchedCatalogItem.color,

            image_url:
              matchedCatalogItem.image_url,

            variants:
              matchedCatalogItem.variants,
          }
        : null;

    return NextResponse.json({
      ok: true,

      store_id:
        storeId,

      catalog_images_checked:
        catalog.length,

      matched:
        decision.matched ===
        true,

      ambiguous:
        decision.ambiguous ===
        true,

      confidence:
        Number(
          decision.confidence ??
            0
        ),

      same_design_confidence:
        Number(
          decision.same_design_confidence ??
            0
        ),

      same_variant_confidence:
        Number(
          decision.same_variant_confidence ??
            0
        ),

      reason:
        decision.reason ??
        "",

      observed_customer_details:
        Array.isArray(
          decision.observed_customer_details
        )
          ? decision.observed_customer_details
          : [],

      matched_visual_details:
        Array.isArray(
          decision.matched_visual_details
        )
          ? decision.matched_visual_details
          : [],

      differences:
        Array.isArray(
          decision.differences
        )
          ? decision.differences
          : [],

      alternative_catalog_indexes:
        Array.isArray(
          decision.alternative_catalog_indexes
        )
          ? decision.alternative_catalog_indexes
          : [],

      product:
        liveProduct,
    });
  } catch (
    error: any
  ) {
    console.error(
      "AI product resolver error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error?.message ||
          "AI product resolution failed.",
      },
      {
        status: 500,
      }
    );
  }
}