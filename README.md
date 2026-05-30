# Atividade MongoDB — Relacionamentos e Schema Design

---

## Parte 1 — Modelagem de relacionamentos

### 1.1 — Decisões embed × referência

#### Coleções criadas

- `usuarios`
- `livros`
- `resenhas`
- `estantes`
- `seguidores`

---

#### Documentos de exemplo

**`usuarios`**
```json
{
  "_id": ObjectId("aaa000000000000000000001"),
  "nome": "Ana Lima",
  "email": "ana@email.com",
  "bio": "Apaixonada por ficção científica e fantasia.",
  "foto_url": "https://cdn.exemplo.com/fotos/ana.jpg",
  "configuracoes": {
    "notificacoes_email": true,
    "perfil_publico": true,
    "tema": "escuro"
  },
  "criado_em": ISODate("2024-01-10T00:00:00Z")
}
```

**`livros`**
```json
{
  "_id": ObjectId("bbb000000000000000000001"),
  "titulo": "Fundação",
  "autores_ids": [ObjectId("ccc000000000000000000001")],
  "editora_id": ObjectId("ddd000000000000000000001"),
  "ano": 1951,
  "generos": ["Ficção Científica", "Aventura"],
  "isbn": "978-0553293357",
  "sinopse": "A saga da queda e reconstrução do Império Galáctico.",
  "nota_media": 4.7,
  "total_resenhas": 1284,
  "resenhas_recentes": [
    {
      "resenha_id": ObjectId("eee000000000000000000001"),
      "usuario_nome": "Ana Lima",
      "nota": 5,
      "texto": "Obra-prima absoluta.",
      "data": ISODate("2025-05-01T00:00:00Z")
    }
  ]
}
```

**`resenhas`**
```json
{
  "_id": ObjectId("eee000000000000000000001"),
  "livro_id": ObjectId("bbb000000000000000000001"),
  "livro_titulo": "Fundação",
  "usuario_id": ObjectId("aaa000000000000000000001"),
  "usuario_nome": "Ana Lima",
  "nota": 5,
  "texto": "Obra-prima absoluta. Asimov construiu um universo inteiro com precisão científica e narrativa envolvente.",
  "curtidas": 42,
  "data": ISODate("2025-05-01T00:00:00Z"),
  "comentarios": [
    {
      "usuario_id": ObjectId("aaa000000000000000000002"),
      "usuario_nome": "Bruno Costa",
      "texto": "Concordo totalmente!",
      "data": ISODate("2025-05-02T00:00:00Z")
    }
  ]
}
```

**`estantes`**
```json
{
  "_id": ObjectId("fff000000000000000000001"),
  "usuario_id": ObjectId("aaa000000000000000000001"),
  "livro_id": ObjectId("bbb000000000000000000001"),
  "status": "lido",
  "adicionado_em": ISODate("2025-03-15T00:00:00Z"),
  "terminado_em": ISODate("2025-04-20T00:00:00Z")
}
```

**`seguidores`**
```json
{
  "_id": ObjectId("ggg000000000000000000001"),
  "follower_id": ObjectId("aaa000000000000000000002"),
  "followed_id": ObjectId("aaa000000000000000000001"),
  "criado_em": ISODate("2025-01-20T00:00:00Z")
}
```

---

#### Decisões por relacionamento

**(a) Usuário ↔ foto/perfil/configurações — 1:1 → EMBED**

Foto, bio e configurações são sempre lidos junto com o usuário (ex.: cabeçalho do perfil), então buscá-los em documento separado adicionaria uma viagem extra ao banco sem nenhum benefício. O relacionamento é 1:1 e os dados são relativamente estáticos — configurações mudam esporadicamente —, eliminando o risco de crescimento que tornaria o documento volumoso. O conjunto de campos é pequeno e bem longe do limite de 16 MB do BSON.

**(b) Resenha ↔ comentários — 1:poucos a 1:muitos → EMBED (com cap)**

