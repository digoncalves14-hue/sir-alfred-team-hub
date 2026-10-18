/**
 * Erros de processamento com mensagem compreensível para o usuário final e
 * indicação se vale a pena tentar novamente automaticamente.
 */
export class ProcessingError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public retryable = false,
    public detail?: string,
  ) {
    super(userMessage);
    this.name = "ProcessingError";
  }
}

export class CanceledError extends Error {
  constructor() {
    super("Processamento cancelado.");
    this.name = "CanceledError";
  }
}

export function toProcessingError(err: unknown): ProcessingError {
  if (err instanceof ProcessingError) return err;
  if (err instanceof CanceledError) return new ProcessingError("canceled", "Processamento cancelado.", false);
  const e = err as NodeJS.ErrnoException;
  if (e?.code === "ENOSPC") return new ProcessingError("disk_full", "O servidor ficou sem espaço temporário. Tente novamente em instantes.", true);
  if (e?.code === "ENOENT" && /ffmpeg|ffprobe/.test(e.message)) {
    return new ProcessingError("ffmpeg_missing", "O FFmpeg não está instalado no servidor de processamento.", false, e.message);
  }
  if (e?.code === "ECONNRESET" || e?.code === "ETIMEDOUT" || e?.code === "ECONNREFUSED") {
    return new ProcessingError("network", "Falha temporária de rede ao processar. Uma nova tentativa será feita.", true, e.message);
  }
  return new ProcessingError("internal", "Ocorreu um erro inesperado no processamento.", true, (err as Error)?.message);
}
