import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isBlockingEvent, inBlockWindow, BLOCK_WINDOW_MIN } from "@/lib/news";
import { nyDayBoundsUtc } from "@/lib/ny-time";
import { nyParts } from "@/lib/killzones";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { startUtc, endUtc, year, month, day } = nyDayBoundsUtc(now);
  const { weekday } = nyParts(now);

  const rows = await prisma.newsEvent.findMany({
    where: { scheduledAt: { gte: startUtc, lte: endUtc } },
    orderBy: { scheduledAt: "asc" },
  });

  let activeBlock: { eventId: string; title: string; until: string } | null =
    null;
  let nextEvent: { id: string; title: string; scheduledAt: string } | null =
    null;

  const events = rows.map((e) => {
    const blocking = isBlockingEvent(e.impact, e.currency);
    const isActive = blocking && inBlockWindow(now, e.scheduledAt);
    const hasPassed = now.getTime() > e.scheduledAt.getTime();
    const isUpcoming = !hasPassed;

    if (isActive && !activeBlock) {
      const until = new Date(
        e.scheduledAt.getTime() + BLOCK_WINDOW_MIN * 60_000,
      );
      activeBlock = {
        eventId: e.id,
        title: e.title,
        until: until.toISOString(),
      };
    }
    if (isUpcoming && !nextEvent) {
      nextEvent = {
        id: e.id,
        title: e.title,
        scheduledAt: e.scheduledAt.toISOString(),
      };
    }

    return {
      id: e.id,
      title: e.title,
      country: e.country,
      currency: e.currency,
      impact: e.impact,
      scheduledAt: e.scheduledAt.toISOString(),
      actual: e.actual,
      forecast: e.forecast,
      previous: e.previous,
      isBlocked: isActive,
      hasPassed,
      isUpcoming,
      isActive,
    };
  });

  return NextResponse.json({
    nyDate: { year, month, day, weekday },
    events,
    activeBlock,
    nextEvent,
    now: now.toISOString(),
  });
}
