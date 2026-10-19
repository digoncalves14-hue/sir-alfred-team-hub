import { TemplatesList } from "@/components/TemplatesList";
import { listTemplates } from "@/lib/templates";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Templates" };

export default async function Page() {
  const s = await requireSession();
  const templates = await listTemplates(s.org.id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold">Templates inteligentes</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-400">
        Cada template aplica decisões reais de edição (estilo, formato, duração, silêncios, legenda, logo, música e cortes na batida).
        A orientação narrativa (ex.: “antes no início, depois no final”) é usada pela IA quando ela está configurada.
        Para criar o seu, edite um projeto e use “Salvar esta edição como template” na aba Formato do estúdio.
      </p>
      <div className="mt-6"><TemplatesList templates={templates} /></div>
    </div>
  );
}
