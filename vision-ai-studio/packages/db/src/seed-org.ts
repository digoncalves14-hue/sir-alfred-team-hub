import { BRAND_SEEDS } from "@vision/core";
import type { Db } from "./client";
import { brands } from "./schema";

/** Cria as marcas iniciais (sem logos — devem ser enviadas pelo usuário). */
export async function seedBrandsForOrg(db: Db, orgId: string): Promise<void> {
  await db
    .insert(brands)
    .values(
      BRAND_SEEDS.map((b, i) => ({
        // ordem estável de exibição (a primeira marca é a padrão no assistente)
        createdAt: new Date(Date.now() + i),
        orgId,
        slug: b.slug,
        name: b.name,
        segment: b.segment,
        tone: b.tone,
        contentTypes: b.contentTypes,
        colors: b.colors,
        fonts: b.fonts,
        defaultStyleId: b.defaultStyleId,
        notes: b.notes ?? null,
      })),
    )
    .onConflictDoNothing();
}
