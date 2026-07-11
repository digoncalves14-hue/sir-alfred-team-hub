# Desbloqueio por Face ID / Digital

## Como vai funcionar (visão do usuário)

1. Usuário faz login normal (email/senha) uma vez.
2. Aparece um card: **"Ativar Face ID / Digital para entrar mais rápido"** → toca em ativar → confirma com o rosto/dedo.
3. Nas próximas vezes que abrir o app já logado, aparece uma tela de cadeado com botão **"Desbloquear com Face ID"** — 1 toque e entra.
4. Se sair da conta, o cadastro biométrico é apagado.

## Como funciona por dentro

- Sessão do Supabase já persiste por semanas — o que falta é uma "trava" pra reabrir o app rápido.
- Uso **WebAuthn** (`navigator.credentials`), a API padrão do celular pra Face ID / Touch ID / digital Android. Funciona em iOS 16+ e Android moderno.
- **Nenhuma mudança no backend / nenhuma tabela nova.** A credencial biométrica fica só no aparelho.
- O ID da credencial é salvo no `localStorage` junto com o `user.id`. Se o dispositivo mudar ou o usuário limpar dados, ele volta a pedir email/senha uma vez.

## Arquivos

**Novo — `src/hooks/useBiometric.tsx`**
- `isSupported()` — checa se o navegador aceita WebAuthn com autenticador de plataforma.
- `register(userId)` — cria a credencial biométrica (usado no botão "Ativar").
- `verify()` — pede o Face ID/digital pra desbloquear (retorna true/false).
- `clear()` — remove no logout.

**Novo — `src/components/BiometricLock.tsx`**
- Tela cheia dark/dourada com logo, mensagem "Toque pra desbloquear" e botão grande com ícone de digital/Face ID.
- Botão secundário "Usar senha" que faz logout e volta pro login normal.

**Novo — `src/components/BiometricSetupCard.tsx`**
- Card dourado que aparece no topo do painel (gestor e profissional) na primeira vez, com botões **Ativar** e **Agora não**.
- Se recusar, salva flag e não pergunta de novo (só reabre nas Configurações se a gente adicionar depois).

**Editado — `src/pages/Index.tsx`**
- Antes de mostrar `ManagerView` / `ProfessionalView`, checa: "tem biometria cadastrada pra esse user e ainda não desbloqueou nesta sessão da aba?" → mostra `BiometricLock`.
- Injeta o `BiometricSetupCard` quando ainda não estiver configurado.

**Editado — `src/hooks/useAuth.tsx`**
- No `signOut`, chama `biometric.clear()` pra apagar a credencial daquele device.

## Limites que você precisa saber

- **Só funciona no dispositivo onde foi cadastrado.** Se instalar em outro celular, ativa de novo lá.
- **iOS exige o app aberto pelo Safari ou instalado como PWA** (o que já é seu caso).
- Se a sessão do Supabase expirar de vez (raro), ainda vai pedir senha uma vez — a biometria não substitui a autenticação inicial, só evita digitar toda hora.
