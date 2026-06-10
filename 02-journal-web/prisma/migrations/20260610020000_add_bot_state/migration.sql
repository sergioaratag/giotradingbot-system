-- CreateTable
CREATE TABLE "BotState" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "biasH4" TEXT,
    "biasD1" TEXT,
    "killzone" TEXT,
    "fvgs" JSONB NOT NULL DEFAULT '[]',
    "sweeps" JSONB NOT NULL DEFAULT '[]',
    "markers" JSONB NOT NULL DEFAULT '[]',
    "chochState" TEXT,
    "currentAction" TEXT,
    "reasoning" TEXT,
    "nextStep" TEXT,
    CONSTRAINT "BotState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BotState_symbol_key" ON "BotState"("symbol");

-- CreateIndex
CREATE INDEX "BotState_updatedAt_idx" ON "BotState"("updatedAt");
