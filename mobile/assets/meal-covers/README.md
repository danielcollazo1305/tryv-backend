# Capas de refeição (sem foto)

Imagens usadas quando uma refeição **não tem foto**. Onde há foto, a foto é mostrada. Sem capa para o prato, o app mostra o prato roxo (`components/MealCoverArt.tsx`).

## Estrutura

```
assets/meal-covers/<tema>/<nome>.webp
```

Tema atual: `anime` (constante `MEAL_COVER_THEME` em `constants/mealCovers.ts`; trocar de tema é mudar essa constante).
Formato: WebP 800x800, prato visto de cima (centro em ~50% da largura e ~48% da altura; faixa livre de ~21% embaixo).

## Regra de nomes

- só minúsculas, números e `_`; sem acento, sem espaço, sem maiúscula (ex.: `file_mignon.webp`);
- o nome do arquivo é o nome da capa: é a chave no mapa de `constants/mealCovers.ts` e um valor de `MealCoverName` em `utils/mealCoverPick.ts`.

## Para adicionar uma imagem nova

1. colocar o `.webp` na pasta do tema;
2. adicionar a linha no mapa (`constants/mealCovers.ts`) e o nome em `MealCoverName`;
3. criar a regra em `utils/mealCoverPick.ts` e **tirar a palavra de `BLOCKED_WORDS`**, se estava lá;
4. rodar `node "Claude outputs/try_capas_refeicao.mjs"` (compara a pasta com o mapa).

## Imagens atuais (tema anime)

`bife`, `bife_ovo`, `file_mignon`, `frango_legumes`, `peixe_assado`, `poke`, `salmao`.

## Origem e licença

- **Origem:** todas as imagens foram **geradas por IA (Gemini), em 04/11/2026**.
- **Prompt/estilo usado:** _a preencher_.
- **Uso comercial:** **a confirmar** nos termos da ferramenta usada. Não tratar como liberado até conferir.
