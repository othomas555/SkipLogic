// Run with: node --test tests/publicBookingCalendar.test.cjs
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {pathToFileURL}=require("node:url");
const source=fs.readFileSync(require("node:path").join(__dirname,"../lib/publicBookingCalendar.js"),"utf8");
const calendarPromise=import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const rules={allowSaturday:true,allowSunday:false,blockBankHolidays:true};
const holidays=new Set(["2026-12-25","2026-12-28","2027-01-01"]);
const shutdown=[{start_date:"2026-12-23",end_date:"2027-01-04"}];
const calc=async (today,afterCutoff=false,periods=[],days=2)=>{const {earliestDelivery}=await calendarPromise;return earliestDelivery({today,afterCutoff,noticeDays:days,workingDays:true,permitDays:0,holidays,periods,rules})};
test("Monday before cutoff gives Wednesday",async()=>assert.equal(await calc("2026-10-12"),"2026-10-14"));
test("Monday after cutoff gives Thursday",async()=>assert.equal(await calc("2026-10-12",true),"2026-10-15"));
test("Thursday before cutoff allows Saturday",async()=>assert.equal(await calc("2026-10-15"),"2026-10-17"));
test("Thursday after cutoff gives Tuesday",async()=>assert.equal(await calc("2026-10-15",true),"2026-10-20"));
test("Christmas shutdown booking resumes with two working days",async()=>assert.equal(await calc("2026-12-28",false,shutdown),"2027-01-07"));
test("Booking in October can deliver on first day after shutdown",async()=>{const {isValidDeliveryDate}=await calendarPromise;assert.equal(isValidDeliveryDate("2027-01-05","2026-10-20",holidays,shutdown,rules),true)});
test("Christmas Day and shutdown days are blocked",async()=>{const {isValidDeliveryDate}=await calendarPromise;assert.equal(isValidDeliveryDate("2026-12-25","2026-10-20",holidays,shutdown,rules),false)});
test("Bank holiday excluded from notice calculation",async()=>assert.equal(await calc("2026-12-24"),"2026-12-30"));
