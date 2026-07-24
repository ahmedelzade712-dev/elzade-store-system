import { NextResponse } from "next/server";
import { mayarListZones, mayarLogin } from "@/lib/mayar";

export async function GET() {
  try {
    const login = await mayarLogin();
    const zones = await mayarListZones(login.token);

    return NextResponse.json({
      ok: true,
      user: login.user,
      zones_count: zones.length,
      first_zones: zones.slice(0, 10),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Unknown Mayar error",
      },
      { status: 500 }
    );
  }
}
