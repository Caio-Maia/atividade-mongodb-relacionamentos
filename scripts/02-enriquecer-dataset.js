// Parte 2.1 — Enriquecer dataset com 4 novos livros
// Pre-requisito: 01-seed-livraria.js (banco "livraria" com 3 editoras e 3 autores)
// Uso: docker exec -i aula08-mongo mongosh < scripts/02-enriquecer-dataset.js

const db = db.getSiblingDB("livraria");

// Idempotente: remove os titulos que serao inseridos
const novosTitulos = [
  "Padroes de Projeto com MongoDB",
  "MongoDB: Guia Pratico",
  "NoSQL Distilled",
  "Contos do Agreste"
];
db.livro.deleteMany({ title: { $in: novosTitulos } });

// Buscar IDs das editoras existentes pelo nome
const _ed_manning = db.editora.findOne({ nome: "Manning" });
const _ed_oreilly = db.editora.findOne({ nome: "O'Reilly" });
const _ed_magica  = db.editora.findOne({ nome: "Magica" });
if (!_ed_manning || !_ed_oreilly || !_ed_magica) {
  throw new Error("Editoras nao encontradas. Rode 01-seed-livraria.js primeiro.");
}
const manning = _ed_manning._id;
const oreilly = _ed_oreilly._id;
const magica  = _ed_magica._id;

// Buscar IDs dos autores existentes pelo nome
const _au_banker   = db.autor.findOne({ nome: "Kyle Banker" });
const _au_bradshaw = db.autor.findOne({ nome: "Shannon Bradshaw" });
const _au_chodorow = db.autor.findOne({ nome: "Kristina Chodorow" });
if (!_au_banker || !_au_bradshaw || !_au_chodorow) {
  throw new Error("Autores nao encontrados. Rode 01-seed-livraria.js primeiro.");
}
const banker   = _au_banker._id;
const bradshaw = _au_bradshaw._id;
const chodorow = _au_chodorow._id;

print("\n=== Inserindo 4 novos livros ===");
db.livro.insertMany([
  // Livro 1: Manning, 2 autores (satisfaz requisito de array com 2+ autores)
  {
    title: "Padroes de Projeto com MongoDB",
    editora: manning,
    autores: [banker, bradshaw]
  },
  // Livro 2: Manning — mesma editora que o livro 1 (satisfaz requisito de 2 livros mesma editora)
  {
    title: "MongoDB: Guia Pratico",
    editora: manning,
    autores: [chodorow]
  },
  // Livro 3: O'Reilly, 1 autor
  {
    title: "NoSQL Distilled",
    editora: oreilly,
    autores: [bradshaw]
  },
  // Livro 4: Magica, 1 autor
  {
    title: "Contos do Agreste",
    editora: magica,
    autores: [banker]
  }
]);

print("Total de livros: " + db.livro.countDocuments());
// Esperado: 7 (3 originais + 4 novos)
print("\nTodos os livros (title + editora_id + autores_ids):");
printjson(db.livro.find({}, { title: 1, editora: 1, autores: 1 }).toArray());
