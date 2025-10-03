-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "insights" TEXT,
ADD COLUMN     "taskId" INTEGER,
ADD COLUMN     "userId" INTEGER,
ALTER COLUMN "updatedAt" DROP DEFAULT;
