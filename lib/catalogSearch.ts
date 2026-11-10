/**
 * Search normalization is deliberately independent of Luna.
 * All interpretations come from existing catalog values; no invented products.
 * Exact product codes remain STRICT and never use fuzzy matching.
 */
const BRAND_ALIASES: Record<string, string[]> = {
  "dior": ["ديور", "ديورر", "ديورز", "ديورى", "ديور"],
  "victoria secret": ["victorias secret", "victoria's secret", "vs", "فيكتوريا سيكرت", "فيكتوريا سكريت", "فكتوريا سيكرت", "فكتوريا سكريت", "فيكتوريا", "فكتوريا"],
  "fendi": ["فندي", "فيندي", "فندى"],
  "chanel": ["شانيل", "شنيل"],
  "gucci": ["قوتشي", "غوتشي", "جوتشي", "غوتشى", "قوتشى"],
  "prada": ["برادا", "پرادا"],
  "louis vuitton": ["لويس فيتون", "لوي فيتون", "لويس فيتـون"],
  "hm": ["h m", "h&m", "اتش اند ام", "اتش ام"],
  "zara": ["زارا"],
  "primark": ["برايمارك", "بريمارك", "بريماك"],
};

const COLOR_ALIASES: Record<string, string[]> = {
  "ازرق": ["ازرق", "أزرق", "ازرء", "ازرك", "blue", "بلو"],
  "وردي": ["وردى", "وردي", "روز", "pink", "بينك", "زهري", "زهرى"],
  "اسود": ["أسود", "اسود", "black", "بلاك"],
  "ابيض": ["أبيض", "ابيض", "white", "وايت"],
  "كحلي": ["كحلي", "كحلى", "نافي", "navy", "navy blue"],
  "بيج": ["بيج", "beige", "بيچ"],
  "موف": ["موف", "mauve"],
  "فوشي": ["فوشي", "فوشيا", "فوشيه", "fuchsia", "fuschia"],
  "رمادي": ["رمادي", "رمادى", "رصاصي", "رصاصى", "grey", "gray"],
  "بني": ["بني", "بنى", "brown", "براون"],
  "اخضر": ["أخضر", "اخضر", "green", "جرين"],
  "احمر": ["أحمر", "احمر", "red", "ريد"],
  "سماوي": ["سماوي", "سماوى", "sky blue"],
  "زيتي": ["زيتي", "زيتى", "olive"],
  "نود": ["نود", "nude"],
  "كريمي": ["كريمي", "كريمى", "cream"],
  "عنابي": ["عنابي", "عنابى", "برغندي", "برجندي", "burgundy"],
};

export function normalizeSearchText(input: string): string {
  return String(input || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, "") // Arabic diacritics and tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ۀہ]/g, "ه")
    .replace(/ڤ/g, "ف")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/گ/g, "ك")
    .replace(/&/g, " and ")
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9\u0621-\u064a]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

function lookupAliases(kind: "brand" | "color", value: string): Set<string> {
  const normalized = normalizeSearchText(value);
  const aliases = kind === "brand" ? BRAND_ALIASES : COLOR_ALIASES;
  const result = new Set<string>([normalized]);
  for (const [canonical, alternatives] of Object.entries(aliases)) {
    const variants = [canonical, ...alternatives].map(normalizeSearchText);
    if (variants.includes(normalized)) variants.forEach(v => result.add(v));
  }
  // If a catalog name is an alias, all of its known equivalents are valid.
  return result;
}

function editDistance(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({length:b.length+1}, (_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row = [i];
    let min = i;
    for(let j=1;j<=b.length;j++){
      const delta = a.charAt(i-1) === b.charAt(j-1) ? 0 : 1;
      const n = Math.min(previous[j]+1, row[j-1]+1, previous[j-1]+delta);
      row.push(n); if(n<min) min=n;
    }
    if(min>maxDistance) return maxDistance+1;
    previous=row;
  }
  return previous[b.length];
}

function candidateScore(query: string, candidate: string, kind: "brand"|"color"): number {
  const q=normalizeSearchText(query), c=normalizeSearchText(candidate);
  if(!q || !c) return 0;
  if(q===c) return 100;
  const qAliases=lookupAliases(kind,query);
  const cAliases=lookupAliases(kind,candidate);
  if([...qAliases].some(a=>cAliases.has(a))) return 95;
  if(q.length>=3 && c.length>=3 && (c.startsWith(q+" ") || q.startsWith(c+" "))) return 83;
  // Do not map a partial color word (e.g. blue) to every shade containing it.
  if(kind==="color" && (c.includes(" ") || q.includes(" "))) return 0;
  const short=Math.min(q.length,c.length);
  if(short < 4) return 0;
  const maximum = short >= 8 ? 2 : 1;
  const dist = editDistance(q,c,maximum);
  if(dist<=maximum) return 75 - dist*5;
  // Misspelling on a known translated brand/color variant, e.g. ديورر.
  for(const a of qAliases){
    for(const b of cAliases){
      if(a===q&&b===c) continue;
      const smaller=Math.min(a.length,b.length);
      if(smaller<4) continue;
      const limit=smaller>=8?2:1;
      const d=editDistance(a,b,limit);
      if(d<=limit) return 72-d*5;
    }
  }
  return 0;
}

export type MatchDecision = {
  status: "matched"|"ambiguous"|"not_found";
  confidence: "exact"|"alias"|"fuzzy"|null;
  matches: string[];
  suggestions: string[];
};

/** Never choose a close guess when multiple catalog names rank equally. */
export function selectCatalogNames(
  kind:"brand"|"color", query:string, candidates:string[]
): MatchDecision {
  const grouped = new Map<string,string>();
  for(const candidate of candidates){
    const key=normalizeSearchText(candidate);
    if(key&&!grouped.has(key)) grouped.set(key,candidate);
  }
  const ranked = [...grouped.values()].map(name=>({
    name,score:candidateScore(query,name,kind)
  })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
  if(!ranked.length) return {status:"not_found",confidence:null,matches:[],suggestions:[]};
  const top=ranked[0].score;
  const best=ranked.filter(x=>x.score===top);
  if(best.length>1) return {
    status:"ambiguous",confidence:null,matches:[],
    suggestions:best.map(x=>x.name).slice(0,8),
  };
  // Color aliases like وردي / زهري may correspond to distinct stored colors:
  // don't arbitrarily pick one. Return BOTH exactly equivalent entries for a color.
  if(kind==="color" && top>=95) {
    const equivalents=ranked.filter(x=>x.score>=95).map(x=>x.name);
    return {status:"matched",confidence:top===100?"exact":"alias",matches:equivalents,suggestions:[]};
  }
  // Brand name may be stored under different spelling variants; only return best
  // selection if it is sufficiently distinct.
  if(top<95 && ranked[1] && ranked[1].score >= top-5) return {
    status:"ambiguous",confidence:null,matches:[],
    suggestions:ranked.filter(x=>x.score>=top-5).slice(0,8).map(x=>x.name),
  };
  return {
    status:"matched",confidence:top===100?"exact":top>=90?"alias":"fuzzy",
    matches:[ranked[0].name],suggestions:[],
  };
}
