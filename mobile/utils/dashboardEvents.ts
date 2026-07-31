/**
 * Sinal explicito de "os dados do dashboard mudaram" — usado alem do
 * useFocusEffect da Home porque voltar de uma tela apresentada como modal
 * (ex: /weight/new) nem sempre dispara o evento de foco do tab de forma
 * confiavel em todo dispositivo/versao do react-native-screens. Isso garante
 * que a Home recarregue mesmo se o foco nao disparar a tempo.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyDashboardChanged() {
  listeners.forEach((listener) => listener());
}

export function subscribeToDashboardChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
