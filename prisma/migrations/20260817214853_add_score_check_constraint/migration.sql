-- Defesa em profundidade: a regra de negócio da aplicação já garante que só
-- persistimos scores dentro de 0-1000; esta constraint impede que qualquer
-- outro caminho de escrita (ex: um script manual) insira um valor fora do
-- range documentado pelo Business Case.
ALTER TABLE "findings"
  ADD CONSTRAINT "findings_score_range_check" CHECK ("score" BETWEEN 0 AND 1000);
