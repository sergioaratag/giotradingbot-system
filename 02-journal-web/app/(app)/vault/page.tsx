import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VaultBoard } from "@/components/VaultBoard";

export default async function VaultPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const entries = await prisma.vaultEntry.findMany({
    where: { userId: session.user.id },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  const initial = entries.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    content: e.content,
    imageUrl: e.imageUrl,
    pinned: e.pinned,
    createdAt: e.createdAt.toISOString(),
  }));

  return <VaultBoard initial={initial} />;
}