Comentários são invariavelmente exibidos junto com a resenha: usuário que abre uma resenha espera ver os comentários imediatamente, sem segundo round-trip. Na imensa maioria dos casos a cardinalidade é baixa (5–50 comentários); embarcar esse array não cresce o documento de forma preocupante. Caso uma resenha ultrapasse ~50 comentários (raro), o padrão **Outlier** pode ser aplicado: embarca-se os N mais recentes e o excesso vai para uma coleção `comentarios_overflow`.

**(c) Livro ↔ resenhas — 1:muitos (pode explodir) → REFERÊNCIA**

Um best-seller pode ter centenas de milhares de resenhas; embarcar todas dentro do documento do livro violaria o limite de 16 MB em pouco tempo. Resenhas são escritas por usuários diferentes e de forma independente — atualizar um array embarcado geraria lock no documento inteiro a cada nova resenha. Por isso, resenhas ficam em coleção própria (`resenhas`) com campo `livro_id`; o livro mantém apenas um subconjunto das mais recentes (Subset Pattern, ver 3.2) e contadores computados (ver 3.3).

**(d) Usuário ↔ livros nas estantes — N:N → COLEÇÃO DE LIGAÇÃO (`estantes`)**

Um usuário pode ter centenas ou milhares de livros nas estantes, e um livro pode estar na estante de milhões de usuários — guardar arrays em ambos os lados criaria documentos volumosos e problemas de sincronização. A coleção de ligação carrega metadado próprio (`status`, `adicionado_em`, `terminado_em`) que não pertence nem ao usuário nem ao livro. Índices em `usuario_id` e `livro_id` permitem consultar "todos os livros de um usuário" e "todos os usuários que têm este livro" com igual eficiência.

**(e) Usuário ↔ usuários (seguir) — N:N → COLEÇÃO DE LIGAÇÃO (`seguidores`)**

Guardar arrays de IDs dentro do documento do usuário funciona enquanto a cardinalidade é baixa, mas quebra com outliers (celebridades com milhões de seguidores ultrapassariam o limite BSON). A coleção de ligação com campos `(follower_id, followed_id)` resolve o problema de escala: índice em `follower_id` responde "quem eu sigo"; índice em `followed_id` responde "quem me segue". Não há custo de sincronização de dois arrays, pois cada aresta existe em apenas um documento.

---

### 1.2 — Cardinalidade que muda a decisão (Livro ↔ Resenhas)

**Livro comum (dezenas de resenhas)**

Com poucas dezenas de resenhas, é tecnicamente viável embarcar o array diretamente no documento do livro. O tamanho total permanece bem abaixo de 16 MB e a leitura da página do livro retorna tudo em um único documento. Contudo, mesmo neste caso, updates concorrentes de usuários distintos geram contenção no documento — por isso a referência já é preferível desde o início.

**Best-seller (centenas de milhares de resenhas)**

Um array de centenas de milhares de resenhas explodiria o documento em megabytes, ultrapassando o limite BSON e tornando a leitura do livro extremamente cara (trafegar todos os dados da rede só para exibir o título e a capa). Além disso, cada nova resenha forçaria a reescrita de um documento gigante.

**Padrão que resolve:** **Subset Pattern** (ver Parte 3.2). O documento `livro` embarca apenas as 3–5 resenhas mais recentes (o subconjunto relevante para a landing page) e um contador `total_resenhas`. A tela "ver todas as resenhas" faz uma busca paginada na coleção `resenhas` filtrada por `livro_id`, sem tocar no documento do livro.

---

### 1.3 — N:N: de que lado guardar a referência? (Seguir)

A melhor decisão é usar uma **coleção de ligação** `seguidores` com documentos `{ follower_id, followed_id, criado_em }`.

