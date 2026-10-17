import Stripe from "stripe";
import { requireOfficeUser } from "../../../lib/requireOfficeUser";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed"});
 try{
  const auth=await requireOfficeUser(req);
  if(!auth.ok)return res.status(401).json({ok:false,error:auth.error});
  if(!process.env.STRIPE_SECRET_KEY)throw Error("Stripe is not configured");
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const db=getSupabaseAdmin();
  const {data:sub,error}=await db.from("subscribers").select("id,company_name,stripe_connect_account_id").eq("id",auth.subscriber_id).single();
  if(error)throw error;
  let accountId=sub.stripe_connect_account_id;
  if(!accountId){
   const account=await stripe.accounts.create({type:"standard",country:"GB",business_profile:{name:sub.company_name||undefined},metadata:{subscriber_id:sub.id}});
   accountId=account.id;
   const {error:saveError}=await db.from("subscribers").update({stripe_connect_account_id:accountId}).eq("id",sub.id).is("stripe_connect_account_id",null);
   if(saveError)throw saveError;
  }
  // Standard accounts are Stripe-managed: confirm we have not linked a platform-liable account.
  const linkedAccount=await stripe.accounts.retrieve(accountId);
  if(linkedAccount.controller?.losses?.payments==="application"){
    return res.status(409).json({ok:false,error:"This account assigns payment losses to SkipLogic. Please contact support before proceeding."});
  }
  const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL||"https://skip-logic.vercel.app").origin;
  const link=await stripe.accountLinks.create({account:accountId,refresh_url:origin+"/app/settings/online-booking?stripe=refresh",return_url:origin+"/app/settings/online-booking?stripe=return",type:"account_onboarding"});
  return res.json({ok:true,url:link.url});
 }catch(e){return res.status(500).json({ok:false,error:e.message||"Unable to start Stripe onboarding"})}
}
