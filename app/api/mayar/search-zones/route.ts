import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";

function cleanArabic(value: string) {
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
    const q = searchParams.get("q") || "";

    if (!q.trim()) throw new Error("q مطلوب");

    const login = await mayarLogin();
    const zones = await mayarListZones(login.token, { active: true });

    const q1 = q.trim();
    const q2 = cleanArabic(q);

    const results = zones
      .filter((zone: any) => {
        const name = String(zone.name || "");
        return name.includes(q1) || cleanArabic(name).includes(q2);
      })
      .slice(0, 100)
      .map((zone: any) => ({
        id: zone.id,
        name: zone.name,
      }));

    return NextResponse.json({
      ok: true,
      query: q,
      count: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown search error" },
      { status: 500 }
    );
  }
}
