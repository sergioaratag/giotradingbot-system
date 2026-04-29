import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  BOT_CONFIG_SPECS,
  getSpec,
  isValidValue,
} from "@/lib/bot-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.botConfig.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const configs = BOT_CONFIG_SPECS.map((spec) => {
    const row = byKey.get(spec.key);
    return {
      key: spec.key,
      value: row?.value ?? spec.default,
      description: row?.description ?? spec.description,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ configs });
}

type Patch = { key: unknown; value: unknown };

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const list = Array.isArray(body.configs) ? (body.configs as Patch[]) : null;
  if (!list) {
    return NextResponse.json(
      { error: "configs[] requerido" },
      { status: 400 },
    );
  }

  const errors: { key: string; reason: string }[] = [];
  const valid: { key: string; value: string; description: string }[] = [];

  for (const p of list) {
    const key = String(p.key ?? "");
    const value = String(p.value ?? "");
    const spec = getSpec(key);
    if (!spec) {
      errors.push({ key, reason: "unknown key" });
      continue;
    }
    if (!isValidValue(spec, value)) {
      errors.push({ key, reason: "value out of range" });
      continue;
    }
    valid.push({ key, value, description: spec.description });
  }

  if (errors.length) {
    return NextResponse.json(
      { error: "Algunos valores son inválidos.", errors },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    valid.map((v) =>
      prisma.botConfig.upsert({
        where: { key: v.key },
        create: { key: v.key, value: v.value, description: v.description },
        update: { value: v.value, description: v.description },
      }),
    ),
  );

  return NextResponse.json({ ok: true, updated: valid.length });
}
