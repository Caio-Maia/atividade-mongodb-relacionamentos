// Parte 2 — Seed do dataset base "livraria"
// Recria o dataset da aula (editora, autor, livro) de que os scripts 02..05
// dependem. Espelha o 01-seed-livraria.js da aula-08, mantendo os mesmos
// nomes de editoras e autores referenciados pelos scripts seguintes.
// Uso: docker exec -i aula08-mongo mongosh < scripts/01-seed-livraria.js

const db = db.getSiblingDB("livraria");

// Idempotente: limpa execucoes anteriores
["editora", "autor", "livro"].forEach(c => db[c].drop());

print("\n=== 1. Editoras — geram _id que os livros vao referenciar ===");
const ed = db.editora.insertMany([
  { nome: "Manning",  cidade: "Shelter Island" },
  { nome: "Magica",   cidade: "Joao Pessoa" },
  { nome: "O'Reilly", cidade: "Sebastopol" }
]).insertedIds;
printjson(ed);

print("\n=== 2. Autores (N..N com livros) ===");
const au = db.autor.insertMany([
  { nome: "Kyle Banker" },
  { nome: "Shannon Bradshaw" },
  { nome: "Kristina Chodorow" }
]).insertedIds;
printjson(au);

print("\n=== 3. Livros REFERENCIANDO editora e autores pelo _id (FK manual) ===");
db.livro.insertMany([
  { title: "MongoDB in Action",             url: "http://mongodbexpert.com",
    editora: ed[0], autores: [au[0]] },                       // Manning / Banker
  { title: "MongoDB: The Definitive Guide", url: "http://oreilly.com/mongo",
    editora: ed[2], autores: [au[1], au[2]] },                // O'Reilly / Bradshaw + Chodorow
  { title: "Contos da Paraiba",             url: "http://magica.com.br",
    editora: ed[1], autores: [] }                             // Magica / sem autores cadastrados
]);
printjson(db.livro.find({}, { title: 1, editora: 1 }).toArray());

print("\nResumo do banco 'livraria':");
["editora", "autor", "livro"].forEach(c =>
  print("  " + c + ": " + db[c].countDocuments() + " docs")
);
print("\nSeed concluido. Rode os proximos scripts (02..05).");
// Esperado: editora 3, autor 3, livro 3
