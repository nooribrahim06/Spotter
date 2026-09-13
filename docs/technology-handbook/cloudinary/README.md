# Cloudinary

## What it is

`cloudinary` is the official Node.js SDK for Cloudinary's cloud-based media management platform. It provides asset uploading, image and video transformation, dynamic optimization (format, quality, sizing), CDN delivery, and secure signed asset management.

## How Spotter uses it

Spotter references Cloudinary public IDs throughout its database models to manage static assets and media files without storing binary files directly in PostgreSQL:

- **Exercise Demonstration GIFs**: [`schema.prisma`](../../../backend/prisma/schema.prisma) stores `gifPublicId` on the `Exercise` model to stream exercise form animations via Cloudinary's CDN.
- **User Avatars & Profile Photos**: User profiles reference Cloudinary storage keys for profile pictures.
- **Recipe & Food Images**: Meal and recipe catalogs use Cloudinary identifiers for food imagery.

## API surface area

| API | Purpose |
| --- | --- |
| `cloudinary.v2.config({ cloud_name, api_key, api_secret })` | Initialize Cloudinary credentials from environment variables. |
| `cloudinary.v2.uploader.upload(file, options)` | Upload media files from memory or temporary local storage to the cloud. |
| `cloudinary.v2.url(publicId, options)` | Generate CDN delivery URLs with on-the-fly resizing, cropping, and format optimization (e.g., auto WebP/AVIF). |
| `cloudinary.v2.utils.api_sign_request(params, api_secret)` | Generate signed parameters for direct, secure client-to-cloud browser uploads. |

## What it can do next

- Generate signed upload presets so the frontend can upload profile photos and progress check-in images directly to Cloudinary without routing high-bandwidth binary streams through Express.
- Apply dynamic transformations to automatically downscale and crop user avatar uploads to standard dimensions (`w_200,h_200,c_fill`).
- Automatically serve next-gen formats (`f_auto,q_auto`) for animated exercise demonstration GIFs.
- Implement cleanup workflows to delete orphaned media assets when users delete custom recipes or profile photos.

## Security and operational notes

- Never expose `api_secret` to the frontend or check credentials into version control. Keep all Cloudinary secrets in `.env`.
- Use direct client-to-Cloudinary uploads with backend-signed signatures to keep server memory usage low and avoid Express request payload bottlenecks.
- Store only the `public_id` or relative path in PostgreSQL, not hardcoded full URLs, allowing CDN domains or transformation settings to change without database migrations.

## Official references

- [Cloudinary Node.js SDK Documentation](https://cloudinary.com/documentation/node_integration)
- [Cloudinary Direct Uploads & Signatures](https://cloudinary.com/documentation/upload_images#direct_uploading_from_the_browser)
