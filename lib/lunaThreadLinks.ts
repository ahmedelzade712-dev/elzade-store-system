/** Meta Business Suite direct-thread links (observed in Adora's own inbox).
 * This is an interface URL, not a stable Meta public API contract.
 * A Webhook sender ID or Graph API conversation ID must NEVER be assumed to equal
 * Business Suite's selected_item_id without matching it against a real thread.
 */
export type LunaChannel = "messenger" | "instagram";
export type BusinessSuiteThread = {
  channel: LunaChannel;
  selectedItemId: string;
};

export const ADORA_INBOX = Object.freeze({
  businessId: "1700702260897865",
  assetId: "589433480926104",
  mailboxId: "589433480926104",
});

function requireNumericId(id: string, field: string): string {
  const trimmed = id.trim();
  if (!/^\d{1,64}$/.test(trimmed)) throw new Error(`INVALID_${field}`);
  return trimmed; // Never Number() / parseInt() Meta identifiers (Instagram > 2^53).
}

/** selectedItemId must be grounded in an observed Business Suite URL or
 * an independently confirmed mapping to that URL. It is NOT sender_id. */
export function businessSuiteThreadUrl(thread: BusinessSuiteThread): string {
  if (thread.channel !== "messenger" && thread.channel !== "instagram")
    throw new Error("INVALID_CHANNEL");

  const u = new URL("https://business.facebook.com/latest/inbox/all/");
  u.searchParams.set("business_id", requireNumericId(ADORA_INBOX.businessId, "BUSINESS_ID"));
  u.searchParams.set("asset_id", requireNumericId(ADORA_INBOX.assetId, "ASSET_ID"));
  u.searchParams.set("mailbox_id", requireNumericId(ADORA_INBOX.mailboxId, "MAILBOX_ID"));
  u.searchParams.set("thread_type", thread.channel === "messenger" ? "FB_MESSAGE" : "IG_MESSAGE");
  u.searchParams.set("selected_item_id", requireNumericId(thread.selectedItemId, "SELECTED_ITEM_ID"));
  return u.toString();
}

/** Strictly validate a copied thread URL from this business before using it
 * as evidence to build future handoff links. No other domains / assets allowed. */
export function parseAdoraBusinessSuiteThreadUrl(raw: string): BusinessSuiteThread {
  const u = new URL(raw.trim());
  if (u.protocol !== "https:" || u.hostname !== "business.facebook.com" ||
    u.pathname !== "/latest/inbox/all/" ||
    u.searchParams.get("business_id") !== ADORA_INBOX.businessId ||
    u.searchParams.get("asset_id") !== ADORA_INBOX.assetId ||
    u.searchParams.get("mailbox_id") !== ADORA_INBOX.mailboxId)
    throw new Error("UNTRUSTED_THREAD_URL");

  const type = u.searchParams.get("thread_type");
  if (type !== "FB_MESSAGE" && type !== "IG_MESSAGE")
    throw new Error("INVALID_THREAD_TYPE");

  return {
    channel: type === "FB_MESSAGE" ? "messenger" : "instagram",
    selectedItemId: requireNumericId(u.searchParams.get("selected_item_id") || "", "SELECTED_ITEM_ID"),
  };
}
