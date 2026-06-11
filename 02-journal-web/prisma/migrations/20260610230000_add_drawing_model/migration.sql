-- CreateEnum
CREATE TYPE "DrawingType" AS ENUM ('HORIZONTAL_LINE', 'VERTICAL_LINE', 'TRENDLINE', 'RECTANGLE', 'TEXT', 'LONG_POSITION', 'SHORT_POSITION');

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT,
    "type" "DrawingType" NOT NULL,
    "geometry" JSONB NOT NULL DEFAULT '{}',
    "entryPrice" DOUBLE PRECISION,
    "slPrice" DOUBLE PRECISION,
    "tpPrice" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "riskUsd" DOUBLE PRECISION,
    "rRatio" DOUBLE PRECISION,
    "color" TEXT NOT NULL DEFAULT '#C9A96E',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drawing_userId_pair_idx" ON "Drawing"("userId", "pair");

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

