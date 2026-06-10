import { auth } from "@/auth";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const isOwner = session?.user?.role === "OWNER";
  return <SettingsPage isOwner={isOwner} />;
}
