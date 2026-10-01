-- DropIndex
DROP INDEX "Appointment_slotId_idx";

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
