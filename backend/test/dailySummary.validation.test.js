import assert from "node:assert/strict";
import { test } from "node:test";

import { dailySummaryQuerySchema } from "../src/modules/daily-summary/dailySummary.validate.js";

test("daily summary requires one real calendar date", () => {
  assert.equal(
    dailySummaryQuerySchema.safeParse({ date: "2026-09-11" }).success,
    true
  );
  assert.equal(dailySummaryQuerySchema.safeParse({}).success, false);
  assert.equal(
    dailySummaryQuerySchema.safeParse({ date: "2026-02-30" }).success,
    false
  );
});

test("daily summary rejects unknown query fields", () => {
  const result = dailySummaryQuerySchema.safeParse({
    date: "2026-09-11",
    userId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(result.success, false);
});
