import Stripe from "stripe";
import {requireOfficeUser} from "../../../lib/requireOfficeUser";
import {getSupabaseAdmin} from "../../../lib/supabaseAdmin";
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"Method not allowed"});
 try{
  const auth=await requireOfficeUser(req);
  if(!auth.ok)return res.status(401).json({ok:false,error:auth.error});
  const db=getSupabaseAdmin();
  const {data,error}=await db.from("subscribers").select("stripe_connect_account_id").eq("id",auth.subscriber_id).single();
  if(error)throw error;
  if(!data.stripe_connect_account_id)return res.json({ok:true,connected:false,ready:false});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const account=await stripe.accounts.retrieve(data.stripe_connect_account_id);
  return res.json({ok:true,connected:true,ready:!!account.charges_enabled&&!!account.payouts_enabled,details_submitted:!!account.details_submitted});
 }catch(e){return res.status(500).json({ok:false,error:e.message||"Unable to check payment status"})}
}
