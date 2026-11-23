/** Owner-approved policy: 10 LYD off EACH item, no shipping discount. */
export const ADORA_DISCOUNT_PER_UNIT_LYD=10;
export type AdoraPriceLine={unit_price_lyd:number;quantity:number};
/**
 * Quote calculation only. Does not change ERP prices or submit an order.
 * Pass ORIGINAL non-discounted ERP prices. If ERP already contains a discounted
 * price, do not call this function or the discount will be applied twice.
 */
export function calculateAdoraOrderQuote(lines:readonly AdoraPriceLine[],shipping_lyd:number){
  if(!Array.isArray(lines)||lines.length===0||lines.length>50) throw new Error("INVALID_LINES");
  if(!Number.isFinite(shipping_lyd)||shipping_lyd<0) throw new Error("INVALID_SHIPPING");
  let original=0,discount=0,quantity=0;
  for(const line of lines){
    if(!Number.isFinite(line.unit_price_lyd)||line.unit_price_lyd<ADORA_DISCOUNT_PER_UNIT_LYD||
      !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>100)
      throw new Error("INVALID_ITEM");
    original+=line.unit_price_lyd*line.quantity;
    discount+=ADORA_DISCOUNT_PER_UNIT_LYD*line.quantity;
    quantity+=line.quantity;
  }
  return {quantity,original_lyd:original,discount_lyd:discount,
    items_after_discount_lyd:original-discount,shipping_lyd,
    total_lyd:original-discount+shipping_lyd};
}
