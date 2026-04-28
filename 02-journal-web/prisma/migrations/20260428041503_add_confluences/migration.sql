-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "killzone" TEXT,
ADD COLUMN     "postTradeNotes" TEXT,
ADD COLUMN     "preTradeNotes" TEXT;

-- CreateTable
CREATE TABLE "TradeConfluence" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeConfluence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeConfluence_tradeId_idx" ON "TradeConfluence"("tradeId");

-- CreateIndex
CREATE INDEX "TradeConfluence_conceptKey_idx" ON "TradeConfluence"("conceptKey");

-- AddForeignKey
ALTER TABLE "TradeConfluence" ADD CONSTRAINT "TradeConfluence_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
