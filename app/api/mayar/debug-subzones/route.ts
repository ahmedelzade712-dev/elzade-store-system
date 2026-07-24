import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    if (!city) {
      throw new Error("city مطلوب");
    }

    const login = await mayarLogin();

    const result = await mayarListZones(login.token, {
      active: true,
      parentId: Number(city),
    });

    return NextResponse.json({
      ok: true,
      city,
      count: result.length,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Unknown debug error",
      },
      { status: 500 }
    );
  }
}