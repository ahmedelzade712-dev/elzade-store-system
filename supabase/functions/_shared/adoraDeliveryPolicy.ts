/**
 * Owner-approved delivery guidance. It is an estimate, not a carrier SLA.
 * Cutoffs interpreted in Africa/Tripoli local time.
 */
export const DELIVERY_NEAR_CITIES = [
 "مصراتة","الزاوية","الخمس","زليتن","ترهونة","بني وليد",
 "صبراتة","صرمان","زوارة","القرة بوللي","غريان"
] as const;
const normalize=(s:string)=>s.normalize("NFKC").trim().replace(/[إأآٱ]/g,"ا")
 .replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/\s+/g," ");
export type DeliveryWindow={category:"tripoli"|"near"|"other";lead_days_min:number;lead_days_max:number;cutoff_hour:number|null;disclaimer:string};
export function deliveryWindow(city:string,localHour:number):DeliveryWindow{
  const name=normalize(city);
  if(!Number.isFinite(localHour)||localHour<0||localHour>=24)throw new Error("INVALID_LOCAL_HOUR");
  const disclaimer="موعد تقريبي وفق جدول الشركة وقد يتغير بسبب أيام العطلات أو ظروف التوصيل";
  if(name==="طرابلس") return {category:"tripoli",lead_days_min:localHour<15?0:1,
    lead_days_max:localHour<15?0:1,cutoff_hour:15,disclaimer};
  if(DELIVERY_NEAR_CITIES.some(x=>normalize(x)===name)){
    const days=localHour<16?1:2;
    return {category:"near",lead_days_min:days,lead_days_max:days,cutoff_hour:16,disclaimer};
  }
  return {category:"other",lead_days_min:2,lead_days_max:3,cutoff_hour:null,disclaimer};
}
export function tripoliLocalHour(now:Date):number {
  // Libyan time, no local host timezone dependence.
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Tripoli",hour:"2-digit",
    minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const hours=Number(parts.find(x=>x.type==="hour")?.value??"0");
  const mins=Number(parts.find(x=>x.type==="minute")?.value??"0");
  return hours+mins/60;
}
