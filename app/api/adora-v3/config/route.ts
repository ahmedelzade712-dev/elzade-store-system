import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const CORS={"Access-Control-Allow-Origin":"https://adora.ly","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"public, max-age=30, s-maxage=30","Vary":"Origin"};
export async function OPTIONS(){return new NextResponse(null,{status:204,headers:CORS})}
export async function GET(req:Request){
 const origin=req.headers.get("origin")||"";
 const allowed=["https://adora.ly","https://www.adora.ly"].includes(origin)?origin:"https://adora.ly";
 const headers={...CORS,"Access-Control-Allow-Origin":allowed};
 const {data,error}=await supabaseAdmin.storage.from("adora-v3-editor").download("config.json");
 if(error||!data)return NextResponse.json({ok:true,published:false,config:null},{headers});
 try{
  const config=JSON.parse(await data.text());
  return NextResponse.json({ok:true,published:true,config},{headers});
 }catch{return NextResponse.json({ok:false,published:false},{headers,status:503})}
}
