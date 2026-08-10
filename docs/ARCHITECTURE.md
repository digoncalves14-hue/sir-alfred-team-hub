# ARCHITECTURE — Sir Alfred Platform

Status: Fase 1-4. Última atualização: 2026-08-10.

## 1. Decisão de stack e justificativa

O pedido original especificava Next.js + NestJS + Prisma + PostgreSQL como
stack "ideal". Essa stack foi avaliada e **conscientemente não adotada**,
pelos seguintes motivos, verificados na inspeção do repositório:

1. **Já existe um backend real em produção**: este projeto roda sobre um
   projeto Supabase ativo (`VITE_SUPABASE_URL` aponta para um projeto real,
   com ~25 tabelas, RLS, Edge Functions e usuários reais). Descartar isso
   para subir um NestJS + Prisma + Postgres do zero significaria: (a) recriar
   autenticação, sessão e recuperação de senha já funcionando; (b)
   migrar usuários reais; (c) perder RLS nativo do Postgres em favor de uma
   camada de autorização a ser reescrita em código; (d) exigir infraestrutura
   de hospedagem de backend que este ambiente de execução não provisiona.
2. **PostgreSQL continua sendo o banco.** A escolha não é "abrir mão de
   Postgres", é usar o Postgres do Supabase em vez de subir uma instância
   própria gerenciada por Prisma.
3. **RLS (Row-Level Security) do Postgres cumpre o mesmo papel que um
   middleware de autorização faria em NestJS** — com a vantagem de que a
   regra de isolamento por tenant vive no banco, não pode ser contornada por
   um bug de camada de aplicação, e é auditável via SQL.
4. **Edge Functions (Deno)** cobrem o que seria a camada de API custom do
   NestJS quando é necessário lógica que não pode viver em RLS/trigger
   (ex.: webhooks de pagamento, geração de PDF, disparo de campanhas).
5. **Prisma** seria redundante: o cliente Supabase já gera tipos TypeScript
   a partir do schema (`types.ts`), cumprindo o papel de "ORM tipado" sem a
   camada de migration engine separada do Prisma, que exigiria um banco
   próprio.

**Trade-off assumido**: perde-se a portabilidade total de "backend
framework-agnostic" que o NestJS daria, e a lógica de negócio mais complexa
(ex.: motor de disponibilidade de agenda, cálculo de comissão progressiva)
terá que viver em Postgres functions/Edge Functions em vez de services
NestJS — mais difícil de testar unitariamente com ferramentas de backend
tradicionais, mais fácil de manter consistente com a autorização.

Caso o produto cresça a ponto de precisar de processamento pesado fora do
Postgres (ex.: motor de IA, filas de campanha em massa), a arquitetura já
prevê a introdução de um serviço de aplicação separado (Node/NestJS) que
**lê/escreve no mesmo Postgres via service role**, sem precisar reescrever o
que já existe — ver §7.

## 2. Visão geral da arquitetura

```
┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌───────────────────────┐
│   App Gestão (React/Vite)    │   │  Portal/App Cliente (PWA)    │   │   Super Admin (React)  │
│   /  (rotas internas)        │   │   futura app separada        │   │   futuro, mesmo padrão │
└───────────────┬──────────────┘   └───────────────┬──────────────┘   └───────────┬────────────┘
                │                                   │                              │
                └───────────────────┬───────────────┴──────────────────────────────┘
                                    │  supabase-js (REST/Realtime) + Edge Functions
                     ┌──────────────▼───────────────┐
                     │           Supabase             │
                     │  Postgres + RLS + Auth + Storage│
                     │  Edge Functions (Deno)          │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │   Integrações externas         │
                     │   (gateway de pagamento, push,  │
                     │    WhatsApp — futuras)          │
                     └───────────────────────────────┘
```

Hoje os três produtos (Gestão, App Cliente, Super Admin) compartilham **um
único projeto React** com roteamento condicional por papel — ver §3 sobre
por que isso é intencional nesta fase e como evolui.

## 3. Por que "três interfaces desde o início" e como isso é implementado hoje

A recomendação do usuário — nascer com Gestão, App do Cliente e Super Admin
como interfaces distintas — é adotada **no nível de dados e autorização
desde a Fase 4**, mesmo que ainda não exista fisicamente um app separado
para cada um:

- O schema já modela `Company`, `Branch`, `Role`, `Permission` de forma que
  nenhuma tabela operacional depende de premissas de "uma barbearia só"
  (o que a modelagem anterior, baseada no enum `unidade`, fazia).
- O código de frontend novo vive isolado por módulo (`src/gestao/...`) para
  que, quando fizer sentido, cada superfície (Gestão / Cliente / Super Admin)
  possa ser extraída para um projeto Next.js ou Vite próprio **sem reescrever
  regra de negócio**, pois toda regra crítica está no banco (RLS/functions),
  não em componentes React.
