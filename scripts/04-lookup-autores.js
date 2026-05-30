// Parte 2.2b — $lookup N:N: resolver autores de cada livro
// Pre-requisito: scripts/02-enriquecer-dataset.js
// Uso: docker exec -i aula08-mongo mongosh < scripts/04-lookup-autores.js

const db = db.getSiblingDB("livraria");

print("\n=== Livros com lista de nomes dos autores (N:N via $lookup) ===");
// Quando localField e um array de ObjectIds, o $lookup resolve cada elemento
// e retorna um array de documentos correspondentes — sem precisar de $unwind.
printjson(db.livro.aggregate([
  { $lookup: {
      from: "autor",
      localField: "autores",   // array de ObjectIds
      foreignField: "_id",
      as: "autores_doc"
  } },
  { $project: {
      _id: 0,
      title: 1,
      "autores_doc.nome": 1   // projeta so o campo "nome" de cada autor
  } }
]).toArray());
// Saida esperada: 7 documentos com { title, autores_doc: [{ nome: "..." }] }
// Livro "Padroes de Projeto com MongoDB" deve aparecer com 2 nomes no array.
// Livro "Contos da Paraiba" aparece com autores_doc: [] (autores: [] no seed).
