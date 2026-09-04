import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";

// Cloudinary does not keep an open connection like PostgreSQL.
// This configures the SDK; each upload/delete call later makes its own HTTPS request.
cloudinary.config({
  cloud_name: env.CLOUD_NAME,
  api_key: env.CLOUD_API_KEY,
  api_secret: env.CLOUD_API_SECRET,
  secure: true,
});

export { cloudinary };
