export const PROJECT_STATUSES = [
  "draft",
  "editing",
  "queued",
  "analyzing",
  "transcribing",
  "selecting",
  "rendering",
  "ready",
  "error",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Rascunho",
  editing: "Pronto para editar",
  queued: "Aguardando processamento",
  analyzing: "Analisando vídeo",
  transcribing: "Gerando transcrição",
  selecting: "Selecionando cenas",
  rendering: "Renderizando",
  ready: "Concluído",
  error: "Erro no processamento",
};

export const JOB_TYPES = ["probe", "analyze", "transcribe", "ai_command", "render", "thumbnail", "generate_content", "proxy"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  probe: "Leitura técnica do arquivo",
  analyze: "Análise de cenas, silêncio e movimento",
  transcribe: "Transcrição do áudio",
  ai_command: "Comando de edição",
  render: "Renderização",
  thumbnail: "Miniatura",
  generate_content: "Geração de textos para redes sociais",
  proxy: "Cópia leve para a prévia",
};
