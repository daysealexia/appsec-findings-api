# AppSec Findings API

API backend (TypeScript + Node.js + Express) que sincroniza vulnerabilidades (SAST/SCA) de um fornecedor externo, aplica regras de classificação de prioridade (P1–P5), persiste em PostgreSQL e expõe endpoints de consulta e métricas.

Projeto desenvolvido como case técnico de processo seletivo. Escopo 100% backend — sem frontend.

## Índice

- [Problema e objetivo](#problema-e-objetivo)
- [Stack e por que cada peça foi escolhida](#stack-e-por-que-cada-peça-foi-escolhida)
- [Arquitetura](#arquitetura)
- [Regras de classificação](#regras-de-classificação)
- [Setup e execução local](#setup-e-execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Endpoints](#endpoints)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Premissas assumidas](#premissas-assumidas)
- [Decisões técnicas e trade-offs](#decisões-técnicas-e-trade-offs)
- [Limitações conhecidas e melhorias futuras](#limitações-conhecidas-e-melhorias-futuras)

---

## Problema e objetivo

Uma plataforma de AppSec recebe vulnerabilidades de diferentes ferramentas de segurança (SAST, SCA). Este serviço:

1. Consome **todos** os findings de uma API externa paginada (~20.000 registros, fornecedor mock).
2. Calcula a **classificação de prioridade** (P1–P5) de cada finding, segundo regras de negócio específicas por tipo.
3. Persiste tudo em PostgreSQL de forma **idempotente** (rodar a sincronização várias vezes não duplica dados).
4. Expõe endpoints REST para consulta, filtros e métricas agregadas.

### ⚠️ Dependência obrigatória: API externa do fornecedor

`POST /sync` **depende inteiramente** de uma API externa fornecida pelo case (não faz parte deste repositório):

- **Onde conseguir/executar**: [github.com/andrejr971/interview-test](https://github.com/andrejr971/interview-test) — clone, `npm install`, `npm run dev` (instruções completas no README daquele repositório, requer Node 22+).
- **Endereço esperado por esta aplicação**: `http://localhost:3000`, configurável via `VENDOR_API_BASE_URL`.
- **Autenticação**: header `Authorization: Bearer <uuid>` — qualquer UUID válido é aceito pela mock. Configurado aqui via `VENDOR_API_TOKEN`.
- **Se ela não estiver rodando**: `POST /sync` responde `502` com `code: "UPSTREAM_UNAVAILABLE"` e um campo `progress` mostrando o que já tinha sido persistido antes da falha (a sincronização é idempotente — rodar de novo depois completa o restante). Os outros endpoints (`GET /issues`, `GET /issues/{id}`, `GET /metrics`) funcionam normalmente mesmo sem ela, desde que já exista dado sincronizado no banco.

O contrato dessa API (paginação, autenticação, formato dos findings) não foi alterado por este projeto — é consumido como está.

## Stack e por que cada peça foi escolhida

| Peça | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript | O case permite TypeScript **ou** Python, com framework/ORM/arquitetura livres — decisão técnica, não exigência única |
| Runtime | Node.js 22 | Decisão técnica (não especificado pelo case) — mesma versão mínima exigida pela API mock do fornecedor |
| Framework HTTP | Express 5 | Decisão técnica (case deixa o framework livre). Express 5, não 4, porque propaga rejeições de Promise em rotas `async` nativamente pro error handler — evita uma classe inteira de bug clássica do Express 4 (erro engolido silenciosamente) |
| Banco de dados | PostgreSQL 17 | Preferência explícita do case (não obrigatória, mas seguida). `ON CONFLICT DO UPDATE` nativo é a base da estratégia de idempotência |
| ORM | Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) | Migrations versionadas, type-safety ponta a ponta. **Exceção deliberada**: o upsert em lote do `/sync` usa SQL bruto parametrizado (`$queryRaw` + `Prisma.sql`) porque o Prisma não tem upsert em massa nativo com `ON CONFLICT` — ver [Decisões técnicas](#decisões-técnicas-e-trade-offs) |
| Validação | Zod | Deriva tipos TypeScript automaticamente do schema de validação (sem duplicar "shape" + "tipo"); usado tanto pra input HTTP (query/params) quanto pra validar o payload do fornecedor externo |
| Logs | Pino + pino-http | Logs estruturados em JSON, com id de correlação por requisição; mais rápido que alternativas como Winston |
| Segurança | Helmet + express-rate-limit | Headers HTTP padrão de segurança; rate limit só no `/sync` (endpoint mais caro) |
| Documentação | swagger-ui-express + OpenAPI 3.0 escrito à mão | Com só 4 endpoints, geração automática (zod-to-openapi) seria complexidade desproporcional |
| Testes | Vitest + Supertest | Mais rápido que Jest em ESM/TS (usa esbuild), sem configuração extra |
| Containerização | Docker + Docker Compose | Recomendado pelo case |

## Arquitetura

Camadas em **arquitetura pragmática por responsabilidade** (não Clean/Hexagonal/DDD — o domínio é pequeno demais pra justificar isso: uma entidade só, uma função de classificação):

```
Request → routes → validate (Zod) → controller → service → repository → Postgres
                                          ↓
                                     domain (classify, puro)
```

- **routes/** — mapeiam verbo HTTP + path pro controller, aplicam middlewares específicos (ex: rate limit no `/sync`).
- **validators/** — schemas Zod pra query/params.
- **controllers/** — finos: extraem dado validado, chamam o service, formatam a resposta HTTP. Nunca têm regra de negócio.
- **services/** — orquestração e regra de negócio (ex: `sync.service.ts` decide como paginar/paralelizar, `issues.service.ts` decide o shape público da resposta).
- **domain/** — `classification.ts`, função pura sem I/O. É a única lógica de negócio "de verdade" do projeto.
- **repositories/** — único lugar que fala Prisma/SQL. `findings.repository.ts` concentra tudo que toca o banco.
- **clients/** — `vendorClient.ts`, HTTP client pro fornecedor externo (retry, timeout, validação de schema).
- **errors/** + **middleware/errorHandler.ts** — hierarquia `AppError` e middleware central; nenhuma camada abaixo do controller toca `req`/`res` diretamente.

Nenhuma camada de serviço/domínio/repositório conhece Express — só controllers e middlewares importam `req`/`res`.

## Regras de classificação

Calculadas durante a sincronização e persistidas (não recalculadas a cada leitura).

**SCA**: só pelo `score`.

**SAST**: score → classificação inicial → se a categoria estiver entre as 9 categorias prioritárias (SQL Injection, Command Injection, RCE, SSRF, Authentication Bypass, Deserialization, Hardcoded Secret, Hardcoded Password, Path Traversal), promove 1 nível. Nunca ultrapassa P1.

| Score | Classificação inicial |
|---|---|
| 700–1000 | P1 |
| 400–699 | P2 |
| 300–399 | P3 |
| 200–299 | P4 |
| 0–199 | P5 |

Implementação e todos os casos de teste em [`src/domain/classification.ts`](src/domain/classification.ts) / [`src/domain/classification.test.ts`](src/domain/classification.test.ts).

## Setup e execução local

**Pré-requisitos**: Node.js 22+, Docker + Docker Compose, e a [API mock do fornecedor](https://github.com/andrejr971/interview-test) rodando em `http://localhost:3000`.

```bash
# 1. Instalar dependências
npm install

# 2. Subir o Postgres
docker compose up -d postgres

# 3. Copiar o exemplo de variáveis de ambiente
cp .env.example .env
# (os valores default já funcionam com o docker-compose.yml deste projeto)

# 4. Rodar as migrations
npm run db:migrate

# 5a. Rodar em modo desenvolvimento (host, hot-reload)
npm run dev

# 5b. OU rodar tudo containerizado (alternativa ao passo 5a)
docker compose up -d --build app
```

A API sobe em `http://localhost:3333`. Com a mock API do fornecedor rodando em `http://localhost:3000`, dispare a primeira sincronização:

```bash
curl -X POST http://localhost:3333/sync
```

Documentação interativa: `http://localhost:3333/docs` (Swagger UI) ou `http://localhost:3333/openapi.json` (spec crua).

**Rodando via Docker Compose**: o serviço `app` conecta no Postgres pelo nome do serviço (`postgres:5432`) via rede interna do Compose, e alcança a API mock do fornecedor (que roda no host, fora do Compose) via `host.docker.internal:3000`.

## Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `DATABASE_URL` | Sim | — | Connection string do PostgreSQL |
| `VENDOR_API_BASE_URL` | Não | `http://localhost:3000` | Base URL da API do fornecedor |
| `VENDOR_API_TOKEN` | Sim | — | Qualquer UUID válido (a mock aceita qualquer um) |
| `PORT` | Não | `3333` | Porta desta API (3000 já é ocupada pela mock) |
| `NODE_ENV` | Não | `development` | `development` \| `production` \| `test` |
| `LOG_LEVEL` | Não | `info` | `trace`\|`debug`\|`info`\|`warn`\|`error`\|`silent` |

Validadas com Zod na inicialização (`src/config/env.ts`) — a aplicação falha rápido e com mensagem clara se algo estiver faltando, em vez de quebrar depois na primeira query.

## Endpoints

Contratos completos e exemplos interativos em `/docs`. Resumo:

### `POST /sync`
Sincroniza todos os findings do fornecedor (paginação completa, upsert idempotente). Síncrono — a resposta só volta quando termina.

```json
{
  "status": "completed",
  "startedAt": "2026-08-17T22:00:00.000Z",
  "finishedAt": "2026-08-17T22:00:01.000Z",
  "durationMs": 1000,
  "pagesFetched": 200,
  "recordsFetched": 20000,
  "recordsCreated": 20000,
  "recordsUpdated": 0,
  "recordsSkipped": 0
}
```
Rate limit: 3 requisições/minuto. `502` se o fornecedor cair (resposta inclui `progress` com o que já foi persistido).

### `GET /issues`
Paginação (`page`, `limit` — máx. 100) + filtros: `repository`, `type` (`SAST`\|`SCA`), `status` (`OPEN`\|`FIXED`\|`IGNORED`), `classification` (`P1`–`P5`).

```
GET /issues?type=SAST&classification=P1&limit=20
```

### `GET /issues/{id}`
`id` = identificador do fornecedor (ex: `ISS-000001`), não um id interno. `404` se não existir.

### `GET /metrics`
```json
{
  "total": 20000,
  "open": 6669,
  "fixed": 6609,
  "ignored": 6722,
  "classification": { "P1": 8023, "P2": 4568, "P3": 2030, "P4": 2760, "P5": 2619 }
}
```

### `GET /health`
Sem autenticação, usado para checagem de disponibilidade.

## Testes

```bash
npm test           # unitários + integração
npm run typecheck  # tsc --noEmit (src + tests)
```

- **Unitários** (`src/domain/classification.test.ts`): a função de classificação isolada — todos os exemplos da tabela do case, casos de borda de score, teto em P1, categoria case-insensitive.
- **Integração** (`tests/integration/*.test.ts`, Supertest contra `createApp()` sem abrir porta real): sincronização completa + idempotência em escala real (20k registros), filtros de listagem, 404, consistência das métricas.

Os testes de integração usam um banco isolado (`appsec_test`) pra não misturar com os dados de desenvolvimento:

```bash
# uma vez, antes de rodar os testes de integração pela primeira vez
docker compose exec postgres psql -U appsec -d appsec -c "CREATE DATABASE appsec_test;"
DATABASE_URL="postgresql://appsec:appsec@localhost:5432/appsec_test?schema=public" npx prisma migrate deploy
```

`.env.test` já aponta pra esse banco; `tests/setup.ts` carrega essas variáveis antes da suíte rodar.

## Estrutura do projeto

```
src/
  clients/        # HTTP client do fornecedor externo (retry, timeout, validação Zod)
  config/         # variáveis de ambiente (Zod)
  controllers/    # camada fina: request → service → response
  db/             # cliente Prisma (singleton, driver adapter pg)
  domain/         # regra de classificação — função pura, sem I/O
  errors/         # hierarquia AppError
  middleware/     # error handler, validação, request id, rate limit
  repositories/   # único lugar que fala Prisma/SQL
  routes/         # definição das rotas Express
  services/       # orquestração e regras de negócio
  validators/      # schemas Zod de query/params
  app.ts          # monta o Express app (sem listen)
  server.ts       # entrypoint: conecta, sobe, graceful shutdown
  openapi.json    # spec OpenAPI 3.0

tests/
  integration/    # Supertest + banco de teste real
  helpers/        # reset de banco entre suítes

prisma/
  schema.prisma
  migrations/
```

## Premissas assumidas

O case pede pra documentar aqui qualquer premissa adotada diante de ambiguidade:

1. **Sem autenticação própria nesta API** — o Bearer token do case é só da API do fornecedor (que consumimos), não há exigência de autenticação para os 4 endpoints que expomos.
2. **`/sync` é upsert, não só insert-se-não-existir** — se um finding já sincronizado mudar no fornecedor (ex: `status`), a releitura atualiza o registro. "Evitar duplicados" foi interpretado como sincronização real, não só proteção contra re-inserção.
3. **Corpo de resposta do `POST /sync`** não estava especificado no case — definido com contadores agregados (buscados/criados/atualizados/descartados) e timestamps, suficiente pra confirmar visualmente que a ingestão dos ~20k registros funcionou.
4. **Campo `id` público = `external_id` do fornecedor** (ex: `ISS-000001`), não um id interno sequencial — é a identidade natural e estável do finding.
5. **Filtros de `GET /issues` aceitam um valor por parâmetro** (não uma lista/CSV) — não especificado no case, mantido simples.
6. **Score fora de 0–1000** (caso o fornecedor um dia mande algo assim) é tratado defensivamente com faixas abertas nas pontas, não rejeitado.
7. **Matching de categoria prioritária é case-insensitive e ignora espaços nas pontas** — robustez extra sem custo, não uma exigência do case.

## Decisões técnicas e trade-offs

- **SQL bruto só no upsert em lote**: o Prisma não tem upsert em massa com `ON CONFLICT` nativo — usar `.upsert()` em loop custaria 1 round-trip por registro (inviável pra 20k linhas). A alternativa (`$queryRaw` + `Prisma.sql`, que parametriza automaticamente) fica isolada em `findings.repository.ts`; todo o resto do projeto usa o Prisma Client normal.
- **Contagem criado/atualizado via `RETURNING (xmax = 0) AS inserted`**: idioma conhecido do Postgres — `xmax` é a coluna de sistema que marca a transação que invalidou a linha por `UPDATE`; numa linha recém-inserida ela é `0`. Permite distinguir insert de update dentro do mesmo `INSERT ... ON CONFLICT`.
- **Sincronização com concorrência limitada (5 requisições simultâneas ao fornecedor)**: baseline sequencial levava ~8-12s; com o pool de workers caiu para <1s. Sem rate limit documentado pelo fornecedor, 5 é um valor conservador, não medido cientificamente — ponto de ajuste caso o volume real mude.
- **Migrations não rodam automaticamente no boot do container**: rodar `prisma migrate deploy` a cada start é arriscado em produção (várias réplicas competindo). Documentado como passo explícito e separado.
- **`Object.assign(req.query, ...)` não funciona no Express 5**: `req.query` é um getter que reparseia a query string bruta a cada acesso, sem cache — dado validado pelo Zod vai para `res.locals`, não sobrescreve `req.query`/`req.params`.
- **Não normalizamos `repository`/`author`/etc. em tabelas próprias**: nada no case exige integridade referencial aí; são atributos de texto de uma única entidade (`Finding`), não conceitos de domínio separados.

## Limitações conhecidas e melhorias futuras

- Sem autenticação/autorização própria (ver [Premissas](#premissas-assumidas)) — em produção, API key ou mTLS de serviço-a-serviço.
- Sem lock distribuído contra chamadas concorrentes de `/sync` — o upsert é seguro sob concorrência (constraint única), mas duas sincronizações simultâneas fazem trabalho redundante.
- Paginação offset-based em `GET /issues` — adequada para o volume atual (20k linhas); degradaria em páginas muito profundas com volume ordens de grandeza maior (cursor-based seria o próximo passo).
- Vulnerabilidade conhecida e documentada, não corrigida: `deepmerge-ts` (dependência transitiva de `@prisma/config`, usada só pela CLI do Prisma em tempo de desenvolvimento) tem um advisory de exaustão de pilha. O fix automático rebaixaria o Prisma para uma versão anterior — não aplicado porque não há input externo não confiável passando por essa CLI localmente.
- Sem CI configurado (rodar `npm test`/`npm run typecheck` a cada push seria o próximo passo natural).
- Least-privilege do usuário do Postgres não implementado no `docker-compose.yml` local (sobe com usuário de desenvolvimento) — em produção, um usuário com permissão só de `SELECT/INSERT/UPDATE` na tabela `findings`.
