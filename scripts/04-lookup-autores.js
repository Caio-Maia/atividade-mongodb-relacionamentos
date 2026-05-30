// Parte 2.2b — Livros com lista de nomes dos autores (N:N)
// Usa $lookup para resolver o array de referências de autores (livro.autores → autor._id).
// Como localField é um array, o $lookup do MongoDB retorna todos os autores
// cujos _id estão no array sem precisar de $unwind prévio.
//
// Saída esperada: { title, autores: ["Nome1", "Nome2", ...] }
//
// Executar:
//   docker exec -i aula08-mongo mongosh livraria < scripts/04-lookup-autores.js

use("livraria");

print("=== Livros com lista de autores ===\n");

const resultado = db.livro.aggregate([
  {
    $lookup: {
      from: "autor",
      localField: "autores",      // array de ObjectIds no documento livro
      foreignField: "_id",
      as: "autores_info"
    }
  },
  {
    $project: {
      _id: 0,
      title: "$titulo",
      autores: {
        $map: {
          input: "$autores_info",
          as: "a",
          in: "$$a.nome"
        }
      }
    }
  }
]).toArray();

resultado.forEach(doc => printjson(doc));

print(`\nTotal: ${resultado.length} livro(s)`);
