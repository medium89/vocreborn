import { BadRequestException } from "@nestjs/common";
export const QUIZ_USERNAME = "tusova_quiz";
export type QuizDocument = { version: 1; id: string; theme: string; questions: { id: string; question: string; answer: string; acceptedAnswers: string[] }[] };
export type QuizWindow = { days: number[]; start: string; end: string };
export function normalizeAnswer(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g,"е").trim().replace(/^[\s«»“”"'.,!?…:;]+|[\s«»“”"'.,!?…:;]+$/gu,"").replace(/\s+/gu," "); }
export function answerText(value: string) { return normalizeAnswer(value.replace(/^\s*@tusova_quiz\s*[:,→-]?\s*/iu,"")); }
export function parseDocument(raw: unknown): QuizDocument {
  const fail = (message: string): never => { throw new BadRequestException(message); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("JSON должен содержать объект темы");
  const doc = raw as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(doc)) > 256 * 1024) return fail("JSON не больше 256 КБ");
  const identifier = (value: unknown, label: string) => { if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) return fail(label+": id — 1–64 латинских букв, цифр, _ или -"); return value; };
  const text = (value: unknown, label: string, max: number) => { if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail(label+": непустой текст до "+max+" символов"); return value.trim().normalize("NFC"); };
  if (doc.version !== 1) return fail("Поддерживается только version: 1");
  if (!Array.isArray(doc.questions) || !doc.questions.length || doc.questions.length > 500) return fail("questions: от 1 до 500 вопросов");
  const ids = new Set<string>();
  const questions = doc.questions.map((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("Вопрос "+(i+1)+": ожидается объект");
    const row = item as Record<string,unknown>, label = "Вопрос "+(i+1), id = identifier(row.id,label);
    if (ids.has(id)) return fail(label+": повторяющийся id "+id); ids.add(id);
    const answer = text(row.answer,label+".answer",100);
    if (Array.from(answer).filter(c=>/\p{L}/u.test(c)).length < 3) return fail(label+".answer: нужны минимум 3 буквы для двух подсказок");
    if (row.acceptedAnswers !== undefined && (!Array.isArray(row.acceptedAnswers) || row.acceptedAnswers.length > 20)) return fail(label+".acceptedAnswers: массив до 20 вариантов");
    const acceptedAnswers = ((row.acceptedAnswers ?? []) as unknown[]).map((value,n)=>text(value,label+".acceptedAnswers["+n+"]",100));
    const answers = [answer,...acceptedAnswers].map(normalizeAnswer);
    if (answers.some(v=>!v) || new Set(answers).size !== answers.length) return fail(label+": пустые или повторяющиеся варианты ответа после нормализации");
    return { id, question: text(row.question,label+".question",500), answer, acceptedAnswers };
  });
  return { version: 1, id: identifier(doc.id,"Тема"), theme: text(doc.theme,"theme",120), questions };
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(now: Date, timezone: string) {
  let format = formatters.get(timezone);
  if (!format) { format = new Intl.DateTimeFormat("en-GB",{timeZone:timezone,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}); formatters.set(timezone,format); }
  return Object.fromEntries(format.formatToParts(now).map(p=>[p.type,p.value]));
}
const weekdays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const minutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3));
export function validateWindows(raw: unknown, timezone: string): QuizWindow[] {
  try { parts(new Date(),timezone); } catch { throw new BadRequestException("Неизвестный часовой пояс IANA"); }
  if (!Array.isArray(raw) || !raw.length || raw.length > 14) throw new BadRequestException("Расписание: от 1 до 14 интервалов");
  return raw.map((row,i)=> {
    if (!row || typeof row!=="object" || !Array.isArray(row.days) || !row.days.length || row.days.some((d: unknown)=>!Number.isInteger(d)||Number(d)<0||Number(d)>6) || new Set(row.days).size!==row.days.length || typeof row.start!=="string" || typeof row.end!=="string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) || !/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(row.end) || row.start===row.end) throw new BadRequestException("Некорректный интервал "+(i+1)+". Дни: 0=вс … 6=сб; время HH:MM");
    return { days:row.days,start:row.start,end:row.end };
  });
}
export function isOpen(now: Date, timezone: string, windows: QuizWindow[]) {
  const p=parts(now,timezone), day=weekdays.indexOf(p.weekday), current=Number(p.hour)*60+Number(p.minute);
  return windows.some(w=>{const start=minutes(w.start),end=minutes(w.end);return end>start ? w.days.includes(day)&&current>=start&&current<end : current>=start&&w.days.includes(day)||current<end&&w.days.includes((day+6)%7);});
}
export function fitsWindow(now: Date, seconds: number, timezone: string, windows: QuizWindow[]) {
  for(let time=now.getTime();time<now.getTime()+seconds*1000;time+=30_000)if(!isOpen(new Date(time),timezone,windows))return false;
  return isOpen(new Date(now.getTime()+seconds*1000-1),timezone,windows);
}
export function nextWindow(now: Date, seconds: number, timezone: string, windows: QuizWindow[]) {
  if(fitsWindow(now,seconds,timezone,windows))return now;
  const start=Math.ceil(now.getTime()/60_000)*60_000;
  for(let n=0;n<8*1440;n++){const candidate=new Date(start+n*60_000);if(fitsWindow(candidate,seconds,timezone,windows))return candidate;}
  return null;
}
export function dayKey(now: Date, timezone: string) { const p=parts(now,timezone);return timezone+":"+p.year+"-"+p.month+"-"+p.day; }
export function hintPositions(answer: string) { const positions=Array.from(answer).flatMap((c,i)=>/\p{L}/u.test(c)?[i]:[]); for(let i=positions.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]];}return positions.slice(0,2); }
export function mask(answer: string, positions: number[], revealed: number) { return Array.from(answer).map((c,i)=>!/[\p{L}\p{N}]/u.test(c)||positions.slice(0,revealed).includes(i)?c:"▢").join(""); }
