import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_EVENTS = 100;

// Receive-only: the handler NEVER sends a message, stores text, or processes attachments.
// It records only Meta message identifiers to validate transport + deduplication.
function enabled() {
  return process.env.LUNA_META_RECEIVE_ENABLED === "true";
}

function validSignature(body: Buffer, header: string | null, secret: string): boolean {
  if (!header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const provided = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

type Receipt = {
  channel: "messenger" | "instagram";
  page_id: string;
  event_id: string;
};
type MetaEvent = {
  sender?: { id?: unknown };
  message?: { mid?: unknown; is_echo?: unknown };
};
type MetaEntry = { id?: unknown; messaging?: MetaEvent[] };
type MetaPayload = { object?: unknown; entry?: MetaEntry[] };

function boundedId(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function extractReceipts(payload: MetaPayload): Receipt[] | null {
  const channel = payload.object === "page" ? "messenger" :
    payload.object === "instagram" ? "instagram" : null;
  if (!channel || !Array.isArray(payload.entry) || payload.entry.length > MAX_EVENTS) return null;
  const receipts: Receipt[] = [];
  for (const entry of payload.entry) {
    if (!boundedId(entry?.id, 128) || !Array.isArray(entry.messaging)) return null;
    for (const event of entry.messaging) {
      if (receipts.length >= MAX_EVENTS) return null;
      if (!event || event.message?.is_echo === true) continue;
      // Delivery/read/postback/other callbacks contain no message.mid and
      // are outside this phase's strict receive-only acceptance scope.
      const mid = event.message?.mid;
      if (!boundedId(mid, 190)) continue;
      receipts.push({channel, page_id: entry.id, event_id: mid});
    }
  }
  return receipts;
}

export async function GET(request: Request) {
  const token = process.env.LUNA_META_VERIFY_TOKEN;
  if (!enabled() || !token || token.length < 24) {
    return new Response("not enabled", {status:503});
  }
  const q = new URL(request.url).searchParams;
  const candidate = q.get("hub.verify_token") ?? "";
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  if (q.get("hub.mode") !== "subscribe" || a.length !== b.length || !timingSafeEqual(a,b)) {
    return new Response("forbidden", {status:403});
  }
  const challenge = q.get("hub.challenge");
  if (!challenge || challenge.length > 256) return new Response("bad request", {status:400});
  return new Response(challenge, {status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const secret = process.env.LUNA_META_APP_SECRET;
  if (!enabled() || !secret || secret.length < 24 || !process.env.LUNA_META_VERIFY_TOKEN) {
    return NextResponse.json({ok:false,error:"RECEIVER_DISABLED"}, {status:503});
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_BODY_BYTES) {
    return NextResponse.json({ok:false,error:"PAYLOAD_TOO_LARGE"},{status:413});
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(await request.arrayBuffer());
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ok:false,error:"PAYLOAD_TOO_LARGE"},{status:413});
  } catch {
    return NextResponse.json({ok:false,error:"BODY_UNREADABLE"},{status:400});
  }
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"),secret)) {
    return NextResponse.json({ok:false,error:"BAD_SIGNATURE"},{status:401});
  }
  let payload: MetaPayload;
  try {
    payload = JSON.parse(raw.toString("utf8")) as MetaPayload;
  } catch {
    return NextResponse.json({ok:false,error:"INVALID_JSON"},{status:400});
  }
  const receipts = extractReceipts(payload);
  if (receipts === null) return NextResponse.json({ok:false,error:"INVALID_META_ENVELOPE"},{status:400});

  // If more than one event is included, insert as one batch.
  // Unique primary key + ignoreDuplicates make provider retries idempotent.
  const distinct = [...new Map(receipts.map(r=>[`${r.channel}: ${r.page_id}: ${r.event_id}`,r])).values()];
  if (distinct.length > 0) {
    const {error} = await supabaseAdmin.from("luna_event_receipts")
      .upsert(distinct,{onConflict:"channel,page_id,event_id",ignoreDuplicates:true});
    if (error) {
      // Return 503 so Meta can retry; never acknowledge a message that was not persisted.
      // No incoming payloads, tokens, customer IDs or attachment links in logs.
      console.error("Luna receipt persistence failed",error.code);
      return NextResponse.json({ok:false,error:"RECEIPT_STORAGE_UNAVAILABLE"},{status:503});
    }
  }
  // 200 means receipt accepted, NOT that Luna read/responded to the message.
  return NextResponse.json({ok:true,receive_only:true,receipts:distinct.length});
}
