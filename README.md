# MongoDB — Relacionamentos e Schema Design

> Respostas teóricas (Parte 1) e referência de execução dos scripts práticos (Partes 2 e 3).

---

## Como executar

```bash
# 1. Subir o MongoDB (a partir da pasta da aula, que traz o docker-compose)
cd mpti-bd-2026.1/aula-08-mongodb-relacionamentos
docker compose --profile doc up -d
cd -   # volta para a raiz do repositório (onde estão os scripts da atividade)

# 2. Rodar os scripts da atividade, na ordem, a partir da raiz do repositório
docker exec -i aula08-mongo mongosh < scripts/01-seed-livraria.js   # dataset base "livraria"
docker exec -i aula08-mongo mongosh < scripts/02-enriquecer-dataset.js
docker exec -i aula08-mongo mongosh < scripts/03-lookup-editora.js
docker exec -i aula08-mongo mongosh < scripts/04-lookup-autores.js
docker exec -i aula08-mongo mongosh < scripts/05-patterns.js
```

> `scripts/01-seed-livraria.js` recria o dataset base `livraria` (3 editoras, 3
> autores, 3 livros) com os mesmos nomes que os scripts `02`–`04` referenciam.
> É idempotente (limpa as coleções no início), então pode ser reexecutado.

UI para inspeção: http://localhost:8081 (`admin`/`admin`)

---

## Parte 1 — Modelagem de relacionamentos

### 1.1 — Coleções e decisões embed × referência

#### Coleções propostas

| Coleção | Descrição |
|---------|-----------|
| `usuario` | Perfil, configurações e estante embutidos |
| `livro` | Referencia `editora` e `autores` por `_id` |
| `resenha` | Coleção separada; referencia `livro` e `usuario` |
| `segue` | Coleção de ligação para o grafo de seguidores |

> Não há coleção separada para `comentario` nem para `estante` — ambos ficam embutidos nos seus documentos pai (justificativas abaixo).

---

#### Documento de exemplo — `usuario`

```json
{
  "_id": ObjectId("664a0001000000000000aa01"),
  "nome": "Ana Lima",
  "email": "ana@email.com",
  "bio": "Apaixonada por literatura brasileira.",
  "foto_url": "https://cdn.example.com/fotos/ana.jpg",
  "configuracoes": {
    "notificacoes": true,
    "privacidade": "publico",
    "tema": "escuro"
  },
  "data_cadastro": "2024-01-15T10:00:00Z",
  "estante": [
    { "livro_id": ObjectId("..."), "status": "lido",      "data": "2024-03-01" },
    { "livro_id": ObjectId("..."), "status": "lendo",     "data": "2024-05-10" },
    { "livro_id": ObjectId("..."), "status": "quero ler", "data": "2024-05-20" }
  ]
}
```

---

#### Documento de exemplo — `livro`

```json
{
  "_id": ObjectId("664a0002000000000000bb01"),
  "title": "O Cortiço",
  "editora": ObjectId("664a0003000000000000cc01"),
  "autores": [ObjectId("664a0004000000000000dd01")],
  "ano": 1890,
  "generos": ["romance", "naturalismo"],
  "isbn": "978-85-359-0277-4",
  "sinopse": "Retrato da sociedade carioca do século XIX."
}
```

---

#### Documento de exemplo — `resenha`

```json
{
  "_id": ObjectId("664a0005000000000000ee01"),
  "livro_id": ObjectId("664a0002000000000000bb01"),
  "usuario_id": ObjectId("664a0001000000000000aa01"),
  "nota": 5,
  "texto": "Obra-prima da literatura brasileira!",
  "data": "2024-04-10T14:30:00Z",
  "curtidas": 42,
  "comentarios": [
    {
      "usuario_id": ObjectId("664a0001000000000000aa02"),
      "texto": "Concordo plenamente!",
      "data": "2024-04-11T09:00:00Z"
    }
  ]
}
```

---

#### Documento de exemplo — `segue` (coleção de ligação)

```json
{
  "_id": ObjectId("664a0006000000000000ff01"),
  "seguidor_id": ObjectId("664a0001000000000000aa01"),
  "seguido_id":  ObjectId("664a0001000000000000aa02"),
  "data": "2024-02-20T08:00:00Z"
}
```

---

#### Justificativas

**(a) Usuário ↔ foto/perfil/configurações — `EMBED`**

