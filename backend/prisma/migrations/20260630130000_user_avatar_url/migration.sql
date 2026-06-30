-- Profile picture URL (Cloudinary secure_url), nullable; system-wide for every role.
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
