# Achei Você no Google Automação

Plataforma web para automatizar a gestão do Perfil da Empresa no Google (Google Business
Profile) de clientes de uma agência: respostas de avaliações com IA, criação de posts com IA,
geração de relatórios de métricas e envio via WhatsApp e e-mail.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma ORM + PostgreSQL
- NextAuth (login do administrador)
- Google Gemini API (geração de respostas e legendas)
- WhatsApp Business Cloud API (Meta)
- Resend (envio de e-mail)

## Modo Mock (recomendado para começar)

Todas as integrações externas (Google Business Profile, WhatsApp, E-mail) possuem uma
implementação **real** e uma implementação **mock** (simulada). Enquanto
`USE_MOCK_APIS="true"` no `.env` (ou enquanto as credenciais reais não estiverem
configuradas), o sistema usa dados simulados — permitindo testar o fluxo completo
(cadastro de cliente → sincronizar avaliações → responder com IA → criar post → gerar
relatório → enviar por WhatsApp/e-mail) sem nenhuma aprovação externa.

---

## 1. Pré-requisitos

- [Node.js 20+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (para rodar o PostgreSQL localmente) — ou um
  PostgreSQL já instalado
- Uma chave da [Google Gemini API](https://aistudio.google.com/app/apikey) (opcional, mas
  recomendado — sem ela, as respostas/legendas usam textos padrão de fallback)

## 2. Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env
# Edite o .env e ajuste DATABASE_URL, NEXTAUTH_SECRET, GEMINI_API_KEY, etc.

# 3. Subir o banco de dados PostgreSQL
docker compose up -d

# 4. Rodar as migrations do Prisma (cria as tabelas)
npx prisma migrate dev --name init

# 5. Popular o banco com o usuário admin e um cliente de exemplo
npm run prisma:seed

# 6. Rodar o projeto
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000). Você será redirecionado para o
login.

### Login padrão (criado pelo seed)

- **E-mail:** `admin@acheivoceno.google`
- **Senha:** `admin123`

> Altere essas credenciais em produção. Você pode definir `SEED_ADMIN_EMAIL` e
> `SEED_ADMIN_PASSWORD` no `.env` antes de rodar `npm run prisma:seed`, ou criar um novo
> usuário diretamente no banco (a senha é armazenada com hash bcrypt).

### Gerar um NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

---

## 3. Variáveis de ambiente (`.env`)

Veja `.env.example` para a lista completa e comentada. Resumo:

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | String de conexão do PostgreSQL |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | Configuração do NextAuth |
| `USE_MOCK_APIS` | `"true"` para usar dados simulados em todas as integrações externas |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | Credenciais OAuth2 da Google Business Profile API |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_BUSINESS_ACCOUNT_ID` | Credenciais do WhatsApp Business Cloud API (Meta) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Credenciais de envio de e-mail (Resend) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Credenciais da IA (Google Gemini) |

---

## 4. Como obter cada credencial (configuração manual)

Estas integrações dependem de aprovações/configurações feitas **fora deste código**, em
painéis de terceiros. Enquanto não estiverem prontas, deixe `USE_MOCK_APIS="true"`.

### 4.1 Google Business Profile API

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ative a **"Google Business Profile API"** (a Google exige uma solicitação de acesso —
   o acesso não é instantâneo, pode levar dias para ser aprovado).
3. Crie credenciais OAuth2 (tipo "Aplicativo Web") e configure o escopo
   `https://www.googleapis.com/auth/business.manage`.
4. Execute o fluxo de consentimento OAuth2 (login do Google) uma vez para obter um
   **refresh token** de uma conta que tenha acesso ao(s) perfil(is) de negócio dos
   clientes.
5. Preencha `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN` no `.env`.
6. Para cada cliente cadastrado no sistema, preencha o campo "ID/localização do Google
   Business Profile" com o `name` retornado pela API, no formato
   `accounts/{accountId}/locations/{locationId}`.

> Implementação em [src/services/google-business/client.ts](src/services/google-business/client.ts).
> Os nomes exatos das métricas de performance (`CALL_CLICKS`,
> `BUSINESS_DIRECTION_REQUESTS`, `WEBSITE_CLICKS`, `BUSINESS_BOOKINGS`) podem variar
> conforme atualizações da Performance API da Google — confira a documentação oficial
> antes de usar em produção.

### 4.2 WhatsApp Business Cloud API (Meta)

