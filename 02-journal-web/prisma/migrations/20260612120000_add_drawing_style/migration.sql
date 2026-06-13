-- PR #19 — estilo de dibujos: grosor y estilo de línea.
CREATE TYPE "LineStyle" AS ENUM ('SOLID', 'DASHED');

ALTER TABLE "Drawing" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Drawing" ADD COLUMN "lineStyle" "LineStyle" NOT NULL DEFAULT 'SOLID';
