/**
 * Versão web: a conexão com o Sir Alfred Team Hub usa o retorno jarvis://hub-oauth,
 * que só existe no app instalado. Indicadores por Google Planilhas funcionam na web.
 */
export async function connectHub(): Promise<{ ok: true; account: string | null } | { ok: false; cancelled: boolean; message: string }> {
  return {
    ok: false,
    cancelled: false,
    message: "A conexão com o Sir Alfred Team Hub está disponível no app instalado. Na versão web, use uma Planilha Google como fonte de dados.",
  };
}
