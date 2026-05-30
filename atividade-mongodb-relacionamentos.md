# Atividade MongoDB — Relacionamentos e Schema Design

> **Objetivo:** exercitar **modelagem de relacionamentos** no MongoDB
> (embedding × referência), os operadores de junção (`$lookup`)
> e os **Schema Design Patterns**, sempre **justificando pelo padrão de acesso**.
> Cada parte tem critérios objetivos de avaliação.

**Entrega esperada:** repositório Git (ou pasta zipada) contendo:
- `README.md` com respostas das partes teóricas e justificativas
- Scripts `.js` (mongosh) executáveis para as partes práticas

---

## Pré-requisitos

```bash
# Subir o ambiente da aula
Baixar: https://github.com/ifpb/mpti-bd-2026.1/tree/main/aula-08-mongodb-relacionamentos

cd exemplos/aula-08-mongodb-relacionamentos
docker compose --profile doc up -d

# Carregar o dataset base (domínio "livraria")
docker exec -i aula08-mongo mongosh < scripts/01-seed-livraria.js
```

Verifique:
```bash
docker exec aula08-mongo mongosh --quiet --eval \
  'db.getSiblingDB("livraria").livro.countDocuments()'
# Deve retornar 3
```

UI opcional para inspecionar documentos: http://localhost:8081 (`admin`/`admin`). Outra alternativa é usar o MongoDB Compass.

> **Dica:** os scripts `02`…`07` da pasta `scripts/` são referência de sintaxe.
> Você pode copiar trechos, mas as respostas precisam ser **suas** e justificadas.

---

# Parte 1 — Modelagem de relacionamentos

Você vai projetar o backend de uma **rede social de leitura** (estilo Skoob/Goodreads)
com as seguintes entidades:

- **Usuário**: nome, email, bio, foto, data de cadastro
- **Livro**: título, autor(es), editora, ano, gêneros, ISBN, sinopse
- **Resenha**: um usuário avalia um livro (nota 1–5, texto, data, nº de curtidas)
- **Comentário**: comentário de um usuário em uma resenha
- **Estante**: cada usuário organiza livros em listas (`lido`, `lendo`, `quero ler`)
- **Seguir**: um usuário **segue** outro usuário (base para recomendação)

### 1.1 — Decisões embed × referência

Desenhe o schema em **MongoDB**. Para **cada relacionamento abaixo**, decida entre
**embedding** e **referência** e **justifique pela cardinalidade e pelo padrão de
acesso** (não pela "regra decorada"):

| # | Relacionamento | Cardinalidade típica |
|---|---|---|
| (a) | Usuário ↔ foto/perfil/configurações | 1:1 |
| (b) | Resenha ↔ comentários | 1:poucos a 1:muitos |
| (c) | Livro ↔ resenhas | 1:muitos (pode explodir) |
| (d) | Usuário ↔ livros nas estantes | N:N |
| (e) | Usuário ↔ usuários (seguir) | N:N (grafo) |

**Entregue:**
- Lista de **coleções** que você criaria.
- Para **cada coleção**, **1 documento JSON de exemplo** preenchido.
- Para cada item (a)–(e): **decisão (embed/ref) + 2–3 frases de justificativa**,
  considerando tamanho do documento (limite BSON 16 MB), frequência de leitura
  conjunta, frequência de update do dado e crescimento do relacionamento.

> **Critério:** não há "resposta certa". Há **decisões justificadas** ou **arbitrárias**.
> Se embarcar resenhas dentro do livro, explique por que vence tê-las em coleção
> separada — ou vice-versa.

### 1.2 — Cardinalidade que muda a decisão

Para o item (c) (Livro ↔ resenhas): mostre **como sua decisão muda** entre:
- um livro **comum** (dezenas de resenhas), e
- um **best-seller** (centenas de milhares de resenhas).

Cite **qual Schema Design Pattern** resolve o segundo caso e **por quê**.

### 1.3 — N:N: de que lado guardar a referência?

Para o item (e) (seguir), você guardaria o array de IDs no documento de **quem
segue**, de **quem é seguido**, em **ambos**, ou em uma **coleção de ligação**
(`segue`)? Justifique em **4–6 linhas** considerando: usuários com **milhões de
seguidores** (outliers), consultas "quem eu sigo" vs "quem me segue", e o custo
de manter os dois lados sincronizados.

