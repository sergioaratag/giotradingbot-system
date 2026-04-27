import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-midnight-950">
      <Sidebar
        user={{ name: session.user.name, email: session.user.email }}
      />
      <div className="pl-60 flex flex-col min-h-screen">
        <Header botOnline={false} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
