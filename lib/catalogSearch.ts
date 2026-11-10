export type SearchField = "brand" | "color";

export const BRAND_ALIASES: Record<string, string[]> = {
  "dior": ["ديور", "ديور باريس"],
  "fendi": ["فندي", "فيندي"],
  "louis vuitton": ["لويس فيتون", "لوي فيتون", "لويس ڤيتون", "لويس فويتون", "ال في", "lv"],
  "victoria secret": ["فيكتوريا سيكريت", "فيكتوريا سكريت", "فكتوريا سيكريت", "فكتوريا سكريت", "فيكتوريا", "فكتوريا", "victorias secret", "victoria's secret", "victoria secrets", "vs"],
};

export const COLOR_ALIASES: Record<string, string[]> = {
  "ازرق": ["أزرق", "ازرق", "الازرق", "الأزرق", "blue"],
  "اسود": ["أسود", "اسود", "الاسود", "الأسود", "black"],
  "ابيض": ["أبيض", "ابيض", "الابيض", "الأبيض", "white"],
  "احمر": ["أحمر", "احمر", "الاحمر", "الأحمر", "red"],
  "اخضر": ["أخضر", "اخضر", "الاخضر", "الأخضر", "green"],
  "وردي": ["الوردي", "زهري", "pink"],
  "موف": ["الموف", "mauve"],
  "كحلي": ["الكحلي", "navy", "navy blue"],
  "سماوي": ["السماوي", "sky blue", "light blue"],
  "بني": ["البني", "brown"],
  "فوشيا": ["فوشي", "فوشيه", "fuchsia"],
  "برغندي": ["برجندي", "عنابي", "burgundy"],
  "نود": ["نيود", "nude"],
};

export function normalizeCatalogText(input: string): string {
  return input.normalize("NFKC").toLocaleLowerCase("en")
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ؤ/g, "و")
    .replace(/[ئىي]/g, "ي").replace(/ة/g, "ه")
    .replace(/ڤ/g, "ف").replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function aliasesFor(field: SearchField, name: string): string[] {
  const dictionary = field === "brand" ? BRAND_ALIASES : COLOR_ALIASES;
  const key = normalizeCatalogText(name);
  const record = Object.entries(dictionary).find(([canonical, names]) =>
    normalizeCatalogText(canonical) === key ||
    names.some(x => normalizeCatalogText(x) === key));
  return [...new Set([name, ...(record ? [record[0], ...record[1]] : [])].map(normalizeCatalogText))];
}

function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 },
    () => Array<number>(b.length + 1).fill(0));
  for (let i=0;i<=a.length;i++) d[i][0]=i;
  for (let j=0;j<=b.length;j++) d[0][j]=j;
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) {
    const cost=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+cost);
    if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1])
      d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}

export type SearchResolution = {
  status: "matched" | "ambiguous" | "not_found";
  values: string[];
  suggestions: string[];
  quality?: "exact" | "alias" | "fuzzy";
};

export function resolveCatalogSearch(
  field: SearchField, query: string, options: readonly string[]
): SearchResolution {
  const q=normalizeCatalogText(query);
  if(!q) return {status:"not_found",values:[],suggestions:[]};
  const unique=[...new Set(options.map(x=>x.trim()).filter(Boolean))];
  const scored=unique.map(value=>{
    const aliases=aliasesFor(field,value);
    const exact=normalizeCatalogText(value)===q;
    const alias=aliases.includes(q);
    const max=q.replace(/\s/g,"").length>=9?2:q.replace(/\s/g,"").length>=4?1:0;
    const dist=Math.min(...aliases.map(x=>distance(q,x)));
    return {value,rank:exact?3:alias?2:dist<=max?1:0,dist:exact||alias?0:dist};
  }).filter(x=>x.rank>0)
    .sort((a,b)=>b.rank-a.rank||a.dist-b.dist||a.value.localeCompare(b.value));
  if(!scored.length) return {status:"not_found",values:[],suggestions:[]};
  const best=scored[0];
  const top=scored.filter(x=>x.rank===best.rank&&x.dist===best.dist);
  // Equivalent written colors such as أزرق and ازرق are one identity.
  const sameIdentity=top.every(x=>normalizeCatalogText(x.value)===normalizeCatalogText(top[0].value));
  if(top.length>1&&!sameIdentity)
    return {status:"ambiguous",values:[],suggestions:top.map(x=>x.value)};
  const values=unique.filter(v=>normalizeCatalogText(v)===normalizeCatalogText(top[0].value));
  return {status:"matched",values,suggestions:[],
    quality:best.rank===3?"exact":best.rank===2?"alias":"fuzzy"};
}
