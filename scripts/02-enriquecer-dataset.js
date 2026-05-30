// Parte 2.1 — Enriquecer o dataset
// Insere 4 livros referenciando editoras e autores existentes pelo _id.
// Pré-requisito: dataset base já carregado com 01-seed-livraria.js
//
// Executar:
//   docker exec -i aula08-mongo mongosh livraria < scripts/02-enriquecer-dataset.js

use("livraria");

// Lê _ids de editoras existentes
const editoras = db.editora.find({}, { _id: 1, nome: 1 }).toArray();
if (editoras.length === 0) {
  throw new Error("Nenhuma editora encontrada. Rode 01-seed-livraria.js primeiro.");
}

// Lê _ids de autores existentes
const autores = db.autor.find({}, { _id: 1, nome: 1 }).toArray();
if (autores.length === 0) {
  throw new Error("Nenhum autor encontrado. Rode 01-seed-livraria.js primeiro.");
}

print("Editoras disponíveis:");
editoras.forEach(e => print(`  ${e._id} → ${e.nome}`));

print("\nAutores disponíveis:");
autores.forEach(a => print(`  ${a._id} → ${a.nome}`));

// Seleciona referências para os novos livros
const editora1 = editoras[0]._id;
const editora2 = editoras.length > 1 ? editoras[1]._id : editoras[0]._id;

const autor1 = autores[0]._id;
const autor2 = autores.length > 1 ? autores[1]._id : autores[0]._id;
const autor3 = autores.length > 2 ? autores[2]._id : autores[0]._id;

// 4 novos livros:
//   - livro1 e livro2 publicados pela mesma editora (editora1)
//   - livro3 publicado pela editora2
//   - livro4 com 2 autores (array de referências)
const novosLivros = [
  {
    titulo: "O Guia do Mochileiro das Galáxias",
    autores: [autor1],
    editora: editora1,                    // mesma editora que livro2
    ano: 1979,
    generos: ["Ficção Científica", "Humor"],
    isbn: "978-0345391803",
    sinopse: "Arthur Dent é arrastado numa jornada pelo universo após a Terra ser demolida para dar lugar a uma rodovia hiperespacial."
  },
  {
    titulo: "O Restaurante no Fim do Universo",
    autores: [autor1],
    editora: editora1,                    // mesma editora que livro1
    ano: 1980,
    generos: ["Ficção Científica", "Humor"],
    isbn: "978-0345391810",
    sinopse: "Continuação das aventuras de Arthur Dent pelo universo com Zaphod Beeblebrox e Ford Prefect."
  },
  {
    titulo: "Cem Anos de Solidão",
    autores: [autor2],
    editora: editora2,
    ano: 1967,
    generos: ["Realismo Mágico", "Romance"],
    isbn: "978-0060883287",
    sinopse: "A saga da família Buendía ao longo de sete gerações na cidade fictícia de Macondo."
  },
  {
    titulo: "Good Omens",
    autores: [autor2, autor3],            // livro com 2 autores
    editora: editora2,
    ano: 1990,
    generos: ["Fantasia", "Humor", "Ficção Científica"],
    isbn: "978-0060853983",
    sinopse: "Um anjo e um demônio unem forças para evitar o Apocalipse numa Londres caótica."
  }
];

const resultado = db.livro.insertMany(novosLivros);

print(`\nLivros inseridos: ${resultado.insertedCount}`);
print("IDs dos novos livros:");
Object.values(resultado.insertedIds).forEach(id => print(`  ${id}`));

print("\nTotal de livros na coleção:");
print(`  ${db.livro.countDocuments()}`);
