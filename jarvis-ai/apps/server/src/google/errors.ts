export type IntegrationErrorCode = "nao_configurado" | "nao_conectado" | "servico_nao_autorizado" | "reconectar" | "erro_google" | "erro_conector";

/** Erro "honesto" de integração: vira mensagem clara para o usuário, nunca um sucesso falso. */
export class IntegrationError extends Error {
  constructor(
    public readonly code: IntegrationErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export const SERVICE_LABEL = { calendar: "Google Agenda", gmail: "Gmail", sheets: "Google Planilhas" } as const;
