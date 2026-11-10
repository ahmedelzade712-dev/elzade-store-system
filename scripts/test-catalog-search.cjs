// Offline, deterministic tests: no network, Supabase, or test products.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const file = fs.readFileSync(path.join(__dirname,"../lib/catalogSearch.ts"),"utf8");
const js = ts.transpileModule(file, {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText;
const moduleObj = {exports:{}};
vm.runInNewContext(js,{module:moduleObj,exports:moduleObj.exports,require});
const {normalizeSearchText, selectCatalogNames} = moduleObj.exports;

function matches(kind,input,candidates,expected){
  const result=selectCatalogNames(kind,input,candidates);
  assert.equal(result.status,"matched",JSON.stringify({kind,input,result}));
  assert.deepEqual([...result.matches].sort(),[...expected].sort(),input);
}
assert.equal(normalizeSearchText("أزرق"),normalizeSearchText("ازرق"));
assert.equal(normalizeSearchText("وَرْدِيّ"),normalizeSearchText("وردي"));
assert.equal(normalizeSearchText("أحْمَر"),normalizeSearchText("احمر"));
matches("brand","ديور",["Dior","Fendi"],["Dior"]);
matches("brand","ديورر",["Dior","Fendi"],["Dior"]);
matches("brand","ديير",["Dior","Fendi"],["Dior"]);
matches("brand","Dior",["Dior","ديور","Fendi"],["Dior","ديور"]);
matches("brand","فيكتوريا سكريت",["Victoria secret","Dior"],["Victoria secret"]);
matches("brand","فكتوريا سيكرت",["Victoria secret","Dior"],["Victoria secret"]);
matches("brand","فيندي",["Fendi","Dior"],["Fendi"]);
matches("color","أزرق",["ازرق","أزرق","أسود"],["ازرق"]);
matches("color","وردي",["وردي","زهري","كحلي"],["وردي","زهري"]);
matches("color","كحلى",["كحلي","أزرق"],["كحلي"]);
matches("color","موف هاد",["موف هادي","موف","كحلي"],["موف هادي"]);
assert.equal(selectCatalogNames("brand","غير موجود",["Dior","Fendi"]).status,"not_found");
assert.equal(selectCatalogNames("color","روز",["وردي","كحلي"]).status,"matched");
console.log("Catalog smart-search tests passed: 14 checks");