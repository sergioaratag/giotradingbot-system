import { auth } from "@/auth";
import { DashboardHero } from "@/components/DashboardHero";
import { MetricCard } from "@/components/MetricCard";
import { NextKillzoneCard } from "@/components/NextKillzoneCard";

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "Sergio";

  const pnlToday: number = 0;
  const tradesToday = 0;
  const dailyUsedPct = 0.4;
  const dailyMaxPct = 1.5;

  return (
    <div className="max-w-6xl">
      <DashboardHero name={name} />

      <section
        data-secondary="true"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard
          label="P&L Hoy"
          value={pnlToday === 0 ? "—" : `$${pnlToday.toFixed(2)}`}
          tone={pnlToday > 0 ? "profit" : pnlToday < 0 ? "loss" : "default"}
        />
        <MetricCard
          label="Trades"
          value={tradesToday.toString()}
          sub="ejecutados hoy"
        />
        <MetricCard
          label="Daily Used"
          value={`${dailyUsedPct.toFixed(1)}/${dailyMaxPct.toFixed(1)}`}
          progress={dailyUsedPct / dailyMaxPct}
        />
        <MetricCard label="Win Rate" value="—%" />
      </section>

      <section className="mt-8" data-secondary="true">
        <NextKillzoneCard />
      </section>
    </div>
  );
}
