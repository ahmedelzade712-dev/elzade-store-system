import { NextResponse } from "next/server";
import { mayarListShippingServices, mayarLogin } from "@/lib/mayar";

export async function GET() {
  try {
    const login = await mayarLogin();
    const services = await mayarListShippingServices(login.token);

    return NextResponse.json({
      ok: true,
      services,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || "Unknown services error" },
      { status: 500 }
    );
  }
}