Relacionamento 1:1 cujos dados são sempre lidos juntos ao abrir qualquer tela do usuário. Foto, bio e configurações têm tamanho previsível e estável (alguns kB no máximo). Criar uma coleção separada adicionaria um `$lookup` em toda leitura sem nenhum benefício: o dado não é compartilhado com outros documentos nem possui ciclo de vida independente.

**(b) Resenha ↔ comentários — `EMBED` (limitado)**

Comentários fazem sentido apenas no contexto da resenha e são sempre exibidos juntos a ela. A cardinalidade típica é "poucos" (1:3–20); embutir os comentários elimina a necessidade de join e simplifica a leitura. Para resenhas virais com centenas de comentários, aplica-se o Subset Pattern: embutir apenas os N mais recentes e paginar o restante numa coleção separada.

**(c) Livro ↔ resenhas — `REFERÊNCIA` (coleção `resenha`)**

Um best-seller pode acumular centenas de milhares de resenhas. Embutir todas dentro do documento `livro` estouraria rapidamente o limite BSON de 16 MB. Além disso, cada resenha possui ciclo de vida próprio — recebe curtidas, comentários e pode ser editada — tornando a atualização de documentos embutidos cara e sujeita a conflitos. A coleção separada permite paginação eficiente e escala linearmente.

**(d) Usuário ↔ livros nas estantes — `EMBED` (dentro de `usuario`)**

A estante é intrinsecamente pessoal e acessada toda vez que o perfil do usuário é carregado. O array de entradas `{ livro_id, status, data }` tem crescimento razoável (centenas de livros no máximo para usuários assíduos), bem abaixo do limite de 16 MB. Embutir evita join e mantém o padrão "carregar o perfil = uma query".

**(e) Usuário ↔ usuários (seguir) — `COLEÇÃO DE LIGAÇÃO` (`segue`)**

Detalhado em 1.3 abaixo.

---

### 1.2 — Cardinalidade que muda a decisão

Para o item (c) — Livro ↔ resenhas:

**Livro comum** (dezenas de resenhas): a tela principal do livro pode embutir as 3 mais recentes diretamente no documento `livro` (campo `resenhas_top`), evitando um `$lookup` no hot path. O restante fica na coleção `resenha`, consultada apenas na tela "ver todas".

**Best-seller** (centenas de milhares de resenhas): embutir qualquer quantidade de resenhas no documento do livro é inviável — o documento cresceria até estourar os 16 MB. Toda leitura de resenhas vem da coleção separada, com paginação.

O padrão que resolve o segundo caso é o **Subset Pattern**: o documento `livro` carrega apenas `resenhas_top` (subconjunto quente) e um contador `resenhas_count`. A tela de listagem principal não precisa de query extra; somente "ver todas" dispara uma segunda query na coleção `resenha`. Dessa forma, o tamanho do documento `livro` é sempre limitado, independente do sucesso do livro.

---

### 1.3 — N:N: de que lado guardar a referência?

A melhor solução é uma **coleção de ligação** `segue { seguidor_id, seguido_id, data }` com índice composto nos dois campos.

- **Outliers**: um usuário com milhões de seguidores não infla o documento de ninguém — cada aresta é um documento pequeno e independente. Guardar um array de IDs dentro do `usuario` seguido chegaria rapidamente a dezenas de MB, estourando o limite BSON.
- **"Quem eu sigo"**: `db.segue.find({ seguidor_id: meuId })` — índice em `seguidor_id` resolve em O(log n).
- **"Quem me segue"**: `db.segue.find({ seguido_id: meuId })` — índice em `seguido_id` resolve em O(log n).
- **Sincronização**: existe apenas um documento por aresta; não há dois arrays para manter coerentes. Uma exclusão de seguimento é um único `deleteOne` na coleção `segue`, sem risco de inconsistência.
- **Metadados**: a coleção de ligação permite armazenar `data` do follow e outros atributos da relação futuramente.

---

## Parte 2 — `$lookup` e agregação

Scripts: `scripts/01-seed-livraria.js` (dataset base), `scripts/02-enriquecer-dataset.js`, `scripts/03-lookup-editora.js`, `scripts/04-lookup-autores.js`.

