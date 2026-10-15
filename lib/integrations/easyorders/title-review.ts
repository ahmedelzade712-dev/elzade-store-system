/** Allowlist for AI review. Descriptions and colors must never cross this boundary. */
export type TitleDraft = { title: string };
type SavedTitleDraft = TitleDraft & { image_url: string; approved: boolean; updated_at: string };

export function titleOnly(value: unknown): TitleDraft {
  if (!value || typeof value !== "object") throw new Error("Invalid title suggestion");
  const title = (value as Record<string, unknown>).title;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    throw new Error("Invalid title suggestion");
  }
  return { title: title.trim() };
}

export function parseTitleDraft(raw: string): TitleDraft {
  return titleOnly(JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
}

/** Read legacy titles without copying AI descriptions or changing the legacy storage key. */
export function restoreTitleDrafts(value: unknown, legacy = false): Record<string, SavedTitleDraft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: [string, SavedTitleDraft][] = [];
  for (const [id, item] of Object.entries(value)) {
    if (!item || typeof item !== "object") continue;
    const draft = item as Record<string, unknown>;
    if (typeof draft.image_url !== "string" || typeof draft.updated_at !== "string") continue;
    try {
      entries.push([id, {
        ...titleOnly(draft), image_url: draft.image_url, updated_at: draft.updated_at,
        approved: !legacy && draft.approved === true,
      }]);
    } catch { /* Ignore invalid local drafts; the product can be reviewed again. */ }
  }
  return Object.fromEntries(entries);
}

/** Internal export format, not an EasyOrders API contract. Only the title is mutable. */
export function approvedTitlePayload(productId: string, draft: TitleDraft & { approved: boolean }) {
  if (!draft.approved) throw new Error("Title approval required");
  return { erp_product_id: productId, display_title: titleOnly(draft).title };
}
