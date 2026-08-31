/*
 * Why does the profile module need a serializer?
 *
 * The repository returns database-shaped values. The frontend needs a stable
 * HTTP contract. Those shapes are deliberately not identical:
 *
 * - Prisma Decimal values should become ordinary JSON numbers.
 * - PostgreSQL DATE values should be YYYY-MM-DD, not midnight timestamps that
 *   may appear as the previous or next day in another timezone.
 * - Database relations return progressEntries as an array, while the profile
 *   contract exposes the latest one as currentBodyState.
 * - Internal foreign keys and private storage keys must never leak.
 * - Prisma enum names may need an API representation, such as lowercase
 *   onboarding status.
 *
 * Keeping every conversion here has two benefits:
 * 1. Services stay focused on decisions and transactions.
 * 2. A future response-shape change has one obvious place to review.
 *
 * A serializer must never query the database or make business decisions. It
 * only converts already-authorized data into the promised response shape.
 */

// Prisma Decimal is safe and precise for storage, but the JSON contract promises
// normal numbers. Null must remain null rather than becoming zero, because null
// means that the user has not supplied the optional measurement.
export function serializeDecimal(value) {
  return value == null ? null : Number(value);
}

// birthDate and targetDate are calendar dates, not moments in time. Returning
// only YYYY-MM-DD prevents the frontend from applying a timezone offset to them.
export function serializeDateOnly(value) {
  return value ? value.toISOString().slice(0, 10) : null;
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

// The repository intentionally loads only the newest progress entry. Prisma
// still represents a to-many relation as progressEntries: [], but the frontend
// should not need to understand that database detail. The serializer renames the
// first item to currentBodyState and returns null when no check-in exists.
export function serializeBodyProfile(bodyProfile) {
  if (!bodyProfile) return null;

  const { progressEntries = [], ...body } = bodyProfile;
  return {
    ...body,
    birthDate: serializeDateOnly(body.birthDate),
    heightCm: serializeDecimal(body.heightCm),
    startingWeightKg: serializeDecimal(body.startingWeightKg),
    currentBodyState: serializeProgressEntry(progressEntries[0] ?? null),
  };
}

// PATCH /me/body returns a smaller response than GET /me because it only needs
// to confirm the stable facts that were updated. Building it explicitly also
// guarantees userId and other internal Prisma fields cannot appear by accident.
export function serializeBodyProfileUpdate(bodyProfile) {
  return {
    birthDate: serializeDateOnly(bodyProfile.birthDate),
    sexForCalculation: bodyProfile.sexForCalculation,
    preferredUnitSystem: bodyProfile.preferredUnitSystem,
    heightCm: serializeDecimal(bodyProfile.heightCm),
    startingWeightKg: serializeDecimal(bodyProfile.startingWeightKg),
    activityLevel: bodyProfile.activityLevel,
    adultConfirmedAt: bodyProfile.adultConfirmedAt,
    updatedAt: bodyProfile.updatedAt,
  };
}

// profilePhotoKey identifies a private object in storage. It is not a URL and
// exposing it couples the frontend to storage internals. Until a storage/CDN
// provider is configured, profilePhotoUrl remains null. Later this is the single
// place that should receive an already-generated safe URL.
export function serializePublicProfile(userProfile) {
  if (!userProfile) return null;

  const { profilePhotoKey, ...safeProfile } = userProfile;
  return {
    ...safeProfile,
    profilePhotoUrl: null,
  };
}

// Upsert operations normally return their shared primary/foreign key
// (userId/bodyProfileId). The authenticated user already owns the response and
// the frontend cannot use or edit those keys, so section responses remove them.
export function serializeOwnedProfileSection(record) {
  if (!record) return record;

  const { userId, bodyProfileId, ...safeRecord } = record;
  return safeRecord;
}

// This is the public contract for GET /me. The repository returns one User row
// with nested one-to-one relations; here we split it into the three concepts the
// frontend understands: account identity, public identity, and private fitness.
export function serializeCompleteProfile(profile) {
  const {
    userProfile,
    bodyProfile,
    coachingPreferences,
    ...account
  } = profile;

  return {
    account: {
      ...account,
      // Prisma uses uppercase enum values. Existing authentication/onboarding
      // responses already promise lowercase status values to the frontend.
      onboardingStatus: account.onboardingStatus.toLowerCase(),
    },
    userProfile: serializePublicProfile(userProfile),
    bodyProfile: serializeBodyProfile(bodyProfile),
    coachingPreferences,
  };
}