Os scripts são auto-documentados com `print()` e `printjson()`. Os resultados abaixo
foram **obtidos executando os scripts** na ordem `01 → 02 → 03 → 04` (MongoDB 8.0.23,
mongosh 2.8.3) — rode os comandos da seção [Como executar](#como-executar) para reproduzi-los.

> **Dataset base (`01-seed-livraria.js`):** 3 editoras (`Manning` / Shelter Island,
> `Magica` / Joao Pessoa, `O'Reilly` / Sebastopol), 3 autores (`Kyle Banker`,
> `Shannon Bradshaw`, `Kristina Chodorow`) e 3 livros referenciando editora e
> autores por `_id`.

### 2.1 — Enriquecer o dataset (`02-enriquecer-dataset.js`)

Insere **4 novos livros** (`insertMany`), recuperando os `_id` das editoras e
autores existentes por nome (`findOne`) — ou seja, **FK manual** por referência:

- **2+ autores (N:N):** *Padroes de Projeto com MongoDB* → `[Kyle Banker, Shannon Bradshaw]`;
- **2 livros na mesma editora:** *Padroes de Projeto com MongoDB* e *MongoDB: Guia Pratico*, ambos da `Manning`.

O total de livros passa de 3 para **7**, distribuídos por editora:

| Editora | Nº de livros |
|---|---|
| Manning | 3 |
| O'Reilly | 2 |
| Magica | 2 |
| **Total** | **7** |

### 2.2a — `$lookup` básico: livro + editora (`03-lookup-editora.js`)

`$lookup` (livro.editora → editora._id) + `$unwind` (achata o array, pois `$lookup`
sempre retorna array, mesmo em 1:1) + `$project` (só `title`, `editora`, `cidade`).
Resultado esperado — 7 documentos:

| title | editora | cidade |
|---|---|---|
| MongoDB in Action | Manning | Shelter Island |
| MongoDB: The Definitive Guide | O'Reilly | Sebastopol |
| Contos da Paraiba | Magica | Joao Pessoa |
| Padroes de Projeto com MongoDB | Manning | Shelter Island |
| MongoDB: Guia Pratico | Manning | Shelter Island |
| NoSQL Distilled | O'Reilly | Sebastopol |
| Contos do Agreste | Magica | Joao Pessoa |

### 2.2b — `$lookup` N:N: autores de cada livro (`04-lookup-autores.js`)

Como `localField` (`autores`) é um **array de `ObjectId`**, o `$lookup` resolve cada
elemento e devolve um array de autores — sem precisar de `$unwind`. O `$project`
mantém só `title` e `autores_doc.nome`. Resultado esperado — 7 documentos:

| title | autores |
|---|---|
| MongoDB in Action | Kyle Banker |
| MongoDB: The Definitive Guide | Shannon Bradshaw, Kristina Chodorow |
| Contos da Paraiba | *(vazio — `autores: []` no seed)* |
| Padroes de Projeto com MongoDB | Shannon Bradshaw, Kyle Banker |
| MongoDB: Guia Pratico | Kristina Chodorow |
| NoSQL Distilled | Shannon Bradshaw |
| Contos do Agreste | Kyle Banker |

> *Padroes de Projeto com MongoDB* aparece com **2 nomes** (N:N resolvido) e
> *Contos da Paraiba* com lista **vazia** — confirmando o comportamento de
> *left outer join* do `$lookup`.
>
> **Observação:** em *Padroes de Projeto com MongoDB* o array foi inserido como
> `[Kyle Banker, Shannon Bradshaw]`, mas o `$lookup` retornou
> `[Shannon Bradshaw, Kyle Banker]` — o `$lookup` **não preserva a ordem** do array
> `localField` (ordena pelo lado de `from`). Se a ordem importar, ela precisa ser
> reconstruída no pipeline (ex.: `$map` sobre `autores` casando por `_id`).

---

## Parte 3 — Schema Design Patterns

Script: `scripts/05-patterns.js` (banco `rede_leitura`).

> Nos exemplos abaixo, `_id` e as referências (`livro_id`, `usuario_id`,
> `seguidor_id`) usam `ObjectId` — o mesmo tipo da Parte 1. Os valores mostrados
> (ex.: `ObjectId("664a...0001")`) são ilustrativos; o script gera os `ObjectId`
> em tempo de execução e os reutiliza para manter as referências consistentes.

---

### 3.1 — Extended Reference

**Campos duplicados na resenha:** `livro_titulo` e `usuario_nome`.

```json
{
  "_id": ObjectId("664a0005000000000000ee01"),
  "livro_id": ObjectId("664a0002000000000000bb01"),
  "usuario_id": ObjectId("664a0001000000000000aa01"),
  "livro_titulo": "O Cortico",
  "usuario_nome": "Ana Lima",
  "nota": 5,
  "texto": "Obra-prima da literatura brasileira.",
  "data": "2024-04-10",
  "curtidas": 42,
  "comentarios": [
    { "usuario_id": ObjectId("664a0001000000000000aa02"), "texto": "Concordo plenamente!", "data": "2024-04-11" }
  ]
}
```

`livro_titulo` e `usuario_nome` são estáveis o suficiente: títulos de livros não mudam após publicação, e nomes de exibição raramente são alterados — se mudarem, um `updateMany` propaga a correção em batch, custo aceitável para eventos raros. Campo **não duplicado**: `nota_media` do livro muda a cada nova resenha; propagá-la em cada escrita de resenha seria custoso e propenso a inconsistências.

---

### 3.2 — Subset

**Documento `livro` com subconjunto de resenhas:**

```json
{
  "_id": ObjectId("664a0002000000000000bb01"),
  "title": "O Cortico",
  "autores": ["Alencas Jr."],
  "ano": 1890,
  "total_resenhas": 1284,
  "resenhas_top": [
    { "usuario_nome": "Ana Lima",   "nota": 5, "texto": "Obra-prima!",           "data": "2024-04-10" },
    { "usuario_nome": "Carlos Rui", "nota": 4, "texto": "Linguagem densa, vale.","data": "2024-03-20" },
    { "usuario_nome": "Bia Costa",  "nota": 5, "texto": "Li de uma vez so.",     "data": "2024-02-14" }
  ]
}
```

A tela principal do livro carrega as 3 resenhas embutidas em uma única query — sem `$lookup` e sem custo extra, independente do total de resenhas. A tela "ver todas as resenhas" dispara uma segunda query paginada na coleção `resenha` filtrada por `livro_id`, mantendo o documento `livro` sempre abaixo do limite BSON.

---

### 3.3 — Computed

**Documento `livro` com campos computados:**

```json
{
  "_id": ObjectId("664a0002000000000000bb01"),
  "title": "O Cortico",
  "total_resenhas": 1284,
  "soma_notas": 5393,
  "nota_media": 4.2
}
```

**`updateOne` com `$inc` executado a cada nova resenha (ex.: nota = 5):**

```js
const livroId = ObjectId("664a0002000000000000bb01");
const novaNota = 5;

// $inc atualiza os acumuladores atomicamente
db.livro.updateOne(
  { _id: livroId },
  { $inc: { total_resenhas: 1, soma_notas: novaNota } }
);

// nota_media derivada dos acumuladores (sem drift de ponto flutuante)
const doc = db.livro.findOne({ _id: livroId }, { soma_notas: 1, total_resenhas: 1 });
db.livro.updateOne(
  { _id: livroId },
  { $set: { nota_media: Math.round(doc.soma_notas / doc.total_resenhas * 100) / 100 } }
);
```

`nota_media` e `total_resenhas` são lidos em toda listagem de livros — recalcular via `aggregate` seria O(n) por requisição. Com Computed, a leitura é O(1). O `$inc` em `soma_notas` e `total_resenhas` é atômico e, por trabalhar com inteiros, evita acúmulo de erros de ponto flutuante que a fórmula de média incremental `(avg * n + nova) / (n+1)` sofre após milhares de atualizações.

---

### 3.4 — Outlier

**Problema escolhido:** usuário com milhões de seguidores na rede de leitura.

**Usuário comum (caso normal):**

```json
{
  "_id": ObjectId("664a0001000000000000aa01"),
  "nome": "Ana Lima",
  "seguidores": [
    ObjectId("664a0001000000000000aa02"),
    ObjectId("664a0001000000000000aa03")
  ],
  "seguidores_count": 2,
  "has_extras": false
}
```

**Usuário viral (outlier) — os 100 mais recentes embutidos, restante em coleção dedicada:**

```json
{
  "_id": ObjectId("664a0001000000000000aa09"),
  "nome": "Clarice Lispector Fan Page",
  "seguidores": [ ObjectId("...401"), "...", ObjectId("...500") ],
  "seguidores_count": 850000,
  "has_extras": true
}
```

**Documento na coleção `seguidores_extras`:**

```json
{
  "usuario_id": ObjectId("664a0001000000000000aa09"),
  "seguidor_id": ObjectId("664a0001000000000000b001"),
  "data": "2024-01-01"
}
```

O Outlier evita que o caso excepcional (celebridade/autor famoso) force uma arquitetura pesada para todos os usuários: 99,9% dos usuários têm o array `seguidores` embutido e não pagam custo extra. Para os outliers, o flag `has_extras: true` avisa a aplicação para buscar o restante em `seguidores_extras`, tornando o caso excepcional transparente para os demais.
