-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Candle_pair_timeframe_timestamp_idx" ON "Candle"("pair", "timeframe", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Candle_pair_timeframe_timestamp_key" ON "Candle"("pair", "timeframe", "timestamp");
