// Shared UK booking calendar rules. Date strings are YYYY-MM-DD.
const DAY_MS = 86400000;
const parse = s => new Date(String(s).slice(0,10)+"T12:00:00Z");
const fmt = d => d.toISOString().slice(0,10);
const plus = (s,n) => fmt(new Date(parse(s).getTime()+n*DAY_MS));
const weekday = s => parse(s).getUTCDay();
const blocked = (s,periods) => periods.some(p=>s>=p.start_date&&s<=p.end_date);
export function isWorkday(s,holidays,periods){const d=weekday(s);return d!==0&&d!==6&&!holidays.has(s)&&!blocked(s,periods)}
export function isDeliveryDay(s,holidays,periods,rules){const d=weekday(s);return (d!==6||rules.allowSaturday)&&(d!==0||rules.allowSunday)&&(!rules.blockBankHolidays||!holidays.has(s))&&!blocked(s,periods)}
export function nextDelivery(s,holidays,periods,rules){for(let i=0;i<730;i++,s=plus(s,1))if(isDeliveryDay(s,holidays,periods,rules))return s;throw Error("No delivery date available within two years")}
export function earliestDelivery({today,afterCutoff,noticeDays,workingDays,permitDays,holidays,periods,rules}){
 let start=today;
 if(afterCutoff)start=plus(start,1);
 if(workingDays){while(!isWorkday(start,holidays,periods))start=plus(start,1)}
 else {while(blocked(start,periods))start=plus(start,1)}
 let noticeEnd=start;
 if(workingDays){for(let n=1;n<Math.max(0,noticeDays);){noticeEnd=plus(noticeEnd,1);if(isWorkday(noticeEnd,holidays,periods))n++}}
 else noticeEnd=plus(start,Math.max(0,noticeDays)-1);
 let earliest=plus(noticeEnd,1);
 let permitEnd=start;
 for(let n=0;n<Math.max(0,permitDays);){if(isWorkday(permitEnd,holidays,periods))n++;if(n<permitDays)permitEnd=plus(permitEnd,1)}
 if(permitDays>0&&plus(permitEnd,1)>earliest)earliest=plus(permitEnd,1);
 return nextDelivery(earliest,holidays,periods,rules);
}
let cache=null, cacheAt=0;
export async function ukHolidays(region){
 if(!cache||Date.now()-cacheAt>12*60*60*1000){
  const response=await fetch("https://www.gov.uk/bank-holidays.json",{signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error("Could not retrieve official bank holiday dates");
  cache=await response.json();cacheAt=Date.now();
 }
 const events=cache[region]?.events;
 if(!events)throw Error("Invalid bank holiday region");
 return new Set(events.map(e=>e.date));
}
export function londonNow(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {today:o.year+"-"+o.month+"-"+o.day,minutes:Number(o.hour)*60+Number(o.minute)}}
export function isValidDeliveryDate(date,earliest,holidays,periods,rules){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=earliest&&isDeliveryDay(date,holidays,periods,rules)}
