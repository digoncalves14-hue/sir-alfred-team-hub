# PRODUCT SPEC — Sir Alfred Platform

> Especificação de produto para a evolução do **Sir Alfred Team Hub** em uma
> plataforma completa de gestão de barbearias, com potencial de comercialização
> como SaaS multiempresa.
>
> Status deste documento: **v1 — Fase 1 (Product Discovery)**
> Última atualização: 2026-08-10

## 0. Contexto e decisão de escopo

O repositório já continha um produto real em produção: o **Sir Alfred Team
Hub**, um app de cultura e gestão de equipe (React + Vite + Supabase) para a
rede de barbearias Sir Alfred (unidades Birigui, Araçatuba, Penápolis e Kids),
com login, perfis, pulso do gestor, feedbacks, ideias, prêmios, boas práticas,
avisos e comprovantes. Esse app **não fazia agendamento nem PDV** — ele
consumia dados de um sistema externo, o **AppBarber**, via integração
(`appbarber_config`, `appbarber_credentials`, snapshots de vendas/performance).

Decisão registrada com o usuário (2026-08-10):

1. **Este novo sistema substitui o AppBarber** como motor de agenda, PDV,
   financeiro e CRM. O Team Hub continua existindo como camada de cultura e
   engajamento, e passa a consumir dados do novo sistema em vez do AppBarber.
2. **Stack**: reaproveitar o Supabase já provisionado e em produção
   (Postgres + Auth + RLS + Edge Functions) em vez de subir um backend
   NestJS/Prisma próprio — ver justificativa em `ARCHITECTURE.md`.
3. **Ritmo**: nesta sessão são entregues os quatro documentos de fundação
   (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `DATABASE.md`, `ROADMAP.md`) e a
   implementação real da Fase 4 (Core): multiempresa, multiunidade, papéis,
   permissões, serviços — como descrito na Fase 4 do roadmap. As Fases 5+
   (Agenda, PDV, Financeiro, Portal do Cliente, CRM, Super Admin, IA) estão
   **planejadas e especificadas**, não implementadas.

Todo o restante deste documento descreve a visão completa do produto-alvo.
Cada seção final indica o status real: **IMPLEMENTADO**, **EM
DESENVOLVIMENTO** ou **PLANEJADO**.

---

## 1. Visão de produto

Construir uma plataforma de gestão para barbearias e redes de barbearias,
com dois produtos integrados sobre a mesma base multiempresa/multiunidade:

1. **Gestão** — painel administrativo para donos, gerentes, recepção,
   financeiro e profissionais.
2. **Portal/App do Cliente** — agendamento, histórico, fidelidade, compras,
   avaliações.

E uma terceira camada, presente desde o desenho inicial (diferencial em
relação ao AppBarber tradicional):

3. **Super Admin (SaaS)** — gestão comercial da própria plataforma: empresas
   clientes, planos, cobrança, feature flags.

Diferencial estratégico: **IA integrada à gestão** — não como recurso
acessório, mas como assistente do dono do negócio (ver seção 12).

## 2. Personas

| Persona | Necessidade principal | Interface |
|---|---|---|
| **Proprietário / Owner** | Visão consolidada de faturamento, metas, todas as unidades | Gestão (todas as telas) + IA |
| **Administrador** | Operação completa de uma ou mais unidades | Gestão |
| **Gerente de unidade** | Agenda, equipe, caixa, metas da própria unidade | Gestão (escopo de unidade) |
| **Recepção** | Agendar, check-in, caixa, cadastrar cliente | Gestão (agenda + PDV + clientes) |
| **Barbeiro/Profissional** | Ver própria agenda, comissão, metas | Gestão (escopo próprio) ou app profissional |
| **Financeiro** | Contas a pagar/receber, DRE, comissões | Gestão (financeiro) |
| **Cliente final** | Agendar, ver histórico, pagar, acumular pontos | App/Portal do Cliente |
| **Super Admin (equipe da plataforma)** | Gerenciar empresas clientes, planos, cobrança | Super Admin |

## 3. Jornadas principais

### 3.1 Cliente agenda um horário (fluxo direto)
`Unidade → Serviço → Profissional (ou "qualquer") → Data → Horário → Confirmação`

### 3.2 Cliente agenda a partir de um serviço (fluxo invertido)
`Serviço → Unidade → Profissional → Data/Hora → Confirmação`

### 3.3 Recepção atende um cliente
`Cliente chega → Check-in (recepção/QR/totem) → Status "em atendimento" →
Serviços lançados no PDV → Pagamento → Comissão calculada → Avaliação enviada`

### 3.4 Dono revisa o dia
`Dashboard → filtra por unidade/período → identifica horários ociosos ou
queda de faturamento → pergunta ao assistente de IA "por que caiu?" →
recebe hipóteses com dados → aciona campanha de recuperação`

### 3.5 Onboarding de uma nova empresa (Super Admin)
`Super Admin cria empresa → define plano → empresa cadastra unidades,
serviços e equipe → convite de acesso → trial → conversão/cobrança`

## 4. Mapa de módulos

1. Dashboard executivo
2. Agenda profissional
3. Cadastro de clientes
4. CRM (segmentação, campanhas, automações)
5. Profissionais/Equipe + RBAC
6. Comissões
7. Serviços
8. Produtos e estoque
9. PDV/Caixa
10. Financeiro (contas a pagar/receber, DRE, fluxo de caixa)
11. Metas e performance
12. Assinaturas/Clubes
13. Pacotes
14. Fidelidade
15. Vouchers e vale-presente
16. Relatórios
17. App/Portal do Cliente
18. Check-in
19. Totem de autoatendimento
20. Avaliações
21. Multiunidade (transversal)
22. Configurações da empresa
23. Super Admin / SaaS
24. Segurança e auditoria (transversal)
25. IA de gestão (diferencial)

## 5. Regras de negócio centrais

### 5.1 Multiempresa / multiunidade
- Toda entidade operacional (agenda, cliente, serviço, produto, caixa,
  financeiro) pertence a uma **Company** (empresa/tenant) e, na maioria dos
  casos, a uma **Branch** (unidade) dentro dela.
- Um usuário (`staff_member`) pode atuar em uma ou mais unidades da mesma
  empresa, nunca em unidades de outra empresa — isolamento total de dados
  entre tenants (nenhuma query pode vazar entre empresas; ver `ARCHITECTURE.md §4`).
- Um cliente (`customer`) pertence à empresa; sua "unidade de origem" é
  informativa, mas ele pode agendar em qualquer unidade da mesma empresa
  que o permita.

### 5.2 Papéis e permissões (RBAC)
- Papéis padrão: `owner`, `admin`, `manager`, `receptionist`, `professional`,
  `finance`. Cada empresa pode ter papéis adicionais.
- Permissões são granulares por módulo (`agenda.manage`, `finance.view`,
  `customers.manage`, etc.) e associadas a papéis via `role_permissions`.
- Nenhuma tela ou API deve confiar apenas no frontend para checar permissão:
  toda checagem crítica é validada no banco via RLS + funções
  `SECURITY DEFINER` (`has_permission`).

### 5.3 Agenda — regra de não-conflito
- Um profissional **não pode ter dois agendamentos que se sobreponham** no
  mesmo intervalo de tempo, considerando duração do(s) serviço(s) + intervalo
  entre serviços.
- A disponibilidade real de um profissional é o resultado de:
  `jornada de trabalho − folgas − bloqueios − férias − feriados − agendamentos existentes`.
- Encaixes (overbook) só são permitidos por usuário com permissão
  `agenda.manage` e ficam marcados como tal no registro do agendamento.

### 5.4 Cancelamento e no-show
- Política de cancelamento (prazo mínimo, cobrança de sinal, tolerância de
  atraso) é configurável por empresa (`settings`) e, opcionalmente, por
  unidade.
- Falta (no-show) é um status terminal do agendamento, distinto de
  cancelamento, e alimenta métricas de CRM (cliente em risco) e IA.

### 5.5 Comissão
- Regras de comissão podem ser: percentual, valor fixo, por serviço, por
  produto, por profissional, por categoria, progressivas por meta, e podem
  exigir que o pagamento já tenha sido confirmado antes de gerar a comissão.
- Toda alteração manual de comissão gera registro de auditoria com valor
  anterior/novo.

### 5.6 Caixa
- Uma venda pode combinar múltiplas formas de pagamento (split payment).
- Abertura/fechamento de caixa é obrigatório para operar o PDV de uma
  unidade em um turno; a diferença de caixa (esperado x contado) é registrada.

### 5.7 LGPD e dados sensíveis
- Dados de clientes (CPF, telefone, e-mail, observações) são tratados como
  dados pessoais: acesso restrito por permissão, exclusão lógica
  (soft delete) preservando histórico financeiro obrigatório por lei, e
  direito de exportação/anonimização planejado para o portal do cliente.

## 6. Status por módulo

| Módulo | Status |
|---|---|
| Multiempresa/Multiunidade (Company/Branch) | **IMPLEMENTADO** (schema + RLS + CRUD básico) |
| RBAC (roles/permissions/role_permissions) | **IMPLEMENTADO** (schema + seed de papéis padrão) |
| Serviços | **IMPLEMENTADO** (schema + CRUD) |
| Profissionais vinculados a empresa/unidade/papel | **IMPLEMENTADO** (schema + migração dos dados atuais) |
| Clientes (cadastro) | **IMPLEMENTADO** (schema); tela completa de ficha do cliente **PLANEJADO** |
| Auditoria (audit_logs) | **IMPLEMENTADO** (schema); gravação automática em todas as ações críticas **EM DESENVOLVIMENTO** |
| Agenda / disponibilidade | **PLANEJADO** (Fase 5) |
| PDV / Caixa | **PLANEJADO** (Fase 6) |
| Comissões | **PLANEJADO** (Fase 6) |
| Estoque/Produtos | **PLANEJADO** (Fase 6) |
| Financeiro / DRE | **PLANEJADO** (Fase 7) |
| Portal/App do Cliente | **PLANEJADO** (Fase 8) |
| CRM / Campanhas / Automações | **PLANEJADO** (Fase 9) |
| Assinaturas, pacotes, fidelidade, vouchers | **PLANEJADO** |
| Totem/Check-in | **PLANEJADO** |
| Super Admin / SaaS / planos / feature flags | **PLANEJADO** (Fase 10) |
| Assistente de IA do dono | **PLANEJADO** |
| Team Hub (cultura, pulso, prêmios, ideias) | **IMPLEMENTADO** (produto pré-existente, mantido) |

## 7. Fora de escopo desta fase

- Aplicativos nativos iOS/Android (o app do cliente nasce como PWA
  responsivo; nativo é evolução futura documentada no roadmap).
- Gateway de pagamento real (Pix/cartão) — desenhado no schema, integração
  real é uma fase futura.
- Integração oficial com WhatsApp Business API — preparada na modelagem de
  `Campaign`/`Notification`, não implementada.
