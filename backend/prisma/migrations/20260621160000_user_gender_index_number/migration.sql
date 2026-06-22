-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable (additive, nullable — no backfill required)
ALTER TABLE "users" ADD COLUMN "gender" "Gender";
ALTER TABLE "users" ADD COLUMN "index_number" TEXT;

-- CreateIndex (unique; multiple NULLs allowed in Postgres)
CREATE UNIQUE INDEX "users_index_number_key" ON "users"("index_number");
