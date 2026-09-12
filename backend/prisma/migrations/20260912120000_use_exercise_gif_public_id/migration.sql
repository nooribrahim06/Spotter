-- Preserve the existing GIF identifier while naming its meaning explicitly.
ALTER TABLE "exercises" RENAME COLUMN "gif_key" TO "gif_public_id";

-- Cloudinary public IDs do not include the delivery extension. Normalize any
-- values imported by the original seed before enforcing the new convention.
UPDATE "exercises"
SET "gif_public_id" = regexp_replace("gif_public_id", '\.gif$', '', 'i')
WHERE "gif_public_id" ~* '\.gif$';

-- Static previews are derived from frame 1 of the GIF, so a second stored key
-- is no longer part of the exercise model.
ALTER TABLE "exercises" DROP COLUMN "image_key";
