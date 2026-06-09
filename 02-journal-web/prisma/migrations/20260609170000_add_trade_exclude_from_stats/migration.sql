-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "excludeFromStats" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Trade_excludeFromStats_idx" ON "Trade"("excludeFromStats");
