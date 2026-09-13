import { z } from "zod";

const BODY_MEASUREMENT_TYPES = [
  "WAIST",
  "ABDOMEN",
  "CHEST",
  "HIPS",
  "NECK",
  "SHOULDERS",
  "LEFT_UPPER_ARM",
  "RIGHT_UPPER_ARM",
  "LEFT_FOREARM",
  "RIGHT_FOREARM",
  "LEFT_THIGH",
  "RIGHT_THIGH",
  "LEFT_CALF",
  "RIGHT_CALF",
];

const bodyMeasurementTypeSchema = z.enum(BODY_MEASUREMENT_TYPES);

const progressMeasurementSchema = z
  .object({
    measurementType: bodyMeasurementTypeSchema,

    valueCm: z
      .number()
      .finite()
      .min(5, "Measurement must be at least 5 cm.")
      .max(400, "Measurement must not exceed 400 cm."),
  })
  .strict();

const dateOnlySchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date must use YYYY-MM-DD format."
  )
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Date is invalid.");

export const createProgressSchema = z
  .object({
    // the wieght must be number and have boundries of 20kg and 500kg
    weightKg: z
      .number()
      .finite()
      .min(20, "Weight must be at least 20 kg.")
      .max(500, "Weight must not exceed 500 kg."),
// must be not in the future and must be a valid date
    recordedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .refine((value) => value.getTime() <= Date.now(), {
        message: "recordedAt cannot be in the future.",
      })
      .optional(),
// the body fat percentage must be number and have boundries of 2% and 75%
    bodyFatPercentage: z
      .number()
      .finite()
      .min(2, "Body fat percentage must be at least 2.")
      .max(75, "Body fat percentage must not exceed 75.")
      .nullable()
      .optional(),
// the skeletal muscle mass must be number and have boundries of 5kg and 150kg
    skeletalMuscleMassKg: z
      .number()
      .finite()
      .min(5, "Skeletal muscle mass must be at least 5 kg.")
      .max(150, "Skeletal muscle mass must not exceed 150 kg.")
      .nullable()
      .optional(),
// the resting heart rate must be number and have boundries of 25bpm and 250bpm
    restingHeartRateBpm: z
      .number()
      .int("Resting heart rate must be a whole number.")
      .min(25, "Resting heart rate must be at least 25 BPM.")
      .max(250, "Resting heart rate must not exceed 250 BPM.")
      .nullable()
      .optional(),
// optional , can be null, must be string and have boundries of 1000 characters if exists 
    notes: z
      .string()
      .trim()
      .max(1000, "Notes must not exceed 1000 characters.")
      .nullable()
      .optional(),

    measurements: z
      .array(progressMeasurementSchema)
      .max(14, "A progress entry cannot contain more than 14 measurements.")
      .optional(),
  })
  .strict() // no additional fields are allowed
  .superRefine((data, ctx) => {
    // Skeletal muscle mass is part of total body weight,
    // so it cannot logically be greater than body weight.
    if (
      data.skeletalMuscleMassKg != null &&
      data.skeletalMuscleMassKg > data.weightKg
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["skeletalMuscleMassKg"],
        message: "Skeletal muscle mass cannot exceed body weight.",
      });
    }

    // The DB also guarantees this with:
    // @@unique([progressEntryId, measurementType])
    //
    // But validating it here gives the client a useful validation error
    // instead of a database constraint error.
    if (data.measurements) {
      const seen = new Set();

      data.measurements.forEach((measurement, index) => {
        if (seen.has(measurement.measurementType)) {
          ctx.addIssue({
            code: "custom",
            path: ["measurements", index, "measurementType"],
            message: "Each measurement type can only be recorded once.",
          });
        }

        seen.add(measurement.measurementType);
      });
    }
  });


export const progressHistoryQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int("Page must be a whole number.")
      .min(1, "Page must be at least 1.")
      .default(1),

    limit: z.coerce
      .number()
      .int("Limit must be a whole number.")
      .min(1, "Limit must be at least 1.")
      .max(100, "Limit must not exceed 100.")
      .default(20),

    startDate: dateOnlySchema.optional(),

    endDate: dateOnlySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.startDate &&
      data.endDate &&
      data.startDate > data.endDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate.",
      });
    }
  });

  export const progressEntryParamsSchema = z
  .object({
    entryId: z.uuid("entryId must be a valid UUID."),
  })
  .strict();