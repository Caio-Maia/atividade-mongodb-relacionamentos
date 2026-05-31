// Parte 3 — Schema Design Patterns aplicados a rede social de leitura
// Banco proprio: "rede_leitura" (independente do dataset livraria)
// Uso: docker exec -i aula08-mongo mongosh < scripts/05-patterns.js

const db = db.getSiblingDB("rede_leitura");
["usuario", "livro", "resenha", "seguidores_extras"].forEach(c => db[c].drop());

// IDs (ObjectId) gerados uma vez e reutilizados entre as secoes — o _id usa o
// mesmo tipo da Parte 1 (ObjectId), e as referencias (livro_id, usuario_id,
// seguidores) apontam para esses _id.
const ID_LIVRO_OCORTICO  = new ObjectId();
const ID_USUARIO_ANA     = new ObjectId();
const ID_USUARIO_BOB     = new ObjectId();
const ID_USUARIO_CARLOS  = new ObjectId();
const ID_USUARIO_CLARICE = new ObjectId();
const ID_RESENHA_1       = new ObjectId();

// ============================================================
print("\n========== 3.1 — EXTENDED REFERENCE ==========");
// Problema: exibir uma resenha requer o titulo do livro e o nome do usuario,
// mas $lookup a cada leitura e caro no hot path (feed, timeline).
// Solucao: duplicar os campos estaveis diretamente na resenha.

// Campos duplicados (estaveis):
//   livro_titulo — titulos raramente mudam (e uma mudanca e excepcao, nao rotina)
//   usuario_nome — nome de exibicao e estavel; e-mail e foto mudam, nome nao
// Campo NAO duplicado (instavel):
//   nota_media — muda a cada nova resenha; propagar em cada escrita
//   seria custoso e propenso a desincronizacao.

db.resenha.insertOne({
  _id: ID_RESENHA_1,
  livro_id:      ID_LIVRO_OCORTICO,
  usuario_id:    ID_USUARIO_ANA,
  // Campos do Extended Reference (duplicados, estaveis):
  livro_titulo:  "O Cortico",
  usuario_nome:  "Ana Lima",
  // Dados proprios da resenha:
  nota: 5,
  texto: "Obra-prima da literatura brasileira. Alucinante desde a primeira pagina.",
  data: new Date("2024-04-10"),
  curtidas: 42,
  comentarios: [
    { usuario_id: ID_USUARIO_BOB, texto: "Concordo plenamente!", data: new Date("2024-04-11") }
  ]
});

print("Resenha com Extended Reference (leitura sem $lookup):");
printjson(db.resenha.findOne(
  { _id: ID_RESENHA_1 },
  { livro_titulo: 1, usuario_nome: 1, nota: 1, texto: 1, _id: 0 }
));

print("\n[Justificativa] livro_titulo e usuario_nome sao estaveis o suficiente:");
print("  - Titulo de livro muda em casos raros (reedicao), nao em rotina.");
print("  - Nome de exibicao do usuario e escolhido na criacao e raramente alterado.");
print("  - Se mudar, um updateMany corrige todas as copias — aceitavel para eventos raros.");
print("  - Campo NAO duplicado: nota_media do livro (varia a cada nova resenha — propagacao inviavel).");

// ============================================================
print("\n========== 3.2 — SUBSET ==========");
// Problema: um livro popular acumula milhares de resenhas.
// Embutir todas no documento livro estouraria o limite BSON de 16 MB.
// Solucao: embutir so as 3 mais recentes (hot path) + contador.
// Colecao "resenha" guarda todas e permite paginacao.

db.livro.insertOne({
  _id: ID_LIVRO_OCORTICO,
  title: "O Cortico",
  autores: ["Alencas Jr."],
  ano: 1890,
  // Subset: apenas as 3 resenhas mais recentes ficam no documento livro
  resenhas_top: [
    { usuario_nome: "Ana Lima",   nota: 5, texto: "Obra-prima!",             data: new Date("2024-04-10") },
    { usuario_nome: "Carlos Rui", nota: 4, texto: "Linguagem densa, vale.", data: new Date("2024-03-20") },
    { usuario_nome: "Bia Costa",  nota: 5, texto: "Li de uma vez so.",       data: new Date("2024-02-14") }
  ],
  // total_resenhas: campo computado, mantido pelo Computed Pattern (secao 3.3)
  total_resenhas: 1284
});

// Colecao "resenha" guarda todas — usada pela tela "ver todas"
// Inclui livro_titulo (Extended Reference) para consistencia com a secao 3.1
const bulk = [];
for (let i = 1; i <= 50; i++) {
  bulk.push({
    livro_id:     ID_LIVRO_OCORTICO,
    livro_titulo: "O Cortico",        // Extended Reference: evita $lookup na tela de lista
    usuario_nome: "usuario_" + i,
    nota: (i % 5) + 1,
    texto: "Resenha numero " + i,
    data: new Date(2024, 0, i)
  });
}
db.resenha.insertMany(bulk);

print("Documento livro com Subset (tela principal — uma unica query):");
printjson(db.livro.findOne({ _id: ID_LIVRO_OCORTICO }));

print('\n"Ver todas as resenhas" = 2a query paginada na colecao resenha:');
printjson(db.resenha.find({ livro_id: ID_LIVRO_OCORTICO }).sort({ data: -1 }).limit(5).toArray());

