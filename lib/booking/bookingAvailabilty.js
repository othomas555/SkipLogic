// lib/booking/bookingAvailability.js

function toDateOnly(value) {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseCutoffTime(value) {
  const t = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function isAllowedWeekday(date, allowSaturday, allowSunday) {
  const day = date.getDay();
  if (day === 6 && !allowSaturday) return false;
  if (day === 0 && !allowSunday) return false;
  return true;
}

function addCalendarDays(startDate, days) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addBusinessDays(startDate, days, allowSaturday, allowSunday) {
  let remaining = Number(days || 0);
  const d = new Date(startDate);

  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isAllowedWeekday(d, allowSaturday, allowSunday)) {
      remaining -= 1;
    }
  }

  return d;
}

function moveToNextAllowedDate(date, allowSaturday, allowSunday) {
  const d = new Date(date);
  while (!isAllowedWeekday(d, allowSaturday, allowSunday)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function buildAllowedWeekdays({
  allowSaturday = false,
  allowSunday = false,
}) {
  const days = [1, 2, 3, 4, 5];
  if (allowSaturday) days.push(6);
  if (allowSunday) days.push(0);
  return days;
}

export function calculateEarliestBookingDate({
  now = new Date(),
  subscriberNoticeDays = 0,
  subscriberNoticeBusinessDays = true,
  allowSaturday = false,
  allowSunday = false,
  cutoffTime = null,
  permitRequired = false,
  permitDelayBusinessDays = 0,
}) {
  const nowDt = new Date(now);
  let baseDate = toDateOnly(nowDt);

  const cutoff = parseCutoffTime(cutoffTime);
  if (cutoff) {
    const afterCutoff =
      nowDt.getHours() > cutoff.hh ||
      (nowDt.getHours() === cutoff.hh && nowDt.getMinutes() >= cutoff.mm);

    if (afterCutoff) {
      baseDate = addCalendarDays(baseDate, 1);
    }
  }

  let subscriberDate = new Date(baseDate);
  if (subscriberNoticeBusinessDays) {
    subscriberDate = addBusinessDays(
      subscriberDate,
      subscriberNoticeDays,
      allowSaturday,
      allowSunday
    );
  } else {
    subscriberDate = addCalendarDays(subscriberDate, subscriberNoticeDays);
    subscriberDate = moveToNextAllowedDate(
      subscriberDate,
      allowSaturday,
      allowSunday
    );
  }

  let permitDate = new Date(baseDate);
  if (permitRequired) {
    permitDate = addBusinessDays(
      permitDate,
      permitDelayBusinessDays,
      allowSaturday,
      allowSunday
    );
  }

  let earliest = subscriberDate > permitDate ? subscriberDate : permitDate;
  earliest = moveToNextAllowedDate(earliest, allowSaturday, allowSunday);

  return {
    earliestDate: ymd(earliest),
    debug: {
      subscriberDate: ymd(subscriberDate),
      permitDate: ymd(permitDate),
      finalDate: ymd(earliest),
    },
  };
}
