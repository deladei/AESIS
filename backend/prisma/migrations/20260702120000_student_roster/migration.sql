-- Pre-registration class roster: the coordinator uploads the student list; a
-- registering student matching by email or index number links to their row.
CREATE TABLE "student_roster" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "index_number" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "claimed_by_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_roster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_roster_email_key" ON "student_roster"("email");
CREATE UNIQUE INDEX "student_roster_index_number_key" ON "student_roster"("index_number");
CREATE UNIQUE INDEX "student_roster_claimed_by_id_key" ON "student_roster"("claimed_by_id");

ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_roster" ADD CONSTRAINT "student_roster_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
