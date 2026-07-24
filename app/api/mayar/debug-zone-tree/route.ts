import { NextResponse } from "next/server";
import {
  mayarGraphql,
  mayarLogin,
} from "@/lib/mayar";

type ZoneNode = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  parent: {
    id: number;
    code: string;
    name: string;
    active: boolean;
  } | null;
  children: Array<{
    id: number;
    code: string;
    name: string;
    active: boolean;
  }>;
};

function normalizeArabic(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[إأآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ.,،]/g, "")
    .trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const cityName =
      searchParams.get("city") || "مصراتة";

    const login = await mayarLogin();

    const listQuery = `
      query FindZones($input: ListZonesFilterInput, $first: Int!, $page: Int!) {
        listZones(input: $input, first: $first, page: $page) {
          data {
            id
            code
            name
            active
            parent {
              id
              code
              name
              active
            }
            children {
              id
              code
              name
              active
            }
          }
          paginatorInfo {
            count
            currentPage
            lastPage
            perPage
            total
          }
        }
      }
    `;

    const firstPage = await mayarGraphql<{
      listZones: {
        data: ZoneNode[];
        paginatorInfo: {
          count: number;
          currentPage: number;
          lastPage: number;
          perPage: number;
          total: number;
        };
      };
    }>(
      listQuery,
      {
        input: {
          name: cityName,
        },
        first: 100,
        page: 1,
      },
      login.token
    );

    const exactMatches = (firstPage.listZones.data || []).filter(
      (zone) =>
        normalizeArabic(zone.name) ===
        normalizeArabic(cityName)
    );

    const targetZone =
      exactMatches[0] ||
      firstPage.listZones.data?.[0] ||
      null;

    if (!targetZone) {
      return NextResponse.json(
        {
          ok: false,
          error: `لم يتم العثور على Zone باسم ${cityName}`,
          raw_search_results: firstPage.listZones,
        },
        { status: 404 }
      );
    }

    const singleQuery = `
      query Zone($id: Int!, $parentId: Int) {
        zone(id: $id, parentId: $parentId) {
          id
          code
          name
          active
          parent {
            id
            code
            name
            active
          }
          children {
            id
            code
            name
            active
          }
        }
      }
    `;

    let directZone: ZoneNode | null = null;
    let directZoneError: string | null = null;

    try {
      const directData = await mayarGraphql<{
        zone: ZoneNode | null;
      }>(
        singleQuery,
        {
          id: Number(targetZone.id),
          parentId: null,
        },
        login.token
      );

      directZone = directData.zone;
    } catch (error: any) {
      directZoneError =
        error.message || "Unknown zone query error";
    }

    const childrenFromListZones = await mayarGraphql<{
      listZones: {
        data: ZoneNode[];
        paginatorInfo: {
          count: number;
          currentPage: number;
          lastPage: number;
          perPage: number;
          total: number;
        };
      };
    }>(
      listQuery,
      {
        input: {
          parentId: Number(targetZone.id),
        },
        first: 100,
        page: 1,
      },
      login.token
    );

    const suspiciousNames = [
      "الشقيقة",
      "سرت",
      "الزاوية",
      "طبرق",
      "مصراتة",
    ];

    const allChildren = childrenFromListZones.listZones.data || [];

    const suspiciousChildren = allChildren.filter((child) =>
      suspiciousNames.some(
        (name) =>
          normalizeArabic(child.name) ===
          normalizeArabic(name)
      )
    );

    return NextResponse.json({
      ok: true,
      mode: "safe_zone_tree_debug_no_database_changes",

      requested_city_name: cityName,

      search_paginator:
        firstPage.listZones.paginatorInfo,

      search_results:
        firstPage.listZones.data,

      selected_zone:
        targetZone,

      direct_zone_query_result:
        directZone,

      direct_zone_query_error:
        directZoneError,

      children_via_listZones_parentId: {
        paginator:
          childrenFromListZones.listZones.paginatorInfo,
        count:
          allChildren.length,
        items:
          allChildren,
      },

      suspicious_children:
        suspiciousChildren,

      diagnosis: {
        selected_zone_id:
          Number(targetZone.id),
        selected_zone_name:
          targetZone.name,
        child_names:
          allChildren.map((child) => child.name),
        contains_shaqiqa:
          allChildren.some(
            (child) =>
              normalizeArabic(child.name) ===
              normalizeArabic("الشقيقة")
          ),
      },

      note:
        "هذا فحص تشخيصي فقط. لم يتم تعديل Supabase ولم يتم إنشاء أو تعديل أي شحنة.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown Mayar zone tree debug error",
      },
      { status: 500 }
    );
  }
}
