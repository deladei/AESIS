-- Head of Department role: coordinator powers + final-grade release sign-off.
-- Not self-registerable (auth Zod whitelist unchanged); provisioned by an admin.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'hod';
