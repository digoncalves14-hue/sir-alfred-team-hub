import Link from "next/link";
import { ArrowRight, Clapperboard, Download, FolderKanban, Gem, HardDrive, Images, LayoutTemplate, Scissors, Sparkles, Wand2 } from "lucide-react";
import { EDIT_STYLES } from "@vision/core";
import { and, count, desc, eq, getDb, inArray, isNull, assets, brands, projects, renders } from "@vision/db";
import { capabilities, getUsageSummary } from "@vision/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProjectCard } from "@/components/ProjectCard";
import { Badge, Progress } from "@/components/ui";
import { projectCardDto } from "@/lib/dto";
import { fmtBytes, fmtDate, fmtUsd } from "@/lib/format";
import { requireSession } from "@/lib/session";

const BUSY = ["queued", "analyzing", "transcribing", "selecting", "rendering"];

export default async function Dashboard() {
  const s = await requireSession();
  const db = getDb();
  const orgId = s.org.id;
  const rows = await db
    .select({ p: projects, brandName: brands.name })
    .from(projects)
    .leftJoin(brands, eq(brands.id, projects.brandId))
    .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt))
    .limit(60);
  const cards = await Promise.all(rows.map((r) => projectCardDto(r.p, r.brandName)));
  const processing = cards.filter((c) => BUSY.includes(c.status));
  const finished = cards.filter((c) => c.status === "ready");
  const usage = await getUsageSummary(db, orgId);
  const caps = capabilities();
  const [{ n: brandCount }] = await db.select({ n: count() }).from(brands).where(eq(brands.orgId, orgId));
  const [{ n: mediaCount }] = await db.select({ n: count() }).from(assets).where(and(eq(assets.orgId, orgId), inArray(assets.role, ["source", "music", "logo"])));
  const exportsRows = await db
    .select({ r: renders, name: projects.name })
    .from(renders)
    .innerJoin(projects, eq(projects.id, renders.projectId))
    .where(and(eq(renders.orgId, orgId), eq(renders.kind, "export")))
    .orderBy(desc(renders.createdAt))
    .limit(5);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:py-8">
      <AutoRefresh active={processing.length > 0} />
      <section className="overflow-hidden rounded-2xl border border-ink-700 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.14),transparent_55%)] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold-500">Olá, {s.user.name.split(" ")[0]}</p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">O que vamos produzir hoje?</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">Envie seus vídeos, escolha a marca e o destino e descreva o resultado. A IA monta, corta, legenda e exporta.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/novo" className="group flex items-center gap-3 rounded-xl bg-gold-500 px-4 py-4 text-ink-950 transition hover:bg-gold-400">
            <Sparkles className="h-6 w-6" />
            <span className="flex-1">
              <span className="block font-semibold">Criar vídeo com IA</span>
              <span className="block text-xs opacity-80">Envie, descreva e receba pronto</span>
            </span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link href="/cortes" className="group flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 px-4 py-4 transition hover:border-ink-500">
            <Scissors className="h-6 w-6 text-gold-500" />
            <span className="flex-1">
              <span className="block font-semibold">Cortes de vídeo longo</span>
              <span className="block text-xs text-neutral-400">Fase 3 · em desenvolvimento</span>
            </span>
          </Link>
          <Link href="/novo?modo=editor" className="group flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 px-4 py-4 transition hover:border-ink-500">
            <Wand2 className="h-6 w-6 text-gold-500" />
            <span className="flex-1">
              <span className="block font-semibold">Abrir editor completo</span>
              <span className="block text-xs text-neutral-400">Controle manual com apoio da IA</span>
            </span>
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <Badge tone={caps.ai ? "gold" : "warn"}>{caps.ai ? `IA: ${caps.aiModel}` : "IA não configurada · interpretador local ativo"}</Badge>
          <Badge tone={caps.transcription ? "gold" : "warn"}>{caps.transcription ? `Transcrição: ${caps.transcriptionProvider}` : "Transcrição não configurada"}</Badge>
          <Badge>Armazenamento: {caps.storage === "s3" ? "S3" : "local"}</Badge>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<HardDrive className="h-4 w-4" />} label="Armazenamento" value={`${fmtBytes(usage.storageBytes)} de ${fmtBytes(usage.storageLimitBytes)}`} progress={usage.storageBytes / usage.storageLimitBytes} />
        <Stat icon={<Clapperboard className="h-4 w-4" />} label="Renderização no mês" value={`${usage.renderMinutes.toFixed(1)} de ${usage.renderLimitMinutes} min`} progress={usage.renderMinutes / usage.renderLimitMinutes} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Custo estimado de IA no mês" value={`${fmtUsd(usage.aiCostUsd)} de ${fmtUsd(usage.aiBudgetUsd)}`} progress={usage.aiCostUsd / Math.max(0.01, usage.aiBudgetUsd)} />
        <Stat icon={<FolderKanban className="h-4 w-4" />} label="Projetos" value={`${cards.length} · ${processing.length} em processamento`} />
      </section>

      {processing.length > 0 && (
        <Section title="Em processamento" href="/projetos">
          <Grid>{processing.slice(0, 4).map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>
        </Section>
      )}

      <Section title="Projetos recentes" href="/projetos">
        {cards.length ? (
          <Grid>{cards.slice(0, 8).map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-700 p-10 text-center text-sm text-neutral-400">
            Nenhum projeto ainda. <Link href="/novo" className="text-gold-400 hover:underline">Crie o primeiro com IA</Link>.
          </div>
        )}
      </Section>

      {finished.length > 0 && (
        <Section title="Vídeos finalizados" href="/exportacoes">
          <Grid>{finished.slice(0, 4).map((p) => <ProjectCard key={p.id} p={p} />)}</Grid>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Histórico de exportações</h2>
            <Link href="/exportacoes" className="text-xs text-gold-400 hover:underline">Ver tudo</Link>
          </div>
          {exportsRows.length ? (
            <ul className="divide-y divide-ink-800 text-sm">
              {exportsRows.map(({ r, name }) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-neutral-200">{name}</span>
                    <span className="text-xs text-neutral-500">{r.preset} · {fmtDate(r.createdAt.toISOString())}</span>
                  </span>
                  {r.status === "succeeded" ? (
                    <a href={`/api/renders/${r.id}/download`} className="inline-flex items-center gap-1 text-xs text-gold-400 hover:underline"><Download className="h-3.5 w-3.5" /> Baixar</a>
                  ) : (
                    <span className="text-xs text-neutral-500">{r.status === "failed" ? "Falhou" : r.status === "canceled" ? "Cancelado" : `${Math.round(r.progress * 100)}%`}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Nenhuma exportação ainda.</p>
          )}
        </div>
        <div className="space-y-3">
          <QuickLink href="/marcas" icon={<Gem className="h-4 w-4" />} title="Marcas cadastradas" subtitle={`${brandCount} marcas`} />
          <QuickLink href="/biblioteca" icon={<Images className="h-4 w-4" />} title="Biblioteca de mídia" subtitle={`${mediaCount} arquivos`} />
          <div className="panel p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><LayoutTemplate className="h-4 w-4 text-gold-500" /> Estilos automáticos</div>
            <p className="mt-1 text-xs text-neutral-500">Disponíveis no assistente. Templates editáveis completos chegam na Fase 2.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.values(EDIT_STYLES).map((st) => <Badge key={st.id}>{st.label}</Badge>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, progress }: { icon: React.ReactNode; label: string; value: string; progress?: number }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-400"><span className="text-gold-500">{icon}</span>{label}</div>
      <p className="mt-2 text-sm font-medium text-neutral-100">{value}</p>
      {progress !== undefined && <Progress value={progress} className="mt-3" />}
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-xs text-gold-400 hover:underline">Ver tudo</Link>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function QuickLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link href={href} className="panel flex items-center gap-3 p-4 transition hover:border-ink-600">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800 text-gold-500">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-neutral-500" />
    </Link>
  );
}
