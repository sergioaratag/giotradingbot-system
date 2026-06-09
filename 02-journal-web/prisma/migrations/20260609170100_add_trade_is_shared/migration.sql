-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "isShared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Trade_isShared_idx" ON "Trade"("isShared");
