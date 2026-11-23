// Luna Messenger live-test engine.
// Strict allowlist: only the specific test PSID can receive AI replies.
// No order writes, no generic auto-response, no queue or background worker.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ADORA_AGENT_POLICY, ADORA_POLICY_VERSION } from "../_shared/adoraAgentPolicy.ts";
import { SHIPPING_AREAS } from "../_shared/adoraShippingRates.ts";
import { deliveryWindow, tripoliLocalHour } from "../_shared/adoraDeliveryPolicy.ts";
import { calculateAdoraOrderQuote } from "../_shared/adoraDiscountRules.ts";

const env=(k:string)=>Deno.env.get(k)?.trim()??"";
const dbUrl=env("SUPABASE_URL");
const serviceKey=env("SUPABASE_SERVICE_ROLE_KEY");
const testPsid=env("LUNA_TEST_PSID");
const pageId=env("LUNA_TEST_PAGE_ID")||"589433480926104";
const enabled=env("LUNA_TEST_MODE")==="true";
const metaToken=env("META_PAGE_ACCESS_TOKEN");
const openaiKey=env("OPENAI_API_KEY");
const model="gpt-6-luna";
const db=dbUrl&&serviceKey?createClient(dbUrl,serviceKey,{auth:{persistSession:false}}):null;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const id=(x:unknown):x is string=>typeof x==="string"&&/^\d{1,128}$/.test(x);
const norm=(s:string)=>s.normalize("NFKC").toLowerCase()
  .replace(/[أإآٱ]/g,"ا").replace(/[ىي]/g,"ي").replace(/ة/g,"ه")
  .replace(/[\u064b-\u065f]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const ALLOWED_STATUS=new Set(["pending"]);
type Msg={event_id:string;sender_id:string;message_text:string;event_kind:string;
  attachment_refs:unknown;received_at:string;handling_status:string};
const intentEnum=["reply","ask_clarification","needs_erp_lookup","handoff"] as const;
const structured={
 type:"object",properties:{
  action:{type:"string",enum:[...intentEnum]},
  intent:{type:"string",enum:["product_question","purchase","shipping","tracking","change_order","cancel_order","returns","greeting","other"]},
  product_code:{type:["string","null"]},reply:{type:"string"},reason:{type:"string"}
 },required:["action","intent","product_code","reply","reason"],additionalProperties:false
};

function findCodes(messages:Msg[]):string[]{
 const codes=new Set<string>();
 for(const m of messages)for(const hit of m.message_text.toUpperCase().matchAll(/(?:^|[^A-Z0-9])([A-Z][0-9]{2,6})(?=$|[^A-Z0-9])/g))
  codes.add(hit[1]);
 return [...codes].slice(-6);
}
function pricesFromMessage(text:string){
 const q=norm(text), candidates=SHIPPING_AREAS.flatMap(g=>g.entries.map(([name,price])=>({name,price,group:g.group})));
 // Prefer the longest matching place to avoid accepting a city substring of a named district.
 return candidates.filter(c=>q===norm(c.name)||q.includes(" "+norm(c.name)+" ")||
  q.startsWith(norm(c.name)+" ")||q.endsWith(" "+norm(c.name)))
  .sort((a,b)=>b.name.length-a.name.length).slice(0,3);
}
async function facts(codes:string[]){
 if(!db||!codes.length)return [];
 const {data:links,error:e1}=await db.from("agent_product_codes")
  .select("code,product_id,color_name,is_active").in("code",codes).eq("is_active",true).limit(6);
 if(e1)throw Error("CATALOG_LINKS_FAILED");
 const results=[];
 for(const link of links??[]){
  const {data:prod,error:e2}=await db.from("products").select("id,name,store_id,is_active")
   .eq("id",link.product_id).eq("is_active",true).maybeSingle();
  if(e2)throw Error("CATALOG_PRODUCT_FAILED");
  if(!prod)continue;
  const {data:sizes,error:e3}=await db.from("product_variants")
   .select("size,stock_quantity,sale_price,is_active")
   .eq("product_id",prod.id).eq("store_id",prod.store_id).eq("is_active",true).limit(12);
  if(e3)throw Error("CATALOG_VARIANTS_FAILED");
  results.push({code:link.code,name:prod.name,color:link.color_name,
    sizes:(sizes??[]).map(v=>({size:v.size,available:Number(v.stock_quantity)>0,price_lyd:Number(v.sale_price)}))});
 }
 return results;
}
async function modelDecision(history:Msg[],summary:string){
 const latest=history[history.length-1];
 const codes=findCodes(history);
 const catalog=await facts(codes);
 const shipping=pricesFromMessage(latest.message_text??"");
 const relevantShipment=shipping.length===1?shipping[0]:null;
 const city=/(طرابلس|بنغازي|مصراته|مصراتة)/.test(latest.message_text);
 const localHour=tripoliLocalHour(new Date());
 const delivery=city?deliveryWindow(
    /بنغازي/.test(latest.message_text)?"بنغازي":
    /مصرات/.test(latest.message_text)?"مصراتة":"طرابلس",localHour):null;
 const customerHistory=history.slice(-24).map(m=>({
   at:m.received_at,
   text:m.message_text.slice(0,1200),
   has_attachment:Array.isArray(m.attachment_refs)&&m.attachment_refs.length>0,
   kind:m.event_kind
 }));
 const body={
  messages:customerHistory,summary:summary.slice(0,512),current_message:latest.message_text.slice(0,1800),
  verified_catalog:catalog,shipping_rate:relevantShipment,
  shipping_requires_area_in:["طرابلس","بنغازي","مصراتة"],
  delivery_estimate:delivery,
  policy_version:ADORA_POLICY_VERSION,
  discount_lyd_per_unit:10
 };
 const request=await fetch("https://api.openai.com/v1/responses",{
  method:"POST",headers:{authorization:"Bearer "+openaiKey,"content-type":"application/json"},
  body:JSON.stringify({model,store:false,instructions:ADORA_AGENT_POLICY,
    input:JSON.stringify(body),max_output_tokens:500,
    text:{format:{type:"json_schema",name:"luna_response",schema:structured,strict:true}}}),
  signal:AbortSignal.timeout(30000)
 });
 if(!request.ok)throw Error("OPENAI_HTTP_"+request.status);
 const data=await request.json();
 const raw=(data.output??[]).filter((x:{type:string})=>x.type==="message")
  .flatMap((x:{content?:Array<{type:string;text?:string}>})=>(x.content??[])
   .filter(y=>y.type==="output_text").map(y=>y.text??"")).join("");
 let result:Record<string,unknown>;
 try{result=JSON.parse(raw);}catch{throw Error("AI_RESPONSE_PARSE_FAILED");}
 if(!intentEnum.includes(result.action as typeof intentEnum[number])||
   typeof result.reply!=="string"||typeof result.reason!=="string")throw Error("AI_RESPONSE_INVALID");
 // Fail closed on facts needing ERP writes or inspection, regardless of model assertions.
 if(["change_order","cancel_order","tracking","returns"].includes(String(result.intent))){
  result.action=String(result.intent)==="returns"?"handoff":"needs_erp_lookup";
  result.reply=String(result.intent)==="returns"?"بنحول طلب التبديل أو الترجيع للموظف.":
    "بنراجع تفاصيل طلبك أولًا.";
 }
 if(codes.length&&catalog.length===0&&String(result.intent)==="product_question"){
  result.action="ask_clarification";result.reply="شن كود المنتج باش نتأكد من السعر والتوفر؟";
 }
 if(String(result.intent)==="shipping"&&!relevantShipment){
  result.action="ask_clarification";result.reply="شن المدينة والمنطقة بالتحديد؟";
 }
 // Formula is pure; never writes to ERP. Do not double-discount a possibly pre-discounted ERP price.
 if(String(result.intent)==="purchase"&&result.action==="reply"){
  result.action="ask_clarification";
  if(/(تم تأكيد|تم تسجيل|أنشأت|سجلت طلب)/.test(String(result.reply)))
   result.reply="باش نكمل البيانات، شن رقم المستلم والعنوان والمقاس؟";
 }
 return {action:String(result.action),intent:String(result.intent),reply:String(result.reply).slice(0,600),
  reason:String(result.reason).slice(0,200),catalog_count:catalog.length};
}
async function status(event:string,sender:string,from:string,to:string){
 if(!db)throw Error("DB_NOT_READY");
 const {data,error}=await db.from("luna_messages").update({
  handling_status:to,processed_at:to==="processed"?new Date().toISOString():null
 }).eq("channel","messenger").eq("page_id",pageId).eq("sender_id",sender)
   .eq("event_id",event).eq("handling_status",from).select("event_id");
 if(error)throw Error("STATUS_CHANGE_FAILED");
 return (data??[]).length===1;
}
async function deliver(sender:string,message:string){
 if(!metaToken)throw Error("META_TOKEN_MISSING");
 const res=await fetch("https://graph.facebook.com/v26.0/me/messages",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({access_token:metaToken,recipient:{id:sender},
   messaging_type:"RESPONSE",message:{text:message.slice(0,600)}}),
  signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error("META_SEND_HTTP_"+res.status);
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 // Only the deployed webhook can call this with the server's service_role key.
 if(!db||!serviceKey||req.headers.get("authorization")!=="Bearer "+serviceKey)
  return json({error:"UNAUTHORIZED"},401);
 if(!enabled||!testPsid||!id(testPsid)||!openaiKey||!metaToken)
  return json({skipped:true,reason:"TEST_NOT_CONFIGURED"});
 let args:Record<string,unknown>;
 try{args=await req.json();}catch{return json({error:"INVALID_REQUEST"},400);}
 if(args.channel!=="messenger"||args.page_id!==pageId||args.sender_id!==testPsid||
   !id(args.sender_id)||typeof args.event_id!=="string"||
   args.event_id.length<1||args.event_id.length>190)
  return json({skipped:true,reason:"NOT_TEST_PSID"});
 const sender=testPsid,event=String(args.event_id);
 const {data:owner,error:oe}=await db.from("luna_conversation_state")
  .select("owner_mode,context_summary").eq("channel","messenger").eq("page_id",pageId)
  .eq("sender_id",sender).maybeSingle();
 if(oe)return json({error:"OWNER_LOOKUP_FAILED"},503);
 if(owner?.owner_mode!=="luna")return json({skipped:true,reason:"HUMAN_OWNER"});
 const {data:current,error:ce}=await db.from("luna_messages")
  .select("event_id,sender_id,message_text,event_kind,attachment_refs,received_at,handling_status")
  .eq("channel","messenger").eq("page_id",pageId).eq("sender_id",sender)
  .eq("event_id",event).maybeSingle();
 if(ce||!current)return json({error:"MESSAGE_NOT_FOUND"},404);
 if(!ALLOWED_STATUS.has(current.handling_status))return json({skipped:true,reason:"NOT_PENDING"});
 if(!current.message_text?.trim()){
  await status(event,sender,"pending","needs_review");
  return json({skipped:true,reason:"MEDIA_REVIEW_REQUIRED"});
 }
 if(!(await status(event,sender,"pending","processing")))
  return json({skipped:true,reason:"ALREADY_CLAIMED"});
 // Mark failed on model errors. Never automatically retry a message once a send may have started.
 try{
  const {data:rows,error:he}=await db.from("luna_messages")
   .select("event_id,sender_id,message_text,event_kind,attachment_refs,received_at,handling_status")
   .eq("channel","messenger").eq("page_id",pageId).eq("sender_id",sender)
   .gte("received_at",new Date(Date.now()-30*86400000).toISOString())
   .lte("received_at",current.received_at).order("received_at",{ascending:false}).limit(40);
  if(he)throw Error("HISTORY_QUERY_FAILED");
  const history=[...((rows??[]) as Msg[])].reverse();
  if(!history.some(x=>x.event_id===event))history.push(current as Msg);
  const decision=await modelDecision(history,owner?.context_summary??"");
  if(decision.action==="handoff"||decision.action==="needs_erp_lookup"){
   await status(event,sender,"processing","needs_review");
   return json({handled:false,reason:decision.action});
  }
  if(!decision.reply.trim()){
   await status(event,sender,"processing","needs_review");
   return json({handled:false,reason:"EMPTY_REPLY"});
  }
  // Final allowlist and ownership checks immediately before sending.
  if(env("LUNA_TEST_MODE")!=="true"||env("LUNA_TEST_PSID")!==sender)
   return json({handled:false,reason:"TEST_DISABLED"});
  const {data:check}=await db.from("luna_conversation_state").select("owner_mode")
   .eq("channel","messenger").eq("page_id",pageId).eq("sender_id",sender).maybeSingle();
  if(check?.owner_mode!=="luna"){
   await status(event,sender,"processing","needs_review");
   return json({handled:false,reason:"HUMAN_OWNER_NOW"});
  }
  // Sending can be ambiguous on timeout: on any failure keep NEEDS_REVIEW, never auto-retry.
  try{await deliver(sender,decision.reply);}
  catch{
   await status(event,sender,"processing","needs_review");
   return json({error:"META_SEND_UNCONFIRMED",manual_review:true},503);
  }
  await status(event,sender,"processing","processed");
  return json({sent:true,model,policy:ADORA_POLICY_VERSION});
 }catch(e){
  await status(event,sender,"processing","needs_review").catch(()=>false);
  const reason=e instanceof Error?e.message:"UNKNOWN";
  console.error("LUNA_TEST_FAILED",reason);
  return json({error:"AGENT_FAILED",reason},503);
 }
});
