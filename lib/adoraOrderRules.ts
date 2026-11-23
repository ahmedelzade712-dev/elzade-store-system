/** Order preflight: checks only user-approved mandatory fields. Never creates orders. */
export type AdoraOrderDraft = {
  product_code?:string|null;
  receiver_phone?:string|null;
  delivery_city?:string|null;
  delivery_area?:string|null;
  delivery_address?:string|null;
  size?:string|null;
};
export type MissingField = "product_code"|"receiver_phone"|"delivery_city"|"delivery_area"|"delivery_address"|"size";
const normalize=(s:string)=>s.normalize("NFKC").trim().replace(/[إأآٱ]/g,"ا").replace(/ة/g,"ه").replace(/\s+/g," ");
const NEEDS_AREA = new Set(["طرابلس","بنغازي","مصراته"]);
export function validateAdoraOrderDraft(draft:AdoraOrderDraft):{ready:boolean;missing:MissingField[]}{
  const missing:MissingField[]=[];
  for(const field of ["product_code","receiver_phone","delivery_city","delivery_address","size"] as const)
  {if(typeof draft[field]!=="string"||!draft[field]!.trim())missing.push(field);}
  const city=normalize(String(draft.delivery_city??""));
  if(NEEDS_AREA.has(city)&&!String(draft.delivery_area??"").trim())missing.push("delivery_area");
  // Do not invent a customer phone number or silently truncate it. Validate locally before creating an ERP order.
  if(!missing.includes("receiver_phone") && !/^[+0-9\s()\-]{7,24}$/.test(String(draft.receiver_phone)))
    missing.push("receiver_phone");
  return {ready:missing.length===0,missing};
}