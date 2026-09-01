function serializeDecimal(value) {
  return value == null ? null : Number(value);
}

// Progress contains several Decimal columns and child circumference records.
// Each numeric field is converted explicitly so the frontend never receives a
// Prisma-specific object or numeric string.
export function serializeProgressEntry(entry) {
  if (!entry) return null;

  return {
    ...entry,
    weightKg: serializeDecimal(entry.weightKg),
    bodyFatPercentage: serializeDecimal(entry.bodyFatPercentage),
    skeletalMuscleMassKg: serializeDecimal(entry.skeletalMuscleMassKg),
    measurements: entry.measurements.map((measurement) => ({
      measurementType: measurement.measurementType,
      valueCm: serializeDecimal(measurement.valueCm),
    })),
  };
}
