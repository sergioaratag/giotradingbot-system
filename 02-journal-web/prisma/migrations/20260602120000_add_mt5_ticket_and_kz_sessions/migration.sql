-- AlterEnum
ALTER TYPE "SessionType" ADD VALUE 'LONDON_KZ';
ALTER TYPE "SessionType" ADD VALUE 'NY_LUNCH';

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "mt5Ticket" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Trade_mt5Ticket_key" ON "Trade"("mt5Ticket");
