import {describe,it,expect} from "vitest";
import {lookupAlmayarShipping} from "../lib/adoraShippingRates";
describe("Almayar source prices",()=>{
  it("applies owner overrides",()=>{
    expect(lookupAlmayarShipping("كريمية")).toMatchObject({status:"matched",price_lyd:20});
    expect(lookupAlmayarShipping("خلة")).toMatchObject({status:"matched",price_lyd:20});
  });
  it("matches representative regions",()=>{
    expect(lookupAlmayarShipping("درنة")).toMatchObject({status:"matched",price_lyd:40});
    expect(lookupAlmayarShipping("بني وليد")).toMatchObject({status:"matched",price_lyd:25});
    expect(lookupAlmayarShipping("الزاوية")).toMatchObject({status:"matched",price_lyd:20});
    expect(lookupAlmayarShipping("سرت")).toMatchObject({status:"matched",price_lyd:30});
  });
  it("does not guess unlisted areas",()=>{
    expect(lookupAlmayarShipping("اسم منطقة غير موجودة").status).toBe("not_found");
  });
});