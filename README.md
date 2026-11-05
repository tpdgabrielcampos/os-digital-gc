# OS digital GC — Ordens de Serviço

Cópia do site da Tatim, separada para controle próprio dos trabalhos (banco, Trello e planilha próprios).

# TATIM — Ordens de Serviço

Plataforma web simples para:

- **Dentistas** criarem ordens de serviço (`/novo-pedido`): dados do paciente, tipo de trabalho, dentes envolvidos (odontograma clicável), material e cor da restauração (obrigatórios), prazo, referência ao caso no DS Core, e fotos.
- **Você (laboratório)** acompanhar tudo num painel (`/dashboard`, protegido por senha): lista de casos, filtro por status, e uma tela de detalhe de cada pedido onde dá pra ver as fotos, conferir a referência do DS Core, mudar o status do caso e escrever notas internas.

Sobre o DS Core: não existe integração automática (a DS Core não oferece uma API pública), então o formulário tem um campo onde o dentista informa o nome do paciente / link do compartilhamento no DS Core, e você confere manualmente os arquivos `.ply` por lá — exatamente como já faz hoje.

## Como rodar no seu computador (opcional, pra testar antes de publicar)

Requer [Node.js](https://nodejs.org) instalado (versão 18 ou mais nova).

```
npm install
cp .env.example .env.local
# edite .env.local com os valores do Supabase (veja o passo 1 abaixo)
npm run dev
```

Depois abra http://localhost:3000

## Como publicar de verdade (grátis) — passo a passo

Você vai precisar de duas contas gratuitas: **Supabase** (banco de dados + armazenamento das fotos) e **Vercel** (hospedagem do site). As duas têm plano gratuito generoso, suficiente pra esse uso.

### 1. Criar o banco de dados (Supabase)

1. Crie uma conta em https://supabase.com (pode entrar com o Google).
2. Clique em "New project". Dê um nome (ex: `tatim-ordens`) e uma senha de banco (guarde ela, mas não é a mesma senha do painel).
3. Espere o projeto ser criado (leva ~2 minutos).
4. No menu lateral, vá em **SQL Editor** → **New query**.
5. Abra o arquivo `supabase/schema.sql` (está na pasta deste projeto), copie todo o conteúdo, cole no editor e clique em **Run**. Isso cria as tabelas e o espaço de armazenamento das fotos.
6. Vá em **Project Settings** (ícone de engrenagem) → **API**. Você vai precisar de 3 valores nessa tela:
   - **Project URL** → é o `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → é o `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (clique em "Reveal") → é o `SUPABASE_SERVICE_ROLE_KEY` — **essa é secreta, nunca compartilhe ou coloque no código**

### 2. Publicar o site (Vercel)

1. Crie uma conta em https://vercel.com (pode entrar com o GitHub, Google, etc).
2. A forma mais simples de subir o projeto sem usar linha de comando:
   - Crie uma conta no GitHub (https://github.com) se ainda não tiver.
   - Crie um repositório novo (pode ser privado) e suba os arquivos desta pasta nele (dá pra arrastar os arquivos direto pela interface do GitHub em "Add file → Upload files", exceto a pasta `node_modules` se ela existir).
   - Na Vercel, clique em "Add New… → Project", conecte sua conta do GitHub e selecione esse repositório.
3. Na tela de configuração do projeto na Vercel, abra **Environment Variables** e adicione as variáveis:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD` → escolha uma senha forte, só sua — é o que protege o `/dashboard`
   - `NEXT_PUBLIC_SITE_URL` → o link do seu site (ex: `https://SEU-SITE.vercel.app`)
   - as variáveis `TRELLO_...` — veja a seção **Integração com o Trello** abaixo (opcional, pode pular e configurar depois)
4. Clique em **Deploy**. Em ~1 minuto o site estará no ar num link tipo `https://tatim-ordens.vercel.app`.

### 3. Usar

- Envie o link `https://SEU-SITE.vercel.app/novo-pedido` pros dentistas que enviam casos pra você — esse é o link do formulário.
- Acesse `https://SEU-SITE.vercel.app/dashboard` e entre com a senha que você definiu (`ADMIN_PASSWORD`) pra ver e controlar os casos.

### Atualizando o site depois

Qualquer alteração nos arquivos do projeto que você suba de novo pro GitHub é publicada automaticamente pela Vercel em menos de um minuto.

## Status de um caso

Cada pedido passa pelos seguintes status — mudam tanto pela tela de detalhe quanto, se a integração com o Trello estiver ativa, movendo o cartão correspondente no board:

1. **Recebido** — acabou de chegar
2. **Standby** — aguardando (arquivos em conferência, caso ainda não aceito, etc.)
3. **CAD**
4. **CAM**
5. **Finalização**
6. **Entregue**

## Integração com o Trello

Com essa integração ativa: todo pedido novo já aparece automaticamente como um cartão na lista **Recebidos** do seu board do Trello; mudar o status pelo `/dashboard` move o cartão pra lista correspondente; e mover o cartão manualmente no Trello atualiza o status no `/dashboard` também — funciona nos dois sentidos.

É opcional — sem configurar isso, o sistema funciona normalmente, só não cria/move cartões.

### Passo 1 — Gerar a chave da API

1. Acesse https://trello.com/power-ups/admin, aceite os termos se pedido, e crie um novo app (nome, sua área de trabalho, seu e-mail — pode deixar a "URL de conector Iframe" em branco).
2. Na aba **Chave de API** do app criado, copie a **Chave de API** (`TRELLO_API_KEY`) e o **Segredo** (`TRELLO_API_SECRET`).
3. Clique no link **token** (perto da Chave de API) pra autorizar e gerar um token de acesso à sua própria conta — esse é o `TRELLO_API_TOKEN`.

### Passo 2 — Preparar o board

Crie um board no Trello com uma lista pra cada status: **Recebidos**, **Standby**, **CAD**, **CAM**, **Finalizaçao**, **Entregues** (os nomes das listas podem ser o que você quiser — o que importa é o id de cada uma, pegos no próximo passo).

### Passo 3 — Pegar os ids das listas

Com a Key e o Token em mãos, abra esta URL no navegador (troque `SEU_BOARD` pelo id ou pelo código curto do board, visível na URL do board no Trello):

```
https://api.trello.com/1/boards/SEU_BOARD/lists?key=SUA_KEY&token=SEU_TOKEN&fields=name,id
```

Isso devolve uma lista com o nome e o id de cada lista do board. Guarde os ids — cada um vai numa variável de ambiente diferente (`TRELLO_LIST_RECEBIDO`, `TRELLO_LIST_STANDBY`, etc. — veja `.env.example`).

### Passo 4 — Configurar as variáveis de ambiente

Na Vercel (**Settings → Environment Variables**), adicione:

- `TRELLO_API_KEY`, `TRELLO_API_TOKEN`, `TRELLO_API_SECRET`
- `NEXT_PUBLIC_SITE_URL` → `https://SEU-SITE.vercel.app`
- `TRELLO_WEBHOOK_URL` → `https://SEU-SITE.vercel.app/api/trello/webhook`
- `TRELLO_LIST_RECEBIDO`, `TRELLO_LIST_STANDBY`, `TRELLO_LIST_CAD`, `TRELLO_LIST_CAM`, `TRELLO_LIST_FINALIZACAO`, `TRELLO_LIST_ENTREGUE` → os ids do passo 3

Depois de adicionar, faça um novo deploy (Vercel → Deployments → ⋯ → Redeploy) pra essas variáveis passarem a valer.

### Passo 5 — Rodar a migração do banco

No **SQL Editor** do Supabase, rode o conteúdo do arquivo `supabase/migration_status_trello.sql`. Isso atualiza os status dos pedidos já existentes pro novo fluxo e cria a coluna que guarda o id do cartão do Trello de cada pedido.

### Passo 6 — Criar o webhook (pra mover o card no Trello atualizar o dashboard)

Depois do site já publicado com as variáveis acima configuradas, crie o webhook rodando isto no navegador (troque os valores e note que é um POST — use o console do navegador, não a barra de endereço):

```js
fetch("https://api.trello.com/1/webhooks?key=SUA_KEY&token=SEU_TOKEN", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    description: "TATIM Ordens - sync status",
    callbackURL: "https://SEU-SITE.vercel.app/api/trello/webhook",
    idModel: "ID_DO_BOARD",
  }),
}).then((r) => r.json()).then(console.log);
```

Se dar certo, a resposta traz um `id` de webhook criado. A partir daí, mover um cartão de lista no Trello atualiza o status do pedido correspondente no `/dashboard` automaticamente.

## Segurança

O `/dashboard` é protegido por uma senha única (`ADMIN_PASSWORD`), guardada num cookie. É uma proteção simples — suficiente pra manter curiosos de fora, mas não é um sistema de login multiusuário. Se no futuro você quiser dar acesso a mais alguém do laboratório com login próprio, dá pra evoluir depois.

O formulário público (`/novo-pedido`) não exige login de propósito — qualquer dentista com o link consegue enviar um pedido, sem precisar criar conta.
