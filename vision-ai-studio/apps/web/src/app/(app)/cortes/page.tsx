import Link from "next/link";
import { CheckCircle2, Circle, Scissors } from "lucide-react";

export const metadata = { title: "Cortes de vídeo longo" };

export default function Page() {
  const ready = [
    "Envio de gravações longas (até o limite configurado, padrão 4 h) com upload multipart",
    "Análise de silêncio, trocas de cena e movimento",
    "Transcrição integral (quando um provedor está configurado)",
    "Gerar UMA versão curta pelo assistente (“faça uma versão de 60 segundos”), preservando frases completas",
  ];
  const next = [
    "Segmentação da transcrição por temas e assuntos",
    "Várias sugestões de cortes por gravação, com títulos sugeridos",
    "Classificação por relevância (estimativa heurística, nunca garantia de engajamento)",
    "Aprovar ou descartar cada corte e exportar em lote",
    "Durações 15, 30, 45, 60, 90 s ou personalizada por corte",
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-800 text-gold-500"><Scissors className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-semibold">Cortes de vídeo longo</h1>
          <p className="text-sm text-neutral-400">Planejado para a Fase 3 — ainda não disponível como fluxo dedicado.</p>
        </div>
      </div>
      <div className="panel mt-6 p-5">
        <p className="mb-3 text-sm font-medium">Já funciona hoje</p>
        <ul className="space-y-2 text-sm text-neutral-300">{ready.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{r}</li>)}</ul>
        <p className="mb-3 mt-6 text-sm font-medium">Em desenvolvimento</p>
        <ul className="space-y-2 text-sm text-neutral-400">{next.map((r) => <li key={r} className="flex gap-2"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />{r}</li>)}</ul>
        <Link href="/novo" className="mt-6 inline-flex h-10 items-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400">Criar uma versão curta com IA</Link>
      </div>
    </div>
  );
}
