import Stripe from "stripe";
import {getSupabaseAdmin} from "../../../lib/supabaseAdmin";
import {getSkipPricesForPostcodeAdmin} from "../../../lib/getSkipPricesForPostcode";
import {earliestDelivery,ukHolidays,londonNow,isValidDeliveryDate} from "../../../lib/publicBookingCalendar";

const clean=v=>typeof v==="string"?v.trim():"";
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"Method not allowed"});
 try{
  const b=req.body||{},slug=clean(b.slug),postcode=clean(b.postcode),date=clean(b.scheduled_date);
  if(!slug||!postcode||!date||!clean(b.skip_type_id))return res.status(400).json({ok:false,error:"Missing booking details"});
  const db=getSupabaseAdmin();
  const {data:sub,error:subError}=await db.from("subscribers").select("id,company_name,public_booking_enabled,public_booking_notice_days,public_booking_notice_working_days,public_booking_allow_saturday,public_booking_allow_sunday,public_booking_max_days_ahead,public_booking_cutoff_time,public_booking_use_permit_lead_times,public_booking_holiday_region,public_booking_block_bank_holidays,stripe_connect_account_id,public_booking_platform_fee_bps").ilike("public_booking_slug",slug).single();
  if(subError||!sub?.public_booking_enabled)return res.status(404).json({ok:false,error:"Booking page unavailable"});
  if(!sub.stripe_connect_account_id)return res.status(409).json({ok:false,error:"Online payments are not yet activated for this operator"});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const account=await stripe.accounts.retrieve(sub.stripe_connect_account_id);
  if(!account.charges_enabled||!account.payouts_enabled)return res.status(409).json({ok:false,error:"Operator payments are not yet active"});
  const options=await getSkipPricesForPostcodeAdmin(sub.id,postcode);
  const selected=options.find(x=>String(x.skip_type_id)===clean(b.skip_type_id));
  if(!selected)throw Error("Skip type is not available for this postcode");
  const placement=clean(b.placement_type)||"private";
  if(!["private","permit"].includes(placement))throw Error("Invalid placement type");
  let permit=null;
  if(placement==="permit"){
   if(!clean(b.permit_setting_id))throw Error("Please select a permit");
   const result=await db.from("permit_settings").select("id,price_no_vat,delay_business_days,is_active").eq("subscriber_id",sub.id).eq("id",b.permit_setting_id).eq("is_active",true).single();
   if(result.error||!result.data)throw Error("Permit unavailable");
   permit=result.data;
  }
  const {data:periods,error:periodError}=await db.from("booking_blackouts").select("start_date,end_date").eq("subscriber_id",sub.id);
  if(periodError)throw periodError;
  const holidays=await ukHolidays(sub.public_booking_holiday_region||"england-and-wales");
  const clock=londonNow(),cutoff=clean(sub.public_booking_cutoff_time);
  const cutoffMinutes=/^\d{2}:\d{2}$/.test(cutoff)?Number(cutoff.slice(0,2))*60+Number(cutoff.slice(3,5)):null;
  const rules={allowSaturday:!!sub.public_booking_allow_saturday,allowSunday:!!sub.public_booking_allow_sunday,blockBankHolidays:sub.public_booking_block_bank_holidays!==false};
  const earliest=earliestDelivery({today:clock.today,afterCutoff:cutoffMinutes!==null&&clock.minutes>=cutoffMinutes,noticeDays:Number(sub.public_booking_notice_days||0),workingDays:!!sub.public_booking_notice_working_days,permitDays:permit&&sub.public_booking_use_permit_lead_times?Number(permit.delay_business_days||0):0,holidays,periods:periods||[],rules});
  if(!isValidDeliveryDate(date,earliest,holidays,periods||[],rules))return res.status(400).json({ok:false,error:"Selected delivery date is unavailable. Earliest date: "+earliest});
  if(sub.public_booking_max_days_ahead!=null){
   const max=new Date(clock.today+"T12:00:00Z");
   max.setUTCDate(max.getUTCDate()+Number(sub.public_booking_max_days_ahead));
   if(date>max.toISOString().slice(0,10))return res.status(400).json({ok:false,error:"Delivery date is too far in advance"});
  }
  const total=Math.round((Number(selected.price_inc_vat)+Number(permit?.price_no_vat||0))*100);
  if(!Number.isSafeInteger(total)||total<50)throw Error("Invalid booking price");
  const customer=b.customer||{},site=b.site||{};
  if(!clean(customer.first_name)||!clean(customer.last_name)||!clean(customer.email)||!clean(customer.phone)||!clean(site.address_line1)||!clean(site.town))return res.status(400).json({ok:false,error:"Please complete customer and delivery address details"});
  const metadata={
   booking_slug:slug,postcode,placement_type:placement,permit_setting_id:permit?.id||"",skip_type_id:String(selected.skip_type_id),scheduled_date:date,
   quote_version:"1",subscriber_id:sub.id,skip_price_pence:String(Math.round(Number(selected.price_inc_vat)*100)),permit_price_pence:String(Math.round(Number(permit?.price_no_vat||0)*100)),permit_delay_business_days:String(Number(permit?.delay_business_days||0)),permit_validity_days:String(Number(permit?.validity_days||0)),total_pence:String(total),
   customer_first_name:clean(customer.first_name),customer_last_name:clean(customer.last_name),customer_company_name:clean(customer.company_name),customer_email:clean(customer.email),customer_phone:clean(customer.phone),
   site_name:clean(site.site_name),site_address_line1:clean(site.address_line1),site_address_line2:clean(site.address_line2),site_town:clean(site.town),notes:clean(b.notes)
  };
  for(const [k,v] of Object.entries(metadata)){if(v.length>500)throw Error("Booking field is too long: "+k)}
  const feeBps=Number(sub.public_booking_platform_fee_bps||0);
  if(!Number.isInteger(feeBps)||feeBps<0||feeBps>10000)throw Error("Invalid platform fee configuration");
  const fee=Math.round(total*feeBps/10000);
  // Return customers to the deployment that created the Checkout session.
  // A fixed production URL sends preview test payments to the wrong API.
  const requestHost=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim();
  const configuredHost=new URL(process.env.NEXT_PUBLIC_SITE_URL||"https://skip-logic.vercel.app").host;
  const allowedHost=requestHost===configuredHost||requestHost==="skip-logic.vercel.app"||/^[a-z0-9-]+\.vercel\.app$/i.test(requestHost);
  if(!allowedHost)throw Error("Unrecognised booking host");
  const origin="https://"+requestHost;
  const session=await stripe.checkout.sessions.create({
   mode:"payment",customer_email:clean(customer.email),
   line_items:[{price_data:{currency:"gbp",unit_amount:total,product_data:{name:"Skip hire"+(sub.company_name?" - "+sub.company_name:"")}},quantity:1}],
   metadata, payment_intent_data:fee>0?{application_fee_amount:fee}:undefined,
   success_url:origin+"/book/"+encodeURIComponent(slug)+"/success?session_id={CHECKOUT_SESSION_ID}",
   cancel_url:origin+"/book/"+encodeURIComponent(slug)
  },{stripeAccount:sub.stripe_connect_account_id});
  return res.json({ok:true,url:session.url});
 }catch(e){return res.status(400).json({ok:false,error:e.message||"Unable to start checkout"})}
}
