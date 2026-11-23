import {test} from "node:test";
import assert from "node:assert/strict";
import {lookupAlmayarShipping} from "../lib/adoraShippingRates";
test("Almayar owner corrected locations",()=>{
  assert.deepEqual((lookupAlmayarShipping("كريمية") as {price_lyd:number}).price_lyd,20);
  assert.deepEqual((lookupAlmayarShipping("خلة") as {price_lyd:number}).price_lyd,20);
});
test("Almayar representative source rates",()=>{
  for(const [area,price] of [["درنة",40],["بني وليد",25],["الزاوية",20],["سرت",30]] as const){
    const entry=lookupAlmayarShipping(area);
    assert.equal(entry.status,"matched",area);
    if(entry.status==="matched")assert.equal(entry.price_lyd,price,area);
  }
});
test("Unknown locations are not guessed",()=>{
  assert.equal(lookupAlmayarShipping("غير موجودة").status,"not_found");
});