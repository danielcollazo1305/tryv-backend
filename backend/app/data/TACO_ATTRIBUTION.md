<!-- Fonte dos dados de app/data/taco_foods.csv e da tabela `foods` (carregada pela migration c8d1f5a3e927). -->

# Atribuição — Tabela Brasileira de Composição de Alimentos (TACO)

## Fonte dos dados (citação exigida)

Os valores nutricionais (por 100 g de parte comestível) vêm da:

> **Tabela Brasileira de Composição de Alimentos - TACO, 4a edição revisada e ampliada.**
> Núcleo de Estudos e Pesquisas em Alimentação (NEPA), Universidade Estadual de
> Campinas (UNICAMP). Campinas, 2011.
> Disponível em: http://www.unicamp.br/nepa/taco

© 2011 Núcleo de Estudos e Pesquisas em Alimentação – NEPA / Universidade Estadual de Campinas – UNICAMP.

Permissão de reprodução, conforme a própria publicação:

> "É permitida a reprodução parcial ou total desta obra, desde que citada a fonte."
> — TACO 4a edição, ficha técnica (NEPA/UNICAMP, 2011)

Contato do NEPA (conforme a publicação): taco@unicamp.br

## Versão estruturada (intermediário)

Os dados usados aqui foram obtidos da versão estruturada em CSV mantida por Raul de Melo:
https://github.com/raulfdm/taco-api (arquivos `references/csv/food.csv`,
`nutrients.csv` e `categories.csv`), licenciada sob MIT. Aviso de copyright e licença
exigidos:

```
MIT License (taco-api)

Copyright 2022 Raul de Melo

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

Observação: a MIT acima cobre o trabalho de estruturação do repositório intermediário; os
direitos sobre os dados da TACO pertencem ao NEPA/UNICAMP. O FAQ do taco-api declara que
"todo direito autoral é reservado à instituição" (UNICAMP).

## Notas de processamento

Os dados NÃO são idênticos à TACO original; passaram por estas transformações:

1. **Pelo repositório intermediário (taco-api):** valores `NA` (não aplicável) e `*`
   (amostra enviada para reanálise) viraram vazio; `Tr` (traço, valores entre 0 e 0,5
   conforme a TACO) virou `0`; colunas renomeadas para inglês; categorias separadas em
   tabela própria.
2. **Por este projeto (`app/data/taco_foods.csv`):**
   - espaços duplicados e espaços nas pontas dos nomes foram normalizados (ex.: "Coco,  verde, cru"
     → "Coco, verde, cru"); a ortografia NÃO foi alterada (ex.: "Lingüiça" segue como está na fonte);
   - `search_name` é uma coluna derivada para busca (minúsculo, sem acentos, pontuação → espaço);
   - quando a kcal estava ausente e havia ao menos um macronutriente, a kcal seria calculada por
     `round(4*proteína + 4*carboidrato + 9*lipídio)` (macro vazio = 0) e marcada com
     `kcal_estimated = true`. Na carga atual nenhum alimento precisou disso;
   - alimentos sem kcal e sem macros na fonte (6) mantêm kcal nula — o app não registra
     refeição com eles ("Dados de calorias indisponiveis para este alimento").
3. Valores ausentes na fonte permanecem nulos (não zero); no registro de refeição, macro nulo
   conta como 0 e kcal nula é recusada.