- O App do Cliente e o Super Admin **não têm UI própria ainda** (ver
  `ROADMAP.md`, Fases 8 e 10) — construí-los agora, antes de existir agenda,
  PDV e clientes reais, geraria telas sem dados reais por trás, o que viola
  a regra "não simular funcionalidade que não existe".

## 4. Multiempresa, multiunidade e isolamento de dados

- **Tenant = Company.** Toda tabela operacional carrega `company_id`
  (diretamente ou via join obrigatório, ex.: `professional_services` via
  `service_id`).
- **Isolamento é garantido em duas camadas:**
  1. RLS: toda política usa `public.is_company_member(auth.uid(), company_id)`
     ou `public.has_permission(auth.uid(), company_id, '<code>')`, funções
     `SECURITY DEFINER` que consultam `staff_members`. Nenhuma tabela nova
     é criada sem RLS habilitado.
  2. Nenhuma query do frontend depende de filtrar `company_id` manualmente
     para segurança — o filtro no client existe apenas por UX (evitar buscar
     dados de outras empresas do mesmo usuário, caso ele tenha acesso a mais
     de uma). A segurança real está no banco.
- **Branch (unidade)** é opcional em `services` (pode ser "empresa toda") e
  obrigatória conceitualmente em operações físicas futuras (agenda, caixa,
  estoque).

## 5. RBAC

- Papéis (`roles`) são **por empresa**, não globais — uma empresa pode
  customizar o nome de um papel sem afetar outras.
- Permissões (`permissions`) são um catálogo global de capacidades
  (`agenda.manage`, `finance.view`, ...); `role_permissions` conecta os dois
  por empresa.
- `staff_members` conecta `auth.users` → `company` (+ `branch` opcional) →
  `role`. Um usuário pode ter múltiplos vínculos (multiempresa do lado do
  profissional, ex.: um barbeiro freelancer em duas redes) — modelado, não
  exposto na UI ainda.
- Papéis seed (Fase 4): `owner`, `admin`, `manager`, `receptionist`,
  `professional`, `finance` — ver `DATABASE.md §RBAC`.

## 6. Segurança

- Autenticação: Supabase Auth (e-mail/senha hoje; suporta OAuth/magic link
  sem mudança de schema).
- Autorização: RLS + `SECURITY DEFINER` functions (nunca policies que
  chamam a própria tabela protegida recursivamente — padrão já usado em
  `has_role`, replicado em `has_permission`).
- Segregação de tenant: ver §4.
- Auditoria: tabela `audit_logs` (ação, entidade, valor anterior/novo,
  usuário, timestamp); IP fica disponível apenas quando a escrita passa por
  Edge Function (o client direto não tem acesso confiável ao IP do
  usuário) — documentado como limitação atual.
- Segredos: chaves de API de terceiros (ex.: antigo `appbarber_credentials`)
  nunca ficam no client; vivem em tabelas com RLS restrita a
  `service_role`/admin, ou em Supabase Secrets para Edge Functions.
- OWASP: validação server-side via `CHECK` constraints + RLS (não apenas
  Zod no client); rate limiting de endpoints sensíveis fica a cargo de Edge
  Functions quando existirem (Supabase REST já tem limite de plataforma).

## 7. Evolução futura (quando sair do "um projeto React só")

Quando o produto tiver tração comercial real (Fase 10, Super Admin/SaaS):

- Extrair o Portal do Cliente para um projeto Next.js próprio (SEO de
  páginas de agendamento público, performance mobile) consumindo o mesmo
  Supabase.
- Extrair o Super Admin para um projeto isolado, com Supabase Auth próprio
  ou papel `platform_admin` fora do escopo de qualquer `company_id`.
- Introduzir um serviço de aplicação (Node) apenas para cargas que não
  cabem bem em Postgres functions: motor de recomendação de IA, envio de
  campanhas em massa, processamento de webhooks de pagamento com retry.
- Redis entra nesse momento para filas (BullMQ) e cache de leitura pesada
  (ex.: disponibilidade de agenda calculada), não antes — introduzir Redis
  hoje seria infraestrutura sem carga real para justificar.

## 8. Convenções de código adotadas (Fase 4 em diante)

- Migrations SQL versionadas em `supabase/migrations/`, incrementais,
  nunca destrutivas em dados existentes (`ALTER`/`CREATE`, não `DROP` de
  tabelas em uso).
- `src/integrations/supabase/types.ts` estendido manualmente a cada
  migration nova (mesmo padrão que o Lovable já gera).
- Padrão de tela CRUD: `useState` + `useEffect` + chamada direta ao client
  Supabase + `sonner` para feedback — consistente com o código existente
  (`Team.tsx`, `Announcements.tsx`), em vez de introduzir React Query nas
  telas novas e gerar dois padrões concorrentes no mesmo app.
