import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import typescript from "typescript";

// Exercise the actual TypeScript module without adding a runtime dependency.
const ts=readFileSync(new URL("../lib/catalogSearch.ts", import.meta.url),"utf8");
const js=typescript.transpileModule(ts,{compilerOptions:{module:typescript.ModuleKind.CommonJS,target:typescript.ScriptTarget.ES2022}}).outputText;
const exports={};
new Script(js,{filename:"catalogSearch.cjs"}).runInNewContext({exports,Set,Math,Array,Object,String,RegExp});
const {resolveCatalogSearch,normalizeCatalogText}=exports;

const brands=["Dior","Fendi","Louis Vuitton","Victoria secret"];
const colors=["أبيض","أحمر","أخضر","أزرق","أسود","ازرق","برغندي","بني","سماوي","فوشيا","كحلي","موف","نود","وردي"];
const cases=[
  ["brand","ديور","Dior"],
  ["brand","دِيُورْ","Dior"],
  ["brand","ديورر","Dior"],
  ["brand","فندي","Fendi"],
  ["brand","فيندي","Fendi"],
  ["brand","لويس فيتون","Louis Vuitton"],
  ["brand","فيكتوريا سكريت","Victoria secret"],
  ["brand","فكتوريا سيكريت","Victoria secret"],
  ["brand","فيكتوريا","Victoria secret"],
  ["brand","Victoria's Secret","Victoria secret"],
  ["color","ازرق","أزرق"],
  ["color","أزرق","ازرق"],
  ["color","ازر ق","أزرق"],
  ["color","الاسود","أسود"],
  ["color","وردي","وردي"],
  ["color","pink","وردي"],
  ["color","سماوي","سماوي"],
  ["color","sky blue","سماوي"],
  ["color","نود","نود"],
];
for(const [field,query,expected] of cases){
  const result=resolveCatalogSearch(field,query,field==="brand"?brands:colors);
  assert.equal(result.status,"matched",JSON.stringify({field,query,result}));
  assert.ok(result.values.includes(expected),JSON.stringify({field,query,result}));
}
assert.equal(normalizeCatalogText("الأزرق"),normalizeCatalogText("الازرق"));
assert.equal(resolveCatalogSearch("brand","د",brands).status,"not_found");
assert.equal(resolveCatalogSearch("brand","علامة غير معروفة",brands).status,"not_found");
assert.equal(resolveCatalogSearch("brand","ديور",["Dior","Diorx"]).status,"matched");
console.log("Catalog search regression checks passed:",cases.length+4);
