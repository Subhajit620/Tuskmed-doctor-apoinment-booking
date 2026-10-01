-- CreateEnum
CREATE TYPE "BlockMode" AS ENUM ('VIDEO', 'IN_CLINIC', 'BOTH');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "isFollowUp" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "clinicFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "clinicLocation" TEXT,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "sex" "Gender",
ADD COLUMN     "state" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "BlockedPeriod" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "mode" "BlockMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockedPeriod_doctorId_startDate_endDate_idx" ON "BlockedPeriod"("doctorId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "BlockedPeriod" ADD CONSTRAINT "BlockedPeriod_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