print("\n[Justificativa] A tela principal do livro carrega em uma query (resenhas_top ja vem");
print("  embutidas). So a tela 'ver todas' dispara uma segunda query paginada na colecao");
print("  resenha, mantendo o documento livro sempre dentro do limite BSON independente");
print("  do numero total de resenhas.");

// ============================================================
print("\n========== 3.3 — COMPUTED ==========");
// Problema: calcular nota_media e total_resenhas com aggregate a cada leitura
// e lento quando ha milhares de resenhas por livro.
// Solucao: manter soma_notas e total_resenhas atualizados em write-time com $inc.
// nota_media e derivada de soma_notas / total_resenhas.

// Estado inicial: livro ja tem 1284 resenhas com soma de notas 5393
// nota_media = 5393 / 1284 ≈ 4.2
db.livro.updateOne(
  { _id: ID_LIVRO_OCORTICO },
  { $set: { soma_notas: 5393, nota_media: 4.2 } }
);

print("Estado atual do livro (campos computed presentes):");
printjson(db.livro.findOne(
  { _id: ID_LIVRO_OCORTICO },
  { title: 1, nota_media: 1, total_resenhas: 1, soma_notas: 1, _id: 0 }
));

// A cada nova resenha: $inc atualiza os acumuladores atomicamente
// — este e o updateOne com $inc que a atividade pede
const novaNota = 5;
db.livro.updateOne(
  { _id: ID_LIVRO_OCORTICO },
  {
    $inc: { total_resenhas: 1, soma_notas: novaNota }
  }
);

// Derivar e persistir nota_media com base nos acumuladores atualizados
const atualizado = db.livro.findOne({ _id: ID_LIVRO_OCORTICO }, { soma_notas: 1, total_resenhas: 1 });
db.livro.updateOne(
  { _id: ID_LIVRO_OCORTICO },
  { $set: { nota_media: Math.round(atualizado.soma_notas / atualizado.total_resenhas * 100) / 100 } }
);

print("\nApos inserir nova resenha com nota " + novaNota + ":");
printjson(db.livro.findOne(
  { _id: ID_LIVRO_OCORTICO },
  { title: 1, nota_media: 1, total_resenhas: 1, soma_notas: 1, _id: 0 }
));

print("\n[Justificativa] nota_media e total_resenhas sao lidos em toda tela do livro.");
print("  Recalcular via aggregate seria O(n) a cada leitura. Com Computed, a leitura");
print("  e O(1) — um findOne retorna o resultado pronto. O $inc em soma_notas e");
print("  total_resenhas e atomico e nao sofre drift de ponto flutuante.");

// ============================================================
print("\n========== 3.4 — OUTLIER ==========");
// Padrao escolhido: Outlier
// Problema: a colecao "segue" funciona para usuarios comuns, mas usuarios
// famosos (autores, celebridades) podem ter milhoes de seguidores, tornando
// inviavel manter um array embutido. A solucao e tratar o caso excepcional
// separadamente, sem penalizar o caso comum.

// Caso normal: usuario com poucos seguidores — lista embutida (ObjectId)
db.usuario.insertOne({
  _id: ID_USUARIO_ANA,
  nome: "Ana Lima",
  seguidores: [ID_USUARIO_BOB, ID_USUARIO_CARLOS],
  seguidores_count: 2,
  has_extras: false
});

// Caso outlier: autor famoso com seguidores demais para embutir
// Simulamos 500 seguidores (cada um um ObjectId); os 100 mais recentes ficam embutidos
const seguidoresVirais = [];
for (let i = 1; i <= 500; i++) seguidoresVirais.push(new ObjectId());

db.usuario.insertOne({
  _id: ID_USUARIO_CLARICE,
  nome: "Clarice Lispector Fan Page",
  // Guardamos os 100 MAIS RECENTES embutidos (hot path)
  seguidores: seguidoresVirais.slice(-100),   // ultimos 100 ObjectIds
  seguidores_count: 850000,
  has_extras: true   // marcador: ha mais seguidores na colecao dedicada
});

// Seguidores excedentes ficam na colecao separada
db.seguidores_extras.insertMany(
  seguidoresVirais.slice(0, -100).map(u => ({
    usuario_id: ID_USUARIO_CLARICE,
    seguidor_id: u,
    data: new Date()
  }))
);

print("Usuario comum — seguidores embutidos (sem custo extra):");
printjson(db.usuario.findOne(
  { _id: ID_USUARIO_ANA },
  { nome: 1, seguidores: 1, seguidores_count: 1, has_extras: 1, _id: 0 }
));

print("\nUsuario outlier — marcado com has_extras=true:");
const viral = db.usuario.findOne({ _id: ID_USUARIO_CLARICE }, { nome: 1, seguidores_count: 1, has_extras: 1, _id: 0 });
printjson(viral);
print("  Seguidores na colecao extras: " + db.seguidores_extras.countDocuments({ usuario_id: ID_USUARIO_CLARICE }));

print("\n[Justificativa] O padrao Outlier evita que o caso excepcional (usuario viral)");
print("  force uma arquitetura pesada para todos os usuarios. A aplicacao verifica");
print("  has_extras e, se true, busca o restante na colecao seguidores_extras —");
print("  transparente para o usuario comum, que nunca paga o custo extra.");
print("  A escolha se conecta diretamente com a discussao da Parte 1.3.");
