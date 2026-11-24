# CarDex

Coleção de cartas Pokémon TCG com **valor estimado em reais**. Cada pessoa tem a sua coleção, os seus fatores de cálculo
e o seu histórico (multiusuário desde o início; por enquanto sem cadastro público: o usuário é criado por script).

> **O valor é uma estimativa**, não o preço de venda. Os fatores iniciais de estado e de idioma são chutes razoáveis,
> **não dados do mercado brasileiro**: cada pessoa calibra os seus em *Configurações*.

## Como o valor é calculado

```
valor (R$) = preço base (US$) × câmbio do dia × fator do estado × fator do idioma
```

- **Preço base:** TCGplayer (`marketPrice`, em dólar), vindo da [TCGdex](https://tcgdex.dev). Nunca o `highPrice`
  (cartas comuns aparecem com US$ 4.321). Cartas japonesas **não têm** TCGplayer; para elas, se a opção estiver ligada em
  *Configurações* (padrão), usa-se o Cardmarket (`trend`, em euro) convertido com o câmbio EUR→BRL. Desligada, a carta fica "sem preço".
- **Câmbio:** [AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas) (USD-BRL e EUR-BRL), com cache de 6 h. Se a fonte falhar, usa o último valor e avisa.
- **Fatores iniciais:** estado NM 100% · SP 85% · MP 65% · HP 45% · D 25%; idioma EN 100% · JP 95% · PT 90%.
- **Valor manual:** se você preencher o valor de uma carta, ele vence o estimado (por exemplo, o preço que viu na LigaPokemon).
- **Sem preço:** carta sem preço e sem valor manual **fica fora do total** e é contada ("N sem preço"). Nunca vira R$ 0,00 em silêncio.
- Tudo em inteiros (centavos); câmbio em micro-unidades; fatores em basis points; um único arredondamento (meio para cima).
- **Sem scraping da LigaPokemon:** ela não tem API pública e bloqueia robôs. Não fazemos.

## Funcionalidades

- Buscar por **nome** ou **número** (com coleção opcional), em **português → inglês → japonês** (aparece a que existir).
- Coleção com valor por carta e total, filtros por coleção/raridade/estado; **valor pago** e lucro/prejuízo.
- **CRUD:** adicionar, editar, **tirar da coleção** (vendida/trocada/outro, com valor de venda opcional), **histórico** com
  "voltar para a coleção" e "apagar de vez".
- Preços atualizados **uma vez por dia** (Vercel Cron) e sob demanda pelo botão **Atualizar agora**.
- Tema claro/escuro e layout para celular.

## Rodar localmente

```bash
npm install
cp .env.example .env.local          # preencha SESSION_SECRET (veja abaixo)
npm run db:migrate                  # sem DATABASE_URL usa um banco local em .pglite/
npm run seed:user -- seunome        # cria o usuário (pede a senha, mínimo de 10 caracteres)
npm run dev
```

`SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Verificações: `npm run lint && npm run typecheck && npm test && npm run build`.

## Produção (Vercel + Neon)

1. **Banco:** o CarDex usa o **mesmo projeto Neon** dos outros apps, mas só escreve no schema **`pokedex`**
   (a tabela de migrations é `pokedex.__pokedex_migrations`). Ele não toca em nenhum outro schema.
   - Se preferir um banco separado (recomendado quando o produto for comercializado): no console do Neon, *Create project*
     e use a URL *pooled* dele em `DATABASE_URL`. As migrations criam o schema sozinhas.
2. **Migrations** (antes do deploy): `DATABASE_URL=... npm run db:migrate`.
3. **Usuário:** `DATABASE_URL=... npm run seed:user -- seunome`.
4. **Vercel:** importe o repositório e configure `DATABASE_URL`, `SESSION_SECRET` e `CRON_SECRET` (16+ caracteres aleatórios).
   O `vercel.json` agenda `GET /api/refresh` todo dia às 08:00 UTC; a Vercel envia `Authorization: Bearer <CRON_SECRET>`.
   Sem `CRON_SECRET` o endpoint responde 401 e só o botão *Atualizar agora* funciona.
5. Rode `npm audit` antes de publicar.

## Segurança (resumo)

- Senha com bcrypt; mensagem única de erro (não revela se o usuário existe); limite de tentativas **no banco** (por IP+usuário, por IP e global).
- Sessão iron-session (`HttpOnly`, `Secure` em produção, `SameSite=Lax`, 7 dias). A sessão é relida do banco a cada requisição: conta desativada perde o acesso na hora.
- `requireUser()` em toda página, ação e rota; o `proxy.ts` é só o primeiro redirecionamento.
- **Isolamento entre usuários:** toda consulta e toda escrita da coleção levam `user_id` no `WHERE` (testado: um usuário não lê, edita, remove, restaura nem apaga o item de outro).
- Respostas da TCGdex e da AwesomeAPI passam por **zod**; preços inválidos são descartados; hosts fixos; ids validados por regex; imagens só de `assets.tcgdex.net`.
- Cabeçalhos: CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS em produção.
- `/api/refresh` só aceita Bearer (comparação em tempo constante), nunca cookie.
- Segredos só em variáveis de ambiente; `.env*` ignorados pelo git.

## Limites conhecidos

- A cobertura em português da TCGdex é parcial; quando a carta não existe em PT a busca mostra a versão EN ou JA.
- A TCGdex não tem preço próprio para **1ª edição**: a carta fica "sem preço" até você informar um valor manual.
- Muitas cartas em inglês e japonês vêm sem imagem na TCGdex.
- A CSP usa `'unsafe-inline'` em scripts (o Next precisa para hidratar); o resto é fechado.
- Imagens são do catálogo da TCGdex (uso pessoal). Se o produto for público, reveja os termos de uso das imagens e das APIs.
