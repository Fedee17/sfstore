export const COMMERCIAL_TIME_ZONE = "America/Argentina/Buenos_Aires" as const;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COMMERCIAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
export function commercialDate(instant: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) {
    throw new Error("COMMERCIAL_INSTANT_WITHOUT_ZONE");
  }
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error("COMMERCIAL_INVALID_INSTANT");
  const p = formatter.formatToParts(date);
  return ["year", "month", "day"].map(k => p.find(x => x.type === k)!.value).join("-");
}
export function sourceDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value) {
    throw new Error("COMMERCIAL_INVALID_SOURCE_DATE");
  }
  return value;
}
export function validateMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900) {
    throw new Error("COMMERCIAL_INVALID_MONTH");
  }
  return month;
}
/** Resolve a civil midnight through IANA rules, never the server timezone. */
function civilMidnight(date:string):string {
  sourceDate(date);
  const [y,m,d]=date.split("-").map(Number),target=Date.UTC(y,m-1,d);
  const f=new Intl.DateTimeFormat("en-CA",{timeZone:COMMERCIAL_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
  let value=target;
  for(let i=0;i<4;i++){
    const parts=f.formatToParts(new Date(value));const n=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
    const actual=Date.UTC(n("year"),n("month")-1,n("day"),n("hour"),n("minute"),n("second"));
    if(actual===target)return new Date(value).toISOString();value+=target-actual;
  }
  throw new Error("COMMERCIAL_AMBIGUOUS_DAY_BOUNDARY");
}
export function monthBounds(month:string):{startInclusive:string;endExclusive:string}{
  validateMonth(month);const y=Number(month.slice(0,4)),m=Number(month.slice(5));
  const next=`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,"0")}-01`;
  return{startInclusive:civilMidnight(month+"-01"),endExclusive:civilMidnight(next)};
}
export function commercialDayBounds(date:string){
  sourceDate(date);const[y,m,d]=date.split("-").map(Number);
  return{startInclusive:civilMidnight(date),endExclusive:civilMidnight(new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10))};
}
