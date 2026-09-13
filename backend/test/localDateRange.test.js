import assert from "node:assert/strict";
import test from "node:test";

import { buildUtcRangeForLocalDates } from "../src/helpers/localDateRange.js";

test("a local calendar day becomes an exclusive UTC query range", () => {
  const range = buildUtcRangeForLocalDates(
    "2026-09-13",
    "2026-09-13",
    "Africa/Cairo"
  );

  assert.equal(range.gte.toISOString(), "2026-09-12T21:00:00.000Z");
  assert.equal(range.lt.toISOString(), "2026-09-13T21:00:00.000Z");
});

test("the UTC range follows daylight-saving changes", () => {
  const range = buildUtcRangeForLocalDates(
    "2024-03-10",
    "2024-03-10",
    "America/New_York"
  );

  // New York moved from UTC-5 to UTC-4 on this date, so the local day was
  // 23 hours long. The range must follow the timezone, not assume 24 hours.
  assert.equal(range.gte.toISOString(), "2024-03-10T05:00:00.000Z");
  assert.equal(range.lt.toISOString(), "2024-03-11T04:00:00.000Z");
});

test("an invalid timezone throws the expected RangeError", () => {
  assert.throws(
    () =>
      buildUtcRangeForLocalDates(
        "2026-09-13",
        "2026-09-13",
        "Not/A-Timezone"
      ),
    RangeError
  );
});
