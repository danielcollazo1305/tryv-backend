/**
 * "Uma execucao por vez": enquanto a chamada anterior de `fn` nao termina, novas chamadas devolvem a MESMA promessa em vez de disparar outra. Logica PURA,
 * testada no Node (mobile/tests/singleFlight.test.mjs). Usada para nao gerar duas vezes seguidas o insight de IA (cada geracao custa dinheiro) e para o
 * botao/gesto de atualizar nao empilhar atualizacoes. Quando a promessa termina (com sucesso ou erro), a proxima chamada volta a executar `fn`.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    const current = (async () => fn())();
    pending = current;
    const clear = () => {
      if (pending === current) pending = null;
    };
    current.then(clear, clear);
    return current;
  };
}
