/** Versão web: baixa o JSON exportado (no iPhone, vai para o app Arquivos › Downloads). */
export async function shareJson(name: string, json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
