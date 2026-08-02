(function bootstrapCredentialSavePrompt() {
  document.getElementById('angelshield-credential-save-prompt')?.remove();

  const logoUrl = chrome.runtime.getURL('assets/as_logo-removebg.png');
  const promptHost = document.createElement('div');
  const promptRoot = promptHost.attachShadow({ mode: 'closed' });
  const lastCapturedForms = new WeakMap();

  promptHost.id = 'angelshield-credential-save-prompt';
  promptHost.style.setProperty('all', 'initial', 'important');
  promptHost.style.setProperty('display', 'none', 'important');
  promptHost.style.setProperty('position', 'fixed', 'important');
  promptHost.style.setProperty('top', '16px', 'important');
  promptHost.style.setProperty('right', '16px', 'important');
  promptHost.style.setProperty('z-index', '2147483647', 'important');
  promptHost.style.setProperty('width', 'min(380px, calc(100vw - 32px))', 'important');
  promptHost.style.setProperty('max-height', 'calc(100vh - 32px)', 'important');

  promptRoot.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
      }

      .card {
        display: grid;
        gap: 13px;
        width: 100%;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        padding: 17px;
        border: 1px solid rgba(116, 167, 255, 0.28);
        border-radius: 18px;
        background: rgba(13, 21, 33, 0.98);
        color: #f3f8ff;
        color-scheme: dark;
        box-shadow: 0 24px 64px rgba(1, 7, 18, 0.56);
        font: 400 14px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 11px;
      }

      .header img {
        display: block;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        object-fit: contain;
      }

      .brand {
        display: block;
        margin-bottom: 2px;
        color: #8cbfff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h2,
      p {
        margin: 0;
      }

      h2 {
        color: #f3f8ff;
        font: 700 17px/1.2 "Space Grotesk", "Segoe UI", sans-serif;
      }

      p {
        color: #c0cee1;
      }

      .details {
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid rgba(116, 167, 255, 0.14);
        border-radius: 12px;
        background: rgba(5, 12, 22, 0.58);
      }

      .details strong,
      .details span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .details span,
      .feedback {
        color: #aac0df;
        font-size: 12px;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 9px;
      }

      button {
        appearance: none;
        min-height: 36px;
        margin: 0;
        padding: 10px 14px;
        border-radius: 999px;
        cursor: pointer;
        font: 700 13px/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      .dismiss {
        border: 1px solid rgba(116, 167, 255, 0.18);
        background: rgba(116, 167, 255, 0.1);
        color: #f3f8ff;
      }

      .save {
        border: 0;
        background: linear-gradient(135deg, #245dbe, #163f8f);
        color: #f7fbff;
        box-shadow: 0 12px 28px rgba(22, 63, 143, 0.35);
      }
    </style>

    <section class="card" role="dialog" aria-labelledby="angelshield-save-title">
      <div class="header">
        <img src="${logoUrl}" alt="" aria-hidden="true">
        <div>
          <span class="brand">AngelShield</span>
          <h2 id="angelshield-save-title">Salvar este login?</h2>
        </div>
      </div>
      <p>Não há uma credencial salva para este domínio.</p>
      <div class="details">
        <strong id="site"></strong>
        <span id="username"></span>
      </div>
      <div id="feedback" class="feedback" hidden></div>
      <div class="actions">
        <button id="dismiss" class="dismiss" type="button">Agora não</button>
        <button id="save" class="save" type="button">Criar registro</button>
      </div>
    </section>
  `;

  const siteLabel = promptRoot.querySelector('#site');
  const usernameLabel = promptRoot.querySelector('#username');
  const feedbackLabel = promptRoot.querySelector('#feedback');
  const dismissButton = promptRoot.querySelector('#dismiss');
  const saveButton = promptRoot.querySelector('#save');

  async function sendMessage(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      ...payload,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Falha de comunicação com a extensão.');
    }

    return response.data;
  }

  function hidePrompt() {
    promptHost.style.setProperty('display', 'none', 'important');
    dismissButton.disabled = false;
    saveButton.disabled = false;
    feedbackLabel.hidden = true;
    feedbackLabel.textContent = '';
  }

  function showPrompt(record) {
    if (!record?.link || !record.username) {
      return;
    }

    siteLabel.textContent = record.link;
    usernameLabel.textContent = `Usuário: ${record.username}`;
    dismissButton.disabled = false;
    saveButton.disabled = false;
    feedbackLabel.hidden = true;
    feedbackLabel.textContent = '';
    promptHost.style.setProperty('display', 'block', 'important');
  }

  function getScopeInputs(scope) {
    if (scope instanceof HTMLFormElement) {
      return Array.from(scope.elements).filter((element) => element instanceof HTMLInputElement);
    }

    return Array.from(scope.querySelectorAll('input'));
  }

  function findSubmittedPasswordInput(scope) {
    const passwordInputs = getScopeInputs(scope)
      .filter((input) => input.type === 'password' && !input.disabled && input.value.length > 0);

    return passwordInputs.find((input) => {
      return (input.autocomplete || '').toLowerCase().includes('current-password');
    }) || passwordInputs[0] || null;
  }

  function findSubmittedUsernameInput(scope, passwordInput) {
    const candidates = getScopeInputs(scope).filter((input) => {
      return !input.disabled
        && ['text', 'email', 'tel'].includes(input.type)
        && input.value.trim();
    });
    let selectedInput = null;
    let selectedScore = Number.NEGATIVE_INFINITY;

    for (const input of candidates) {
      const hints = [
        input.id,
        input.name,
        input.autocomplete,
        input.placeholder,
        input.getAttribute('aria-label'),
      ].filter(Boolean).join(' ').toLowerCase();
      let score = 0;

      if (hints.includes('username')) {
        score += 120;
      }

      if (hints.includes('email') || input.type === 'email') {
        score += 90;
      }

      if (hints.includes('user') || hints.includes('login') || hints.includes('usuario') || hints.includes('usuário')) {
        score += 60;
      }

      if (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING) {
        score += 20;
      }

      if (score > selectedScore) {
        selectedInput = input;
        selectedScore = score;
      }
    }

    return selectedInput;
  }

  function buildSubmittedCredential(scope) {
    if (!(scope instanceof Element || scope instanceof Document) || !/^https?:\/\//i.test(window.location.origin)) {
      return null;
    }

    const passwordInput = findSubmittedPasswordInput(scope);
    const usernameInput = passwordInput ? findSubmittedUsernameInput(scope, passwordInput) : null;
    if (!passwordInput || !usernameInput) {
      return null;
    }

    return {
      identifier: (document.title || '').replace(/\s+/g, ' ').trim() || window.location.hostname,
      username: usernameInput.value,
      plainPassword: passwordInput.value,
    };
  }

  function captureCredentialScope(scope) {
    const recordPrefill = buildSubmittedCredential(scope);
    if (!recordPrefill) {
      return;
    }

    const now = Date.now();
    const lastCapturedAt = lastCapturedForms.get(scope) || 0;
    if (now - lastCapturedAt < 1000) {
      return;
    }
    lastCapturedForms.set(scope, now);

    sendMessage('CAPTURE_SUBMITTED_CREDENTIAL', { recordPrefill })
      .then((data) => {
        if (data?.shouldPrompt && data.record) {
          showPrompt(data.record);
        } else {
          hidePrompt();
        }
      })
      .catch(() => {});
  }

  function hasFilledCredentials(scope) {
    const passwordInput = findSubmittedPasswordInput(scope);
    return Boolean(passwordInput && findSubmittedUsernameInput(scope, passwordInput));
  }

  function findClosestCredentialScope(target) {
    let current = target.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
      if (hasFilledCredentials(current)) {
        return current;
      }

      current = current.parentElement;
    }

    return hasFilledCredentials(document) ? document : null;
  }

  function getSubmissionScope(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const submitControl = target.closest('button, input[type="submit"], input[type="image"], input[type="button"], [role="button"]');
    if (!(submitControl instanceof HTMLElement) || submitControl.matches(':disabled')) {
      return null;
    }

    const form = submitControl instanceof HTMLButtonElement || submitControl instanceof HTMLInputElement
      ? submitControl.form
      : submitControl.closest('form');
    const controlHints = [
      submitControl.id,
      submitControl.getAttribute('name'),
      submitControl.getAttribute('aria-label'),
      submitControl.getAttribute('title'),
      submitControl instanceof HTMLInputElement ? submitControl.value : submitControl.textContent,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const isNativeSubmit = (submitControl instanceof HTMLButtonElement && submitControl.type === 'submit')
      || (submitControl instanceof HTMLInputElement && ['submit', 'image'].includes(submitControl.type));
    const looksLikeLoginAction = [
      'entrar',
      'acessar',
      'conectar',
      'continuar',
      'iniciar sessão',
      'login',
      'log in',
      'sign in',
      'continue',
      'submit',
    ].some((hint) => controlHints.includes(hint));

    if (!isNativeSubmit && !looksLikeLoginAction) {
      return null;
    }

    return form && hasFilledCredentials(form) ? form : findClosestCredentialScope(submitControl);
  }

  function restorePendingPrompt() {
    sendMessage('GET_PENDING_CREDENTIAL_PROMPT')
      .then((data) => {
        if (data?.record) {
          showPrompt(data.record);
        }
      })
      .catch(() => {});
  }

  document.documentElement.appendChild(promptHost);

  promptHost.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('submit', (event) => {
    captureCredentialScope(event.target);
  }, { capture: true });

  document.addEventListener('click', (event) => {
    const eventTarget = event.composedPath()[0] || event.target;
    const scope = getSubmissionScope(eventTarget);
    if (scope) {
      captureCredentialScope(scope);
    }
  }, { capture: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) {
      return;
    }

    const eventTarget = event.composedPath()[0] || event.target;
    if (!(eventTarget instanceof HTMLInputElement)) {
      return;
    }

    const scope = eventTarget.form && hasFilledCredentials(eventTarget.form)
      ? eventTarget.form
      : findClosestCredentialScope(eventTarget);
    if (scope) {
      captureCredentialScope(scope);
    }
  }, { capture: true });

  dismissButton.addEventListener('click', () => {
    hidePrompt();
    sendMessage('DISMISS_CREDENTIAL_PROMPT').catch(() => {});
  });

  saveButton.addEventListener('click', () => {
    dismissButton.disabled = true;
    saveButton.disabled = true;
    feedbackLabel.textContent = 'Abrindo o formulário do cofre…';
    feedbackLabel.hidden = false;

    sendMessage('OPEN_MANAGER_FOR_PENDING_CREDENTIAL')
      .then(() => hidePrompt())
      .catch((error) => {
        dismissButton.disabled = false;
        saveButton.disabled = false;
        feedbackLabel.textContent = error.message;
        feedbackLabel.hidden = false;
      });
  });

  promptRoot.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      hidePrompt();
      sendMessage('DISMISS_CREDENTIAL_PROMPT').catch(() => {});
    }
  });

  window.addEventListener('pageshow', restorePendingPrompt);
  restorePendingPrompt();
})();
