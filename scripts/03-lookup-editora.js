// Parte 2.2a — $lookup basico: livros com nome e cidade da editora
// Pre-requisito: scripts/02-enriquecer-dataset.js
// Uso: docker exec -i aula08-mongo mongosh < scripts/03-lookup-editora.js

const db = db.getSiblingDB("livraria");

print("\n=== Lista de todos os livros com nome e cidade da editora ===");
// $lookup faz left outer join: livro.editora (ObjectId) -> editora._id
// $unwind achata o array "ed" (resultado de $lookup e sempre array, mesmo em 1:1)
// $project seleciona apenas os campos pedidos na atividade
printjson(db.livro.aggregate([
  { $lookup: {
      from: "editora",
      localField: "editora",
      foreignField: "_id",
      as: "ed"
  } },
  { $unwind: "$ed" },
  { $project: {
      _id: 0,
      title: 1,
      editora: "$ed.nome",
      cidade: "$ed.cidade"
  } }
]).toArray());
// Saida esperada: 7 documentos com { title, editora, cidade }
