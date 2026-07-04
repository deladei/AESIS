-- Academic-supervisor identity at registration: unique staff ID + title.
ALTER TABLE "users" ADD COLUMN "staff_id" TEXT;
ALTER TABLE "users" ADD COLUMN "title" TEXT;
CREATE UNIQUE INDEX "users_staff_id_key" ON "users"("staff_id");
