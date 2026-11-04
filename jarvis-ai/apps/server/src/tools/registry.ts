/**
 * Registro de ferramentas (Tool Registry).
 *
 * Cada ferramenta declara:
 *  - esquema de entrada (zod) → convertido em JSON Schema para o modelo e
 *    usado para VALIDAR a entrada antes de executar;
 *  - nível de risco:
 *      read    → consulta, executa direto;
 *      write   → alteração reversível de baixo impacto, executa direto e registra;
 *      confirm → envio/exclusão/irreversível: NUNCA executa sem confirmação explícita.
 *
 * Novas ferramentas (agenda, e-mail, conectores empresariais) entram aqui sem
 * alterar o orquestrador.
 */
import { z } from "zod";
import type { DeviceAction, Profile } from "@jarvis/shared";
import type { UserStore } from "../store/types";
import type { ToolSpec } from "../ai/types";
import type { GoogleUser } from "../google/gateway";
import type { ConnectorService } from "../business/connectors";
import type { ReportGenerator } from "../business/reports";
import type { MemoryIndex } from "../memory/index";

export type ToolRisk = "read" | "write" | "confirm";

export interface ToolContext {
  store: UserStore;
  profile: Profile;
  conversationId: string | null;
  now: Date;
  /** Integração Google do usuário; null quando o backend não tem o OAuth configurado. */
  google: GoogleUser | null;
  /** Conectores e relatórios dos negócios (Fase 4); null quando não configurados. */
  business?: { connectors: ConnectorService; reports: ReportGenerator } | null;
  /** Memória semântica (Fase 5); null = busca por palavras. */
  memory?: MemoryIndex | null;
}

export interface ToolOutcome {
  /** Texto devolvido ao modelo. */
  content: string;
  /** Resumo curto e honesto para o usuário (feedback visual). */
  summary: string;
  isError?: boolean;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Rótulo amigável exibido no app. */
  label: string;
  description: string;
  input: S;
  risk: ToolRisk;
  /** Para ferramentas `confirm`: descreve exatamente o que será feito. */
  describe?: (input: z.infer<S>, ctx: ToolContext) => Promise<string> | string;
  /**
   * Ferramentas executadas NO IPHONE (após a confirmação): devolvem a ação que o app
   * executa localmente. O servidor só marca como concluída quando o app reporta sucesso.
   */
  deviceAction?: (input: z.infer<S>, ctx: ToolContext) => DeviceAction;
  execute: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(...defs: ToolDefinition<z.ZodType>[]): this {
    for (const d of defs) {
      if (this.tools.has(d.name)) throw new Error(`Ferramenta duplicada: ${d.name}`);
      if (d.risk === "confirm" && !d.describe) throw new Error(`Ferramenta ${d.name} exige describe() para confirmação.`);
      if (d.deviceAction && d.risk !== "confirm") throw new Error(`Ferramenta ${d.name} executada no iPhone deve exigir confirmação.`);
      this.tools.set(d.name, d);
    }
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Especificações para o modelo, em ordem determinística (estável para cache). */
  specs(exclude?: ReadonlySet<string>): ToolSpec[] {
    return this.list()
      .filter((t) => !exclude?.has(t.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => {
        const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
        return { name: t.name, description: t.description, inputSchema: schema };
      });
  }
}
