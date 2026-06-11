import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { FocusMode } from "@/components/FocusMode";
import { KillSwitchBanner } from "@/components/KillSwitchBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <AppShell user={{ name: session.user.name, email: session.user.email }}>
        <KillSwitchBanner />
        <Header />
        <main className="flex-1 p-8">{children}</main>
      </AppShell>
      <FocusMode />
    </>
  );
}
