-- DropIndex
DROP INDEX "Appointment_slotId_key";

-- Regular (non-unique) index so lookups by slotId stay fast.
CREATE INDEX "Appointment_slotId_idx" ON "Appointment"("slotId");

-- The actual "never double-booked" guarantee: a slot may accumulate many
-- CANCELLED appointment rows (failed payments, expired locks) but can never
-- have more than one appointment that is NOT cancelled. This is what lets a
-- slot be released and rebooked after a failure/timeout while still making
-- true double-booking impossible at the database level.
CREATE UNIQUE INDEX "appointment_active_slot_unique"
  ON "Appointment" ("slotId")
  WHERE "status" != 'CANCELLED';
