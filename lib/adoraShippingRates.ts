/**
 * Almayar branch shipping price card (user supplied, 2026-11-23).
 * LYD, one-way delivery. DO NOT infer unlisted destinations or use price as a
 * promise that carrier currently accepts the shipment.
 * User correction overrides printed card: كريمية, خلة = 20 instead of 15.
 */
export const ALMAYAR_SHIPPING_SOURCE = "الفرع الرئيسي - المعيار (صورة مزودة من صاحب المتجر)";
export const DELIVERY_CURRENCY = "LYD" as const;
export const SHIPPING_AREAS: ReadonlyArray<{
  group:string; entries:ReadonlyArray<readonly [string,number]>
}> = [
  {group:"طرابلس",entries:[
    ["داخل طرابلس",15],["كريمية",20],["طريق مطار",15],["عين زارة",15],
    ["تاجوراء",15],["خلة",20],["مشروع الهضبة",15]
  ]},
  {group:"غدامس",entries:[
    ["غدامس",40],["سيناؤن",40],["الشعواء",40],["أوال",40]
  ]},
  {group:"المنطقة الوسطى",entries:[
    ["سرت",30],["هراوة",30],["بن جواد",30],["النوفلية",30],
    ["رأس لانوف",30],["البريقة",30],["العقيلة",30],["هون",30],
    ["سوكنة",30],["ودان",30],["الجفرة",30],["زلة",40]
  ]},
  {group:"المنطقة الشرقية",entries:[
    ["بنغازي",25],["اجدابيا",25],["توكرة",35],["المرج",35],
    ["الابيار",35],["البيضاء",35],["قمينس",35],["سلوق",35],
    ["شحات",35],["سوسة",35],["القبة",35],["طبرق",35],
    ["درنة",40],["امساعد",50]
  ]},
  {group:"المنطقة الجنوبية",entries:[
    ["سبها",30],["مزدة",30],["الشويرف",30],["القريات",30],
    ["براك الشاطئ",35],["اوباري",45],["ام الارانب",45],
    ["وادي عتبة",45],["مرزق",45],["تراغن",45],["القطرون",45],["غات",50]
  ]},
  {group:"جنوب طرابلس",entries:[
    ["ترهونة",25],["بني وليد",25],["وادي ربيع",20],
    ["قصر بن غشير",20],["السبيعة",20],["سوق خميس مسيحل",20],
    ["سيدي السايح",20]
  ]},
  {group:"شرق طرابلس",entries:[
    ["القرة بوللي",20],["قماطة",20],["قصر خيار",20],
    ["الخمس",20],["زليتن",20],["مصراتة",20],["مسلاتة",20]
  ]},
  {group:"غرب طرابلس",entries:[
    ["الماية",20],["الزاوية",20],["الصبره",20],["صرمان",20],
    ["صبراتة",20],["زوارة",30],["العجيلات",30],
    ["الجميل",30],["رقدالين",30],["زلطن",30],["راس جدير",40]
  ]},
  {group:"الجبل الغربي",entries:[
    ["غريان",25],["الأصابعة",35],["الرابطة",35],["القواليش",35],
    ["العوينية",35],["القلعة - يفرن",35],["الرياينة",35],
    ["الرجان",35],["الزنتان",35],["الرجبان",35],["جادو",35],
    ["كاباو",35],["الرقيعات",35],["تيجي",35],["بدر",35],["الجوش",35]
  ]},
  {group:"الجنوب الشرقي",entries:[
    ["جالو",45],["أوجلة",45],["الواحات",45],["الكفرة",45]
  ]}
];

function normalizeArea(s:string):string {
  return s.normalize("NFKC").toLowerCase().trim()
    .replace(/[أإآٱ]/g,"ا").replace(/[ىي]/g,"ي")
    .replace(/ة/g,"ه").replace(/ـ/g,"")
    .replace(/[\u064B-\u065F]/g,"")
    .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
}

const canonicalEntries = SHIPPING_AREAS.flatMap(group =>
  group.entries.map(([area,price])=>({group:group.group,area,price}))
);
export function lookupAlmayarShipping(area:string):
 {status:"matched";group:string;area:string;price_lyd:number} |
 {status:"ambiguous"|"not_found";options:string[]} {
  const q=normalizeArea(area);
  if(!q) return {status:"not_found",options:[]};
  // Strict exact/normalized matching only, to prevent wrong delivery quote.
  const matches=canonicalEntries.filter(e=>normalizeArea(e.area)===q);
  if(matches.length===1) return {status:"matched",group:matches[0].group,
    area:matches[0].area,price_lyd:matches[0].price};
  return matches.length>1 ? {status:"ambiguous",options:matches.map(x=>x.group+" / "+x.area)} :
    {status:"not_found",options:[]};
}
export function shippingTableForModel():Array<{group:string;locations:Array<{name:string;price_lyd:number}>}> {
  return SHIPPING_AREAS.map(g=>({group:g.group,
    locations:g.entries.map(([name,price_lyd])=>({name,price_lyd}))}));
}
