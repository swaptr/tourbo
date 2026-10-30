// Tour calendar as iCalendar (RFC 5545). Pure: no I/O, so it is unit-tested with fixtures.
// Times: with an IANA time zone (GeoNames tz column, cities.timezone) each show's local start is
// converted to UTC (DATE-TIME form 2, "Z"), which every calendar shows in the viewer's own zone
// without needing a VTIMEZONE block; without one it stays floating local time (form 1).
import { createHash } from "node:crypto";

export type IcsEvent = {
  date: string; // YYYY-MM-DD, local to the show
  city: string;
  title: string; // SUMMARY
  start?: string; // HH:MM local; omit with allDay
  minutes?: number; // duration, default 120
  allDay?: boolean;
  timezone?: string; // IANA, e.g. America/Chicago
  venue?: string;
  address?: string;
  lat?: number;
  lon?: number;
  description?: string;
  url?: string;
};

// TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline.
export const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Content lines fold at 75 octets (§3.1): CRLF + one space, never splitting a UTF-8 sequence.
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let octets = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (octets + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      octets = 0;
    }
    cur += ch;
    octets += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const utcStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

export function validTimezone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (ms) of `tz` from UTC at instant `ms`.
function offsetAt(tz: string, ms: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000;
}

// Local wall time in `tz` → UTC ms (two passes settle DST edges).
export function localToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - offsetAt(tz, wall);
  utc = wall - offsetAt(tz, utc);
  return utc;
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
};

export const eventUid = (e: Pick<IcsEvent, "date" | "city" | "title">) =>
  `${createHash("sha256").update(`${e.title}|${e.date}|${e.city}`).digest("hex").slice(0, 24)}@tourbo`;

export function toIcs(events: IcsEvent[], opts: { name: string; now?: Date }): string {
  const stamp = utcStamp((opts.now ?? new Date()).getTime());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tourbo//Tour calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(opts.name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${eventUid(e)}`, `DTSTAMP:${stamp}`);
    if (e.allDay || !e.start) {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.date, 1)}`);
    } else {
      const minutes = e.minutes ?? 120;
      if (validTimezone(e.timezone)) {
        const start = localToUtc(e.date, e.start, e.timezone);
        lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(start + minutes * 60_000)}`);
      } else {
        // Floating local time: the same wall clock wherever the calendar is opened.
        const [h, m] = e.start.split(":").map(Number);
        const end = new Date(Date.UTC(2000, 0, 1, h, m) + minutes * 60_000);
        const endDate = addDays(e.date, end.getUTCDate() - 1);
        lines.push(`DTSTART:${e.date.replace(/-/g, "")}T${pad(h)}${pad(m)}00`, `DTEND:${endDate}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`);
      }
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    const location = [e.venue, e.address, e.city].filter(Boolean).join(", ");
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (e.lat !== undefined && e.lon !== undefined) lines.push(`GEO:${e.lat.toFixed(6)};${e.lon.toFixed(6)}`);
    const desc = [e.description, e.timezone && !e.allDay && e.start ? `Starts ${e.start} local time (${e.timezone}).` : undefined].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
