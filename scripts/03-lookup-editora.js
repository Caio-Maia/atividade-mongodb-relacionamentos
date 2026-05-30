// Parte 2.2a — Livros com nome e cidade da editora
// Usa $lookup + $unwind + $project para enriquecer os documentos de livro
// com os dados da editora referenciada.
//
// Saída esperada: { title, editora (nome), cidade }
//
// Executar:
//   docker exec -i aula08-mongo mongosh livraria < scripts/03-lookup-editora.js

use("livraria");

print("=== Livros com nome e cidade da editora ===\n");

const resultado = db.livro.aggregate([
  {
    $lookup: {
      from: "editora",
      localField: "editora",      // campo em livro que guarda o ObjectId da editora
      foreignField: "_id",
      as: "editora_info"
    }
  },
  {
    $unwind: "$editora_info"      // $lookup sempre retorna array; $unwind o achata para objeto
  },
  {
    $project: {
      _id: 0,
      title: "$titulo",
      editora: "$editora_info.nome",
      cidade: "$editora_info.cidade"
    }
  }
]).toArray();

resultado.forEach(doc => printjson(doc));

print(`\nTotal: ${resultado.length} livro(s)`);
