import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
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
    <div className="min-h-screen bg-onyx">
      <Sidebar
        user={{ name: session.user.name, email: session.user.email }}
      />
      <div className="pl-60 flex flex-col min-h-screen">
        <KillSwitchBanner />
        <Header />
        <main className="flex-1 p-8">{children}</main>
      </div>
      <FocusMode />
    </div>
  );
}
