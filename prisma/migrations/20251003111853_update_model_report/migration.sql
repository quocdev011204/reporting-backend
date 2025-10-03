/*
  Warnings:

  - You are about to drop the column `status` on the `Report` table. All the data in the column will be lost.
  - Made the column `userId` on table `Report` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Report" DROP COLUMN "status",
ADD COLUMN     "totalHours" DOUBLE PRECISION,
ALTER COLUMN "value" DROP NOT NULL,
ALTER COLUMN "userId" SET NOT NULL;
