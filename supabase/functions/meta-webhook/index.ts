// Meta Messenger + Instagram signed ingest. Keeps the existing 30-day RPC.
// Optional single-PSID Luna Messenger live test is OFF by default.
// The Meta webhook URL, verify token and signing secret remain unchanged.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const env=(key:string)=>Deno.env.get(key)?.trim()??"";
const VERIFY=env("META_VERIFY_TOKEN");
const APP_SECRET=env("META_APP_SECRET");
const URL=env("SUPABASE_URL");
const SERVICE=env("SUPABASE_SERVICE_ROLE_KEY");
const TEST_PSID=env("LUNA_TEST_PSID");
const PAGE_ID=env("LUNA_TEST_PAGE_ID")||"589433480926104";
const TEST_ON=env("LUNA_TEST_MODE")==="true";
const textEncoder=new TextEncoder();
type RecordObject=Record<string,unknown>;
const obj=(v:unknown):RecordObject|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as RecordObject:null;
const numericId=(v:unknown):v is string=>typeof v==="string"&&/^\d{1,128}$/.test(v);
const bounded=(v:unknown,max:number):v is string=>
 typeof v==="string"&&v.length>0&&v.length<=max;
const db=URL&&SERVICE?createClient(URL,SERVICE,{auth:{persistSession:false}}):null;

