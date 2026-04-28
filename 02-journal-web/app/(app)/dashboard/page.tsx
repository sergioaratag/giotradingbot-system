import { auth } from "@/auth";
import { DashboardHero } from "@/components/DashboardHero";
import { DashboardMetrics } from "@/components/DashboardMetrics";
import { NextKillzoneCard } from "@/components/NextKillzoneCard";

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "Sergio";

  return (
    <div className="max-w-6xl">
      <DashboardHero name={name} />
      <DashboardMetrics />
      <section className="mt-8" data-secondary="true">
        <NextKillzoneCard />
      </section>
    </div>
  );
}
