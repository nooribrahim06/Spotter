import { addDays, format, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

function localMidnightToUtc(date, timezone) {
  // `date` is a day on the user's calendar, not a UTC day.
  // Convert midnight in that timezone into the exact UTC instant Prisma needs
  // when it compares values stored in PostgreSQL timestamptz columns.
  const utcDate = fromZonedTime(`${date}T00:00:00`, timezone);

  // date-fns-tz returns Invalid Date for an unsupported timezone. Throwing a
  // RangeError preserves the error contract used by Progress and Daily Summary.
  if (Number.isNaN(utcDate.getTime())) {
    throw new RangeError(`Invalid timezone: ${timezone}`);
  }

  return utcDate;
}

export function buildUtcRangeForLocalDates(startDate, endDate, timezone) {
  const range = {};

  if (startDate) {
    // Include records from 00:00 at the beginning of the first local day.
    range.gte = localMidnightToUtc(startDate, timezone);
  }

  if (endDate) {
    // Use the following midnight as an exclusive limit. This avoids inventing
    // 23:59:59.999 and prevents adjacent calendar days from overlapping.
    const nextDate = format(addDays(parseISO(endDate), 1), "yyyy-MM-dd");
    range.lt = localMidnightToUtc(nextDate, timezone);
  }

  return range;
}