async function signed(bytes:ArrayBuffer,signature:string|null){
 if(!APP_SECRET||!signature||!/^sha256=[0-9a-f]{64}$/i.test(signature))return false;
 const key=await crypto.subtle.importKey("raw",textEncoder.encode(APP_SECRET),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const expected=new Uint8Array(await crypto.subtle.sign("HMAC",key,bytes));
 const hex=signature.slice(7);
 let mismatch=0;
 for(let i=0;i<32;i++) mismatch |= expected[i]^parseInt(hex.slice(i*2,i*2+2),16);
 return mismatch===0;
}
async function eventId(event:RecordObject){
 const mid=obj(event.message)?.mid;
 if(bounded(mid,180))return "mid:"+mid;
 const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",
  textEncoder.encode(JSON.stringify(event))));
 return "evt:"+[...hash].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function normalize(event:RecordObject){
 const message=obj(event.message),postback=obj(event.postback);
 if(!message&&!postback)return null;
 const raw=Array.isArray(message?.attachments)?message.attachments:[];
 if(raw.length>10)throw Error("TOO_MANY_ATTACHMENTS");
 const refs:RecordObject[]=[];
 for(const item of raw){
  const att=obj(item),payload=obj(att?.payload);
  if(!att)continue;
  const type=typeof att.type==="string"?att.type.slice(0,40):"other";
  const url=typeof payload?.url==="string"&&/^https:\/\//i.test(payload.url)&&
    payload.url.length<=500?payload.url:null;
  refs.push({type,...(url?{url}:{})});
 }
 const messageText=typeof message?.text==="string"?message.text:
  typeof postback?.payload==="string"?postback.payload:"";
 if(messageText.length>32000)throw Error("MESSAGE_TOO_LARGE");
 const kind=postback?"postback":refs.length?"attachment":messageText?"text":"other";
 return {kind,messageText,refs};
}
async function dispatch(sender:string,page:string,event:string){
 if(!TEST_ON||!numericId(TEST_PSID)||sender!==TEST_PSID||page!==PAGE_ID)return;
 if(!URL||!SERVICE)throw Error("LUNA_DB_NOT_READY");
 try{
  const res=await fetch(URL+"/functions/v1/adora-agent",{
   method:"POST",headers:{"authorization":"Bearer "+SERVICE,"apikey":SERVICE,
    "content-type":"application/json"},
   body:JSON.stringify({channel:"messenger",page_id:page,sender_id:sender,event_id:event}),
   signal:AbortSignal.timeout(40000)
  });
  if(!res.ok)console.error("LUNA_TEST_DISPATCH_HTTP",res.status);
 }catch{console.error("LUNA_TEST_DISPATCH_UNAVAILABLE");}
}
async function ingest(payload:RecordObject){
 if(!db)throw Error("DB_NOT_CONFIGURED");
 const channel=payload.object==="page"?"messenger":"instagram";
 if(!Array.isArray(payload.entry)||payload.entry.length>100)throw Error("INVALID_META_ENTRIES");
 const counts={stored_pending:0,stored_human:0,duplicate:0,skipped:0,dispatched:0};
 for(const rawEntry of payload.entry){
  const entry=obj(rawEntry);
  if(!numericId(entry?.id)){counts.skipped++;continue;}
  const page=entry.id;
  for(const [kind,standby] of [["messaging",false],["standby",true]] as const){
   const events=entry[kind];
   if(!Array.isArray(events))continue;
   if(events.length>100)throw Error("TOO_MANY_EVENTS");
   for(const rawEvent of events){
    const event=obj(rawEvent);
    if(!event){counts.skipped++;continue;}
    const source=obj(event.sender)?.id;
    const dest=obj(event.recipient)?.id;
    const echo=obj(event.message)?.is_echo===true;
    const sender=echo?dest:source;
    const normalized=normalize(event);
    if(!numericId(sender)||sender===page||!normalized||
      (echo&&source!==page)||(typeof dest==="string"&&!echo&&dest!==page)){
      counts.skipped++;continue;
    }
    const eid=await eventId(event);
    const {data,error}=await db.rpc("luna_accept_message_30d",{
     p_channel:channel,p_page_id:page,p_sender_id:sender,p_event_id:eid,
     p_event_kind:normalized.kind,p_message_text:normalized.messageText,
     p_attachment_refs:normalized.refs,p_standby:standby||echo
    });
    if(error)throw Error("LUNA_STORE_FAILED_"+(error.code??"UNKNOWN"));
    if(data==="stored_pending"){
     counts.stored_pending++;
     if(channel==="messenger"&&!standby&&!echo&&TEST_ON&&sender===TEST_PSID&&page===PAGE_ID){
      // ACK Meta before AI completes; no queue is created.
      // waitUntil is scoped to this edge invocation and is not a recurring job.
      try{
       EdgeRuntime.waitUntil(dispatch(sender,page,eid));
       counts.dispatched++;
      }catch{
       // If runtime does not provide waitUntil, execute directly instead.
       await dispatch(sender,page,eid);
       counts.dispatched++;
      }
     }
    }else if(data==="stored_human")counts.stored_human++;
    else if(data==="duplicate")counts.duplicate++;
    else throw Error("UNEXPECTED_LUNA_ACCEPT_RESULT");
   }
  }
 }
 return counts;
}
Deno.serve(async req=>{
 if(!VERIFY||!APP_SECRET)return new Response("Configuration unavailable",{status:503});
 if(req.method==="GET"){
  const url=new URL(req.url);
  const match=url.searchParams.get("hub.mode")==="subscribe"&&
   url.searchParams.get("hub.verify_token")===VERIFY;
  return match&&url.searchParams.has("hub.challenge")
   ?new Response(url.searchParams.get("hub.challenge"),{status:200})
   :new Response("Forbidden",{status:403});
 }
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const cap=1024*1024;
 const len=Number(req.headers.get("content-length")??0);
 if(Number.isFinite(len)&&len>cap)return new Response("Payload too large",{status:413});
 const raw=await req.arrayBuffer();
 if(raw.byteLength>cap)return new Response("Payload too large",{status:413});
 if(!(await signed(raw,req.headers.get("x-hub-signature-256"))))
  return new Response("Invalid signature",{status:403});
 let payload:RecordObject|null;
 try{payload=obj(JSON.parse(new TextDecoder().decode(raw)));}
 catch{return new Response("Invalid JSON",{status:400});}
 if(!payload||!["page","instagram"].includes(String(payload.object)))
  return new Response("Invalid event",{status:400});
 try{
  const counts=await ingest(payload);
  console.log("LUNA_META_INGEST_COUNTS",counts); // No personal data logged.
  return new Response("EVENT_RECEIVED",{status:200});
 }catch(error){
  console.error("LUNA_META_INGEST_FAILED",error instanceof Error?error.message:"UNKNOWN");
  return new Response("Retry later",{status:503});
 }
});
