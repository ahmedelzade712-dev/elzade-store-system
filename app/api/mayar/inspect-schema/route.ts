import { NextResponse } from "next/server";
import { mayarGraphql, mayarLogin } from "@/lib/mayar";

function unwrapNamedType(type: any): string | null {
  let current = type;

  while (current) {
    if (current.name) return current.name;
    current = current.ofType;
  }

  return null;
}

export async function GET() {
  try {
    const login = await mayarLogin();

    const queryTypeInspection = `
      query InspectListShipmentsQuery {
        queryType: __type(name: "Query") {
          fields {
            name
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
      }
    `;

    const queryData = await mayarGraphql<any>(
      queryTypeInspection,
      {},
      login.token
    );

    const listShipmentsField = (queryData.queryType?.fields || []).find(
      (field: any) => field.name === "listShipments"
    );

    if (!listShipmentsField) {
      throw new Error("لم يتم العثور على listShipments داخل مخطط المعيار");
    }

    const paginatorTypeName = unwrapNamedType(listShipmentsField.type);

    if (!paginatorTypeName) {
      throw new Error("تعذر معرفة نوع نتيجة listShipments");
    }

    const paginatorInspection = `
      query InspectPaginatorType($typeName: String!) {
        inspectedType: __type(name: $typeName) {
          name
          fields {
            name
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
      }
    `;

    const paginatorData = await mayarGraphql<any>(
      paginatorInspection,
      { typeName: paginatorTypeName },
      login.token
    );

    const dataField = (paginatorData.inspectedType?.fields || []).find(
      (field: any) => field.name === "data"
    );

    if (!dataField) {
      throw new Error(
        `لم يتم العثور على الحقل data داخل النوع ${paginatorTypeName}`
      );
    }

    const shipmentTypeName = unwrapNamedType(dataField.type);

    if (!shipmentTypeName) {
      throw new Error("تعذر معرفة نوع الشحنة داخل listShipments.data");
    }

    const shipmentInspection = `
      query InspectShipmentType($typeName: String!) {
        inspectedType: __type(name: $typeName) {
          name
          description
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
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    const shipmentData = await mayarGraphql<any>(
      shipmentInspection,
      { typeName: shipmentTypeName },
      login.token
    );

    const fields = shipmentData.inspectedType?.fields || [];

    const relevantFields = fields.filter((field: any) => {
      const name = String(field.name || "").toLowerCase();
      const description = String(field.description || "").toLowerCase();
      const text = `${name} ${description}`;

      return (
        text.includes("price") ||
        text.includes("amount") ||
        text.includes("collect") ||
        text.includes("paid") ||
        text.includes("payment") ||
        text.includes("cash") ||
        text.includes("delivery") ||
        text.includes("delivered") ||
        text.includes("piece") ||
        text.includes("return") ||
        text.includes("partial")
      );
    });

    return NextResponse.json({
      ok: true,
      mode: "safe_shipment_schema_inspection_no_database_changes",
      list_shipments_return_type: paginatorTypeName,
      shipment_type: shipmentTypeName,
      relevant_fields: relevantFields,
      all_shipment_fields: fields.map((field: any) => ({
        name: field.name,
        description: field.description || null,
        type: field.type,
      })),
      note:
        "هذا الفحص يقرأ مخطط GraphQL فقط ولا يعدل أي طلب أو رصيد أو مخزون.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "فشل فحص حقول شحنة المعيار",
        note: "لم يتم تعديل أي بيانات في Supabase أو المعيار.",
      },
      { status: 500 }
    );
  }
}
