-- mt5Ticket pasa de INTEGER a BIGINT: los tickets reales de MT5 (~9e9) desbordan
-- INT4 (máx 2.147e9), lo que hacía fallar el create con ValueOutOfRange (500) y
-- por eso ningún trade real del bot llegaba al journal.
-- AlterTable
ALTER TABLE "Trade" ALTER COLUMN "mt5Ticket" SET DATA TYPE BIGINT;
