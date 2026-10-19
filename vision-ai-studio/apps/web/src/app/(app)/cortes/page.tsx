import Link from "next/link";
import { CheckCircle2, Circle, Scissors } from "lucide-react";

export const metadata = { title: "Cortes de vídeo longo" };

export default function Page() {
  const steps = [
    "Crie um projeto e envie a gravação longa (aula, workshop, entrevista, atendimento) — upload multipart para arquivos grandes.",
    "Aguarde a análise (silêncios, cenas, movimento) e, se configurada, a transcrição integral.",
    "No estúdio, abra a aba “Cortes”, escolha a duração (15, 30, 45, 60, 90 s ou personalizada) e peça as sugestões.",
    "Assista, aprove ou descarte cada corte. Cada corte aprovado vira um projeto próprio para editar, legendar e exportar.",
  ];
  const ready = [
    "Preservação de frases completas (com transcrição)",
    "Títulos sugeridos a partir da primeira frase do corte",
    "Classificação por pontuação heurística (movimento, fala, ausência de silêncio) — nunca garantia de engajamento",
    "Aprovar / descartar e reaproveitar o vídeo sem copiar arquivos",
  ];
  const next = [
    "Segmentação por temas e assuntos com IA",
    "Títulos e descrições por corte gerados pela IA (hoje disponível por projeto, na aba “Textos”)",
    "Exportação em lote de vários cortes de uma vez",
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-800 text-gold-500"><Scissors className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-semibold">Cortes de vídeo longo</h1>
          <p className="text-sm text-neutral-400">Transforme uma gravação longa em vários vídeos curtos.</p>
        </div>
      </div>
      <div className="panel mt-6 p-5">
        <p className="mb-3 text-sm font-medium">Como usar</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="mb-3 mt-6 text-sm font-medium">Disponível</p>
        <ul className="space-y-2 text-sm text-neutral-300">{ready.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{r}</li>)}</ul>
        <p className="mb-3 mt-6 text-sm font-medium">Próximos passos</p>
        <ul className="space-y-2 text-sm text-neutral-400">{next.map((r) => <li key={r} className="flex gap-2"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />{r}</li>)}</ul>
        <Link href="/novo?modo=editor" className="mt-6 inline-flex h-10 items-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400">Criar projeto com gravação longa</Link>
      </div>
    </div>
  );
}
