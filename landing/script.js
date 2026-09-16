// Tryv — landing page (pré-lançamento)
//
// API_BASE_URL: detecta ambiente automaticamente pelo hostname que está
// servindo a própria página, em vez de exigir trocar uma constante à mão
// antes de cada deploy. Rodando em localhost/127.0.0.1 (dev local, ex:
// `npx serve landing` ou Live Server) -> aponta pro backend local
// (ajuste a porta abaixo se você rodar o Tryv API em outra). Em qualquer
// outro host (preview/produção no Vercel) -> aponta pro backend de
// produção no Railway. Se algum dia precisar forçar um dos dois na mão
// (ex: testar produção a partir do localhost), troque a linha
// `const API_BASE_URL = ...` por um valor fixo.
const API_BASE_URL = (() => {
  const { hostname } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  return isLocal ? 'http://localhost:8000' : 'https://tryv-backend-production.up.railway.app';
})();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.remove('is-success', 'is-error');
  if (kind) el.classList.add(kind);
}

function initWaitlistForm(form) {
  const input = form.querySelector('.waitlist-input');
  const honeypot = form.querySelector('.hp-field input');
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.waitlist-status');
  const buttonLabel = button.textContent;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      input.classList.add('is-invalid');
      setStatus(status, 'Digite um e-mail válido.', 'is-error');
      input.focus();
      return;
    }
    input.classList.remove('is-invalid');

    button.disabled = true;
    button.textContent = 'Enviando...';
    setStatus(status, '', null);

    try {
      const response = await fetch(`${API_BASE_URL}/waitlist/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot ? honeypot.value : '' }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      form.reset();
      setStatus(status, 'Pronto! Você está na lista — avisamos assim que o Tryv Fit abrir.', 'is-success');
    } catch (err) {
      setStatus(status, 'Não foi possível cadastrar agora. Tente novamente em instantes.', 'is-error');
    } finally {
      button.disabled = false;
      button.textContent = buttonLabel;
    }
  });
}

document.querySelectorAll('.waitlist-form').forEach(initWaitlistForm);
