# Filtro de texto do Tryv — como editar as listas

Estes arquivos dizem ao Tryv quais palavras e frases **impedem** a publicação de um texto (legenda de post, comentário,
nome, nome de clube, título/descrição de desafio, bio e certificações de profissional).
Quem lê e aplica as listas é o arquivo `backend/app/core/content_filter.py`.

**Mudar uma lista exige um deploy** (as listas fazem parte do código e passam pelos testes automáticos antes de valer).

## Os arquivos

| Arquivo | O que é | Mensagem que a pessoa vê |
|---|---|---|
| `blocked_insult.txt` | Ofensas diretas e xingamentos graves | Mensagem padrão |
| `blocked_hate.txt` | Ódio e discriminação | Mensagem padrão |
| `blocked_threat.txt` | Ameaças | Mensagem padrão |
| `blocked_sexual.txt` | Sexual explícito e venda de conteúdo adulto | Mensagem padrão |
| `blocked_selfharm.txt` | Incentivo a autolesão, suicídio e transtornos alimentares | Mensagem acolhedora com o CVV (188) |
| `allowed.txt` | **Exceções**: frases que sempre passam | — |
| `corpus/` | Listas de palavras **que nunca podem ser bloqueadas** (cidades, exercícios, alimentos, nomes...), usadas só pelos testes | — |

## Como escrever uma linha

- Uma palavra **ou uma frase** por linha. Maiúsculas, acentos e símbolos não importam (`Filho da Puta` = `filho da puta`).
- `#` começa um comentário (a linha é ignorada).
- **A palavra só vale inteira.** `puta` bloqueia "puta", mas **não** "computador" nem "disputa".
- Um `*` no fim de uma palavra aceita qualquer continuação (`abc*` casa "abc", "abcd", "abcxyz"). Só use em radicais que não aparecem
  em palavras comuns; na dúvida, liste as formas uma a uma.
- Frases (várias palavras) só valem com as palavras **juntas e nessa ordem**.
- Não precisa listar variações de escrita: o filtro já trata letras repetidas (`puuuta`), números no lugar de letras (`p0rr4`),
  símbolos (`put@`), espaços e pontos no meio (`p u t a`, `p.u.t.a`) e letras "estilizadas" ou invisíveis.

## Regras para a lista (leia antes de acrescentar algo)

1. **Na dúvida, a palavra NÃO entra.** Denúncia e revisão cobrem o resto; bloquear uma pessoa inocente é pior que deixar passar uma ofensa.
2. **Nunca entram** (são normais em fitness e no dia a dia): termos de corpo e treino (bunda, bumbum, glúteo, peito, peitoral, coxa, virilha,
   abdômen, pau de selfie), de peso e dieta (gordo, magro, obeso, emagrecer, secar, jejum, dieta, déficit calórico, bulking, cutting),
   nomes de exercícios, de alimentos, de cidades e sobrenomes. Palavras com duplo sentido (pau, pinto, rola, pica, cacete, macaco, bicha,
   gozar, transar) também ficam de fora.
3. **Palavrões leves** (merda, porra, droga, caramba) **não bloqueiam** — decisão do dono do Tryv.
4. Para liberar um uso legítimo de uma palavra bloqueada, acrescente a **frase** em `allowed.txt` (ex.: `porta arrombada`).

## Antes de publicar uma mudança

Rode a suíte de testes do filtro (`try_filtro_texto.py`). Ela:
- confere que todos os exemplos que devem passar passam e todos os que devem bloquear bloqueiam;
- passa **todas as cidades do Brasil, nomes de exercícios, alimentos, nomes e sobrenomes** do `corpus/` pelo filtro e **falha se alguma for bloqueada**;
- confere que nenhum termo da lista vira uma palavra comum depois de "limpo".

Se um falso positivo aparecer, acrescente a palavra ao `corpus/` (para o teste protegê-la daqui em diante) e corrija a lista.
