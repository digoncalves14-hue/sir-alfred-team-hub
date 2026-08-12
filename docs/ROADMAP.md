# ROADMAP — Sir Alfred Platform

Última atualização: 2026-08-10.
Legenda: ✅ implementado · 🔶 em desenvolvimento · ⬜ planejado

## Fase 1 — Product Discovery ✅
Arquitetura, módulos, personas, jornadas, regras de negócio.
→ `PRODUCT_SPEC.md`, `ARCHITECTURE.md`.

## Fase 2 — Banco de dados ✅ (núcleo) / 🔶 (schema completo)
Schema do núcleo multiempresa/RBAC implementado e versionado em
`supabase/migrations/`. Schema completo das fases futuras está
especificado em `DATABASE.md §5`, será detalhado fase a fase.

## Fase 3 — Design System 🔶
Reaproveitado o design system existente do Team Hub (Tailwind + shadcn/ui,
tema dourado/premium já em `tailwind.config.ts` e `ui-kit.tsx`). Extensão
para os novos módulos de gestão segue os mesmos tokens — não foi criado um
novo design system do zero para não fragmentar a identidade visual já
validada em produção. Componentes de tabela/formulário para CRUDs de
gestão (padrão de lista + modal) entram como parte da Fase 4.

## Fase 4 — Core ✅ (schema + CRUD inicial)
- ✅ Autenticação (reaproveitada do Team Hub — Supabase Auth).
- ✅ Empresas (`companies`) — schema + RLS.
- ✅ Unidades (`branches`) — schema + RLS + seed a partir das 4 unidades atuais.
- ✅ Papéis/permissões (`roles`, `permissions`, `role_permissions`) — schema + seed.
- ✅ Vínculo usuário↔empresa↔unidade↔papel (`staff_members`) — schema + migração dos usuários existentes.
- ✅ Serviços (`services`, `professional_services`) — schema + CRUD.
- 🔶 Clientes (`customers`) — schema pronto; tela de ficha completa (histórico, tags, timeline) fica para a Fase 8/9.
- ⬜ Tela de gestão de papéis/permissões customizados por empresa (hoje só os 6 papéis seed).

## Fase 5 — Agenda ⬜
Disponibilidade, agendamento, bloqueios, regras de não-conflito
(`professional_schedules`, `schedule_blocks`, `holidays`, `appointments`,
`appointment_services`).

## Fase 6 — Operação ⬜
Atendimento (mudança de status do agendamento), PDV, pagamentos, caixa,
comissão (`products`, `inventory*`, `sales*`, `payments`, `cash_registers`,
`commission*`).

## Fase 7 — Financeiro ⬜
Contas a pagar/receber, DRE, fluxo de caixa, relatórios financeiros
(`financial_categories`, `expenses`, `revenues`).

## Fase 8 — Cliente ⬜
Portal/app do cliente: cadastro, login, agendamento self-service,
histórico, fidelidade. Requer Fase 5 (agenda) concluída.

## Fase 9 — CRM ⬜
Segmentação automática, notificações, campanhas (WhatsApp/e-mail/push),
automações de lembrete/recuperação. Requer Fase 5/8.

## Fase 10 — SaaS ⬜
Super Admin, planos, feature flags, cobrança recorrente, onboarding de
novas empresas. É o momento de extrair Super Admin e Portal do Cliente
para projetos próprios (ver `ARCHITECTURE.md §7`).

## Camada transversal — IA de gestão ⬜
Diferencial proposto pelo usuário. Depende de dados reais de agenda,
financeiro e CRM (Fases 5-9) para ter algo a analisar — implementá-la antes
geraria respostas simuladas, o que viola a regra de não simular
funcionalidade inexistente. Especificação prévia:
- Previsão de faturamento (série temporal sobre `sales`/`appointments`).
- Cliente em risco de não retornar (baseado em frequência histórica vs.
  tempo desde a última visita, cruzando `customers` + `appointments`).
- Horários ociosos (gaps de agenda por profissional/unidade/período).
- Sugestão automática de campanha (liga com CRM/`campaigns`).
- "Assistente do dono": chat sobre o dashboard, respondendo com base em
  dados reais das tabelas acima (não um LLM genérico sem acesso ao banco).
- Entra como módulo consultivo — nunca escreve dados sozinho, só sugere.

## O que NÃO está implementado hoje (para não gerar falsa expectativa)

- Agenda, PDV, caixa, comissão, estoque, financeiro, portal do cliente,
  CRM, super admin, IA: **nenhum destes tem tela ou API funcional ainda**.
  Todo o trabalho desta sessão é fundação (Fases 1-4).
- Nenhum gateway de pagamento real está integrado.
- Nenhuma integração de WhatsApp está ativa.
- App nativo iOS/Android: não iniciado; o app do cliente nasce como PWA.
