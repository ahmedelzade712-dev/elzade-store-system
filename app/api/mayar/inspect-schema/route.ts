import { NextResponse } from "next/server";
import { mayarGraphql, mayarLogin } from "@/lib/mayar";

export async function GET() {
  try {
    const login = await mayarLogin();

    const query = `
      query InspectMayarSchema {
        queryType: __type(name: "Query") {
          name
          fields {
            name
            description
            args {
              name
              description
              type {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }

        listZonesFilterInput: __type(name: "ListZonesFilterInput") {
          name
          inputFields {
            name
            description
            defaultValue
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }

        dropdownEntry: __type(name: "DropDownEntry") {
          name
          fields {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }

        zone: __type(name: "Zone") {
          name
          fields {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }

        city: __type(name: "City") {
          name
          fields {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }

        area: __type(name: "Area") {
          name
          fields {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    `;

    const data = await mayarGraphql<any>(query, {}, login.token);

    const queryFields = data.queryType?.fields || [];

    const potentiallyRelevantQueries = queryFields.filter(
      (field: any) => {
        const value = String(field.name || "").toLowerCase();

        return (
          value.includes("zone") ||
          value.includes("city") ||
          value.includes("area") ||
          value.includes("branch") ||
          value.includes("country")
        );
      }
    );

    return NextResponse.json({
      ok: true,
      mode: "safe_schema_inspection_no_database_changes",
      potentially_relevant_queries: potentiallyRelevantQueries,
      list_zones_filter_input: data.listZonesFilterInput,
      dropdown_entry: data.dropdownEntry,
      zone_type: data.zone,
      city_type: data.city,
      area_type: data.area,
      all_query_fields: queryFields.map((field: any) => field.name),
      note:
        "هذا فحص آمن لمخطط GraphQL فقط. لم يتم تعديل أي جدول أو بيانات في Supabase أو المعيار.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.message ||
          "Unknown Mayar GraphQL schema inspection error",
        note:
          "إذا ظهرت رسالة أن introspection غير مسموح، سننتقل مباشرة إلى فحص شحنة ناجحة لمدينة من المدن المتأثرة.",
      },
      { status: 500 }
    );
  }
}