---

# Parte 2 — `$lookup` e agregação

Use o dataset `livraria` carregado pelo `01-seed-livraria.js`. Entregue **cada
item como um script `.js`** (ou trecho documentado no README) **com a query
completa e o resultado obtido**.

### 2.1 — Enriquecer o dataset

Insira **mais 4 livros** na coleção `livro`, referenciando editoras existentes
(`editora`) e autores (`autor`) **pelo `_id`** (FK manual). Pelo menos:
- 1 livro com **2 ou mais autores** (array de referências);
- 2 livros publicados pela **mesma editora**.

### 2.2 — `$lookup` básico

(a) Liste **todos os livros com o nome e a cidade da sua editora**,
    usando `$lookup` + `$unwind` + `$project`. Saída deve ter apenas
    `title`, `editora` (nome) e `cidade`.

(b) Resolva os **autores** de cada livro (relacionamento N:N) com um
    segundo `$lookup` sobre a coleção `autor`. Mostre `title` e a lista de nomes
    dos autores.

---

# Parte 3 — Schema Design Patterns

Escolha o domínio da **rede social de leitura** para aplicar os padrões.
Para cada item, **entregue o documento JSON resultante + 2–3 frases de justificativa**.

### 3.1 — Extended Reference

Mostre como você aplicaria **Extended Reference** para exibir uma **resenha** já
com o **título do livro** e o **nome do usuário**, sem `$lookup` na leitura comum.
Indique **quais campos** você duplicaria e **por que são "estáveis o suficiente"**.
Cite **um campo que você NÃO duplicaria** e por quê.

### 3.2 — Subset

Aplique o **Subset Pattern** ao **livro** de forma a embarcar só as **3 resenhas
mais recentes** + um contador, mantendo o restante numa coleção `resenhas`.
Mostre o documento `livro` e descreva, em **2 frases**, como a tela "ver todas as
resenhas" funciona.

### 3.3 — Computed

Aplique o **Computed Pattern** para manter a **nota média** e o **total de
resenhas** de cada livro **atualizados em tempo de escrita** (em vez de recalcular
com `aggregate` a cada leitura). Mostre o documento e o `updateOne` com `$inc`
que você rodaria a cada nova resenha.

### 3.4 — Escolha livre: Bucket, Outlier ou Versioning

Escolha **um** padrão entre **Bucket**, **Outlier** ou **Schema Versioning** e
aplique-o a um problema **plausível** da rede de leitura (ex.: eventos de
"páginas lidas por dia" → Bucket; usuário com milhões de seguidores → Outlier;
campo `bio` que virou objeto estruturado → Versioning). Justifique a escolha.

---

# Dicas

- **Itere no `mongosh` interativo** (`docker exec -it aula08-mongo mongosh`) antes
  de salvar o script final.
- **Atenção à sintaxe em modo pipe:** se quebrar uma cadeia de métodos, **não**
  comece a linha seguinte com `.` — o mongosh executa a linha anterior antes do
  `.explain()`/`.sort()`. Mantenha cadeias completas em uma linha (veja o comentário
  no `scripts/07-indices-explain.js`).
- **`$lookup` retorna sempre um array** (mesmo em 1:1) — use `$unwind` para achatar.
- **Em agregação com `$group`**, lembre que `$group` exige `_id`; use `$match`
  **depois** do `$group` para filtrar agregados (ex.: editoras com ≥ 2 livros).
- **Para a Parte 1**, desenhe a estrutura no papel/Excalidraw antes de codar.

---

# Recursos de apoio

- MongoDB Manual — Data Modeling: https://www.mongodb.com/docs/manual/data-modeling/
- `$lookup`: https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/
- Coupal, D. (2019). *6 Rules of Thumb for MongoDB Schema Design.* MongoDB Blog.
- Coupal, D. & Alger, K. (2019). *Building with Patterns: A Summary.* MongoDB Blog.
- Bradshaw, Brazil & Chodorow (2019). *MongoDB: The Definitive Guide* (3rd ed.). O'Reilly — cap. 9.

