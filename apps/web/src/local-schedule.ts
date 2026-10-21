import { Temporal } from "@js-temporal/polyfill";
import { dateOnly, instant, timeZone } from "@coredrill/domain";
import type { LocalScheduleResolution } from "./stored-workspace-next-action-draft.js";

// ISO local clock only: minutes, optional seconds and exactly millisecond precision.
// Annotations, offset/zone suffixes and leap-second coercion are deliberately absent.
const LOCAL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?$/u;

/** ADR-0009: imported only by the explicit scheduling chunk; no global patches. */
export const resolveLocalSchedule = (
  localDateTime: string,
  zone: string,
): LocalScheduleResolution => {
  try {
    if (
      typeof localDateTime !== "string" ||
      typeof zone !== "string" ||
      localDateTime.length > 23 ||
      localDateTime !== localDateTime.trim() ||
      !LOCAL_CLOCK.test(localDateTime) ||
      zone.length > 128
    )
      return Object.freeze({ kind: "invalid" });
    dateOnly(localDateTime.slice(0, 10));
    if (
      Number(localDateTime.slice(11, 13)) > 23 ||
      Number(localDateTime.slice(14, 16)) > 59 ||
      (localDateTime.length > 16 && Number(localDateTime.slice(17, 19)) > 59)
    )
      return Object.freeze({ kind: "invalid" });
    const canonicalZone = timeZone(zone);
    const local = Temporal.PlainDateTime.from(localDateTime, { overflow: "reject" });
    const candidates: string[] = [];
    for (const disambiguation of ["earlier", "later"] as const) {
      const candidate = local.toZonedDateTime(canonicalZone, { disambiguation });
      // Earlier/later shift gaps to another clock value. Neither is an accepted
      // interpretation of the user's literal clock, so never silently adopt it.
      if (!candidate.toPlainDateTime().equals(local)) continue;
      const value = instant(candidate.toInstant().toString({ fractionalSecondDigits: 3 }));
      if (!candidates.includes(value)) candidates.push(value);
    }
    if (candidates.length === 0) return Object.freeze({ kind: "gap" });
    return Object.freeze({
      kind: "resolved",
      timeZone: canonicalZone,
      candidates: Object.freeze(candidates.sort()),
    });
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
};