Guardar um array de IDs dentro do documento do usuário (seja no lado "quem segue" ou "quem é seguido") funciona para cardinalidades pequenas, mas falha com outliers: um usuário com 10 milhões de seguidores teria um array de ObjectIds de ~120 MB, muito além do limite BSON de 16 MB. Guardar em ambos os lados exigiria duas escritas atômicas por ação de seguir/deixar de seguir, introduzindo risco de inconsistência se uma das escritas falhar. A coleção de ligação elimina esses problemas: cada aresta é um único documento pequeno; um índice em `follower_id` responde "quem eu sigo" em O(log n); um índice em `followed_id` responde "quem me segue" com a mesma eficiência; e a operação de seguir/deixar de seguir é uma única escrita atômica.

---

## Parte 2 — `$lookup` e agregação

Os scripts estão na pasta `scripts/`:

- **`02-enriquecer-dataset.js`** — insere 4 livros na coleção `livro` referenciando editoras e autores existentes pelo `_id`.
- **`03-lookup-editora.js`** — lista todos os livros com nome e cidade da editora.
- **`04-lookup-autores.js`** — lista todos os livros com o array de nomes dos autores.

Para executar:
```bash
docker exec -i aula08-mongo mongosh livraria < scripts/02-enriquecer-dataset.js
docker exec -i aula08-mongo mongosh livraria < scripts/03-lookup-editora.js
docker exec -i aula08-mongo mongosh livraria < scripts/04-lookup-autores.js
```

---

## Parte 3 — Schema Design Patterns

### 3.1 — Extended Reference

**Campos duplicados na resenha:** `livro_titulo` e `usuario_nome`.

```json
{
  "_id": ObjectId("eee000000000000000000001"),
  "livro_id": ObjectId("bbb000000000000000000001"),
  "livro_titulo": "Fundação",
  "usuario_id": ObjectId("aaa000000000000000000001"),
  "usuario_nome": "Ana Lima",
  "nota": 5,
  "texto": "Obra-prima absoluta.",
  "curtidas": 42,
  "data": ISODate("2025-05-01T00:00:00Z")
}
```

**Justificativa:** O título do livro é imutável na prática (livros não mudam de título após publicação) e o nome de exibição do usuário muda raramente. Duplicar esses dois campos elimina dois `$lookup` na leitura do feed de resenhas — a operação mais frequente da aplicação. O campo **não duplicado** é `usuario.foto_url`: fotos de perfil são atualizadas com frequência moderada e, se duplicadas em cada resenha do usuário, exigiriam um update em potencialmente milhares de documentos a cada troca de foto — custo desproporcional ao ganho.

---

### 3.2 — Subset Pattern

**Documento `livros` com subconjunto de resenhas:**

```json
{
  "_id": ObjectId("bbb000000000000000000001"),
  "titulo": "Fundação",
  "autores_ids": [ObjectId("ccc000000000000000000001")],
  "editora_id": ObjectId("ddd000000000000000000001"),
  "ano": 1951,
  "generos": ["Ficção Científica"],
  "isbn": "978-0553293357",
  "sinopse": "A saga da queda e reconstrução do Império Galáctico.",
  "nota_media": 4.7,
  "total_resenhas": 1284,
  "resenhas_recentes": [
    {
      "resenha_id": ObjectId("eee000000000000000000001"),
      "usuario_nome": "Ana Lima",
      "nota": 5,
      "texto": "Obra-prima absoluta.",
      "data": ISODate("2025-05-01T00:00:00Z")
    },
    {
      "resenha_id": ObjectId("eee000000000000000000002"),
      "usuario_nome": "Bruno Costa",
      "nota": 4,
      "texto": "Leitura densa mas recompensadora.",
      "data": ISODate("2025-04-28T00:00:00Z")
    },
    {
      "resenha_id": ObjectId("eee000000000000000000003"),
      "usuario_nome": "Clara Dias",
      "nota": 5,
      "texto": "Referência obrigatória do gênero.",
      "data": ISODate("2025-04-25T00:00:00Z")
    }
  ]
}
```