1. Crie uma conta em [Meta for Developers](https://developers.facebook.com/) e um app do
   tipo "Business".
2. Adicione o produto **WhatsApp** ao app.
3. No modo de testes, a Meta fornece um número de teste e você pode adicionar números de
   destino (até 5) na lista de testadores — não é necessário aprovação para testar.
4. Para produção, é necessário verificar o negócio (Business Verification) e registrar um
   número de telefone próprio.
5. Gere um **token de acesso permanente** através de um *System User* no Business
   Manager (Configurações do Negócio → Usuários do Sistema).
6. Preencha `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_BUSINESS_ACCOUNT_ID`
   no `.env`.

> Implementação em [src/services/whatsapp/client.ts](src/services/whatsapp/client.ts).
> O número do cliente cadastrado no sistema deve estar em formato internacional sem
> espaços/símbolos (ex: `5511999999999`).

### 4.3 E-mail (Resend)

1. Crie uma conta em [resend.com](https://resend.com).
2. Gere uma API key e preencha `RESEND_API_KEY`.
3. Para enviar de um endereço com domínio próprio (ex: `relatorios@suaagencia.com`), você
   precisa **verificar o domínio** (adicionar registros DNS SPF/DKIM no provedor do
   domínio). Sem isso, o Resend só permite enviar para o e-mail cadastrado na sua conta.
4. Ajuste `EMAIL_FROM` no `.env`.

> Implementação em [src/services/email/client.ts](src/services/email/client.ts). Pode ser
> substituída por SMTP (Nodemailer) ou Gmail API mantendo a mesma interface
> `EmailService`.

### 4.4 IA - Google Gemini

1. Acesse [Google AI Studio](https://aistudio.google.com/app/apikey) e gere uma API key
   gratuita.
2. Preencha `GEMINI_API_KEY` no `.env`. Ajuste `GEMINI_MODEL` se necessário (padrão:
   `gemini-1.5-flash`).
3. Sem a chave configurada, o sistema usa textos de fallback padrão (definidos em
   [src/services/ai/gemini.ts](src/services/ai/gemini.ts)) para não bloquear o uso do
   restante do sistema.

---

## 5. Estrutura do projeto

```
prisma/                 # schema do banco e seed
src/
  app/
    login/              # tela de login
    (dashboard)/        # área autenticada (layout com sidebar)
      clientes/         # lista, cadastro e detalhe de clientes
    api/                # rotas de API (clientes, reviews, posts, reports, ai, auth)
  components/           # componentes de UI (formulários, painéis)
  lib/                   # prisma client, auth (NextAuth), env, validação
  services/
    google-business/     # integração com Google Business Profile (real + mock)
    whatsapp/             # integração com WhatsApp Cloud API (real + mock)
    email/                # integração com e-mail via Resend (real + mock)
    ai/                   # geração de texto com Gemini
    reports/              # geração de relatórios (templates curto/completo)
```

Cada serviço externo (`google-business`, `whatsapp`, `email`) expõe a mesma interface
TypeScript em `client.ts` (real) e `mock.ts` (simulado); o arquivo `index.ts` de cada
pasta escolhe automaticamente qual usar com base em `USE_MOCK_APIS` e na presença das
credenciais.

---

## 6. Fluxo de uso

1. **Cadastrar cliente** em "Clientes → Novo cliente".
2. Na página do cliente, clique em **"Sincronizar avaliações"** para buscar avaliações do
   Google (mock ou real).
3. Para uma avaliação pendente, clique em **"Gerar resposta com IA"**, revise o texto e
   clique em **"Publicar resposta"**.
4. Em "Posts", informe um tema, clique em **"Gerar legenda com IA"**, revise e **"Salvar
   como rascunho"**; depois clique em **"Publicar"**.
5. Em "Relatórios", escolha o período e tipo (semanal/mensal) e clique em **"Gerar
   relatório"**. Em seguida, use **"Enviar via WhatsApp"** e/ou **"Enviar via e-mail"**.

---

## 7. Segurança

- Nenhuma credencial é exposta ao frontend — todas as chamadas a APIs externas ocorrem em
  rotas de API do Next.js (`src/app/api/**`), executadas no servidor.
- Todas as chaves/segredos ficam em variáveis de ambiente (`.env`, nunca commitado — veja
  `.gitignore`).
- O acesso ao painel (`/dashboard/**`) e às rotas de API de gestão exige autenticação via
  NextAuth (`src/middleware.ts`).

---

## 8. Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` / `npm run start` | Build e execução em produção |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Aplica migrations do Prisma |
| `npm run prisma:seed` | Popula o banco (admin + cliente de exemplo) |
| `npm run db:studio` | Abre o Prisma Studio (interface visual do banco) |

---

## 9. Limitações conhecidas (MVP)

- A sincronização de avaliações é manual (botão "Sincronizar"), sem webhook/cron.
- A Google Business Profile API tem cotas e exige aprovação manual — sem isso, o sistema
  funciona inteiramente em modo mock.
- O envio de WhatsApp em produção requer verificação de negócio na Meta.
- Não há fila/retry automático para envios falhados — o status `FAILED` é registrado e
  pode ser tentado novamente manualmente pela interface.