**Como funciona a tela "ver todas as resenhas":** A landing page do livro exibe as 3 resenhas embarcadas sem nenhum acesso adicional ao banco. Quando o usuário clica em "ver todas as resenhas", a aplicação faz uma busca paginada na coleção `resenhas` com o filtro `{ livro_id: <id> }` e ordenação por data decrescente, buscando apenas os dados necessários para aquela página.

---

### 3.3 — Computed Pattern

**Documento `livros` com campos computados:**

```json
{
  "_id": ObjectId("bbb000000000000000000001"),
  "titulo": "Fundação",
  "nota_media": 4.7,
  "total_resenhas": 1284
}
```

**`updateOne` executado a cada nova resenha (ex.: nota = 5):**

```js
// Ao inserir nova resenha com nota `novaNota`:
const novaNota = 5;

// 1. Insere a resenha
db.resenhas.insertOne({
  livro_id: ObjectId("bbb000000000000000000001"),
  livro_titulo: "Fundação",
  usuario_id: ObjectId("aaa000000000000000000001"),
  usuario_nome: "Ana Lima",
  nota: novaNota,
  texto: "Obra-prima absoluta.",
  curtidas: 0,
  data: new Date()
});

// 2. Atualiza os campos computados no livro
// nota_media é recalculada: (media_atual * total + nova_nota) / (total + 1)
// Para evitar divisão, mantemos soma_notas separada ou usamos $inc + recalculo periódico.
// Abordagem simplificada com soma acumulada:
db.livros.updateOne(
  { _id: ObjectId("bbb000000000000000000001") },
  {
    $inc: {
      total_resenhas: 1,
      soma_notas: novaNota        // campo auxiliar para recalcular a média
    },
    $set: {
      // nota_media = (soma_notas_anterior + nova_nota) / (total_resenhas_anterior + 1)
      // Em produção isso seria calculado na camada de aplicação antes do $set
      nota_media: 4.7             // valor atualizado pela aplicação
    }
  }
);
```

**Justificativa:** A nota média e o total de resenhas são lidos em toda listagem de livros (home, busca, recomendações) — recalcular via `aggregate` a cada requisição seria custoso. Pagar o custo extra na escrita (uma operação rara comparada à leitura) mantém as leituras rápidas e sem agregação. O campo `soma_notas` permite recalcular a média exata a qualquer momento sem precisar somar todas as resenhas.

---

### 3.4 — Outlier Pattern

**Problema escolhido:** usuário com milhões de seguidores.

Na coleção de ligação `seguidores`, um usuário muito popular geraria milhões de documentos com `followed_id` apontando para ele — o que é perfeitamente suportado pela coleção de ligação. Porém, se a aplicação precisar **cache rápido** de seguidores (ex.: verificar "este usuário me segue?" sem query), a abordagem de array no documento do usuário reaparece como tentação. O Outlier Pattern resolve mantendo um array de `seguidores_ids` no documento do usuário para os **primeiros N seguidores** (ex.: 1000), e, quando esse array fica cheio, setando um flag `has_overflow_followers: true` e criando documentos extras em `seguidores_overflow`:

```json
// Documento do usuário popular
{
  "_id": ObjectId("aaa000000000000000000001"),
  "nome": "Ana Lima",
  "seguidores_ids": ["...primeiros 1000 IDs..."],
  "has_overflow_followers": true,
  "total_seguidores": 2847392
}

// Documentos de overflow
{
  "_id": ObjectId("hhh000000000000000000001"),
  "followed_id": ObjectId("aaa000000000000000000001"),
  "seguidores_ids": ["...próximos 1000 IDs..."],
  "pagina": 2
}
```

**Justificativa:** Para 99,9% dos usuários, o array no documento principal basta e elimina qualquer join. Para os outliers (celebridades, autores famosos), o flag `has_overflow_followers` avisa a aplicação que ela precisa consultar os documentos de overflow — tratando o caso excepcional com código especial sem penalizar o caso comum. Isso evita que o schema inteiro seja dimensionado para o pior caso.
