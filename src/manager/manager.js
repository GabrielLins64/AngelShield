(function bootstrapManager() {
  const RECORD_PREFILL_PARAM = 'recordPrefill';
  const PASSWORD_CHARSETS = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    special: '!@#$%&*()-_=+[]{};:,.?/',
  };
  const state = {
    currentPage: 1,
    generatedPassword: '',
    generatorInsertTarget: null,
    locked: true,
    pageSize: '10',
    pendingKeyRejecter: null,
    pendingKeyResolver: null,
    pendingDeleteRecord: null,
    records: [],
    searchQuery: '',
    settings: null,
    savingRecord: false,
    refreshVersion: 0,
  };

  const elements = {
    cancelDeleteButton: document.getElementById('cancel-delete-button'),
    cancelRecordButton: document.getElementById('cancel-record-button'),
    clearSearchButton: document.getElementById('clear-search-button'),
    closeDeleteDialogButton: document.getElementById('close-delete-dialog-button'),
    closeRecordDialogButton: document.getElementById('close-record-dialog-button'),
    closePasswordGeneratorDialogButton: document.getElementById('close-password-generator-dialog-button'),
    copyGeneratedPasswordButton: document.getElementById('copy-generated-password-button'),
    currentPageLabel: document.getElementById('current-page-label'),
    confirmDeleteButton: document.getElementById('confirm-delete-button'),
    deleteDescription: document.getElementById('delete-description'),
    deleteDialog: document.getElementById('delete-dialog'),
    deleteForm: document.getElementById('delete-form'),
    emptyStateAction: document.getElementById('empty-state-action'),
    emptyStateDescription: document.getElementById('empty-state-description'),
    emptyStateIcon: document.getElementById('empty-state-icon'),
    emptyStateTitle: document.getElementById('empty-state-title'),
    exportButton: document.getElementById('export-button'),
    formTitle: document.getElementById('form-title'),
    generatePasswordButton: document.getElementById('generate-password-button'),
    generatedPasswordOutput: document.getElementById('generated-password-output'),
    globalSaltInput: document.getElementById('global-salt-input'),
    generatorLengthInput: document.getElementById('generator-length-input'),
    generatorNumbersInput: document.getElementById('generator-numbers-input'),
    generatorSpecialInput: document.getElementById('generator-special-input'),
    generatorUppercaseInput: document.getElementById('generator-uppercase-input'),
    hintInput: document.getElementById('hint-input'),
    identifierInput: document.getElementById('identifier-input'),
    importButton: document.getElementById('import-button'),
    importFileInput: document.getElementById('import-file-input'),
    insertGeneratedPasswordButton: document.getElementById('insert-generated-password-button'),
    linkInput: document.getElementById('link-input'),
    mainContent: document.getElementById('main-content'),
    openRecordModalButton: document.getElementById('open-record-modal-button'),
    openPasswordGeneratorButton: document.getElementById('open-password-generator-button'),
    passwordInput: document.getElementById('password-input'),
    passwordHelp: document.getElementById('password-help'),
    passwordRequiredMark: document.getElementById('password-required-mark'),
    passwordGeneratorDialog: document.getElementById('password-generator-dialog'),
    openGeneratorButton: document.getElementById('open-generator-button'),
    paginationBar: document.getElementById('pagination-bar'),
    paginationMeta: document.getElementById('pagination-meta'),
    paginationNextButton: document.getElementById('pagination-next-button'),
    paginationPageLabel: document.getElementById('pagination-page-label'),
    paginationPages: document.getElementById('pagination-pages'),
    paginationPrevButton: document.getElementById('pagination-prev-button'),
    pageSizeSelect: document.getElementById('page-size-select'),
    recordCountLabel: document.getElementById('record-count-label'),
    recordDialog: document.getElementById('record-dialog'),
    recordForm: document.getElementById('record-form'),
    recordIdInput: document.getElementById('record-id'),
    recordSearchInput: document.getElementById('record-search-input'),
    recordsEmptyState: document.getElementById('records-empty-state'),
    recordsList: document.getElementById('records-list'),
    recordsColumnHeadings: document.getElementById('records-column-headings'),
    saveRecordButton: document.getElementById('save-record-button'),
    searchResultsLabel: document.getElementById('search-results-label'),
    sidebarRecordCount: document.getElementById('sidebar-record-count'),
    saveSaltButton: document.getElementById('save-salt-button'),
    saltForm: document.getElementById('salt-form'),
    settingsPage: document.getElementById('settings-page'),
    settingsPageLink: document.getElementById('settings-page-link'),
    settingsPageTitle: document.getElementById('settings-page-title'),
    skipLink: document.getElementById('skip-link'),
    toast: document.getElementById('toast'),
    togglePasswordButton: document.getElementById('toggle-password-button'),
    unlockCancelButton: document.getElementById('unlock-cancel-button'),
    unlockConfirmButton: document.getElementById('unlock-confirm-button'),
    unlockDescription: document.getElementById('unlock-description'),
    unlockDialog: document.getElementById('unlock-dialog'),
    unlockForm: document.getElementById('unlock-form'),
    unlockKeyInput: document.getElementById('unlock-key-input'),
    unlockTitle: document.getElementById('unlock-title'),
    usernameInput: document.getElementById('username-input'),
    vaultButton: document.getElementById('vault-control-button'),
    vaultPage: document.getElementById('vault-page'),
    vaultPageLink: document.getElementById('vault-page-link'),
    vaultPageTitle: document.getElementById('vault-page-title'),
    vaultStatusIcon: document.getElementById('vault-status-icon'),
    vaultStatusTitle: document.getElementById('vault-status-title'),
    vaultStatusDescription: document.getElementById('vault-status-description'),
  };

  const ICON_PATHS = {
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    edit: '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M10 5a12 12 0 0 1 2 0c7 0 10 7 10 7a19 19 0 0 1-3 4M6 6a19 19 0 0 0-4 6s3 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    vault: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="11" r="3"/><path d="M12 14v3M8 7h8"/>',
  };

  function getIcon(name) {
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  }

  function getClosedLockIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2"></rect>
        <path d="M8 11V8a4 4 0 1 1 8 0v3"></path>
      </svg>
    `;
  }

  function getOpenLockIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2"></rect>
        <path d="M8 11V8a4 4 0 1 1 8 0"></path>
      </svg>
    `;
  }

  function getDiceIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="3"></rect>
        <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"></circle>
      </svg>
    `;
  }

  async function sendMessage(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      ...payload,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Falha ao comunicar com a extensão.');
    }

    return response.data;
  }

  function showToast(message, tone = 'default') {
    syncToastHost();
    window.clearTimeout(showToast.timeoutId);
    elements.toast.textContent = message;
    elements.toast.className = `toast ${tone === 'error' ? 'error' : ''}`.trim();
    elements.toast.hidden = false;
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3200);
  }

  function reportError(error) {
    if (error.name !== 'AbortError') {
      showToast(error.message, 'error');
    }
  }

  function closeDialog(dialog) {
    if (dialog.open) {
      dialog.close();
    }
  }

  function getToastHost() {
    const dialogHosts = [
      elements.recordDialog,
      elements.unlockDialog,
      elements.passwordGeneratorDialog,
      elements.deleteDialog,
    ];

    for (let index = dialogHosts.length - 1; index >= 0; index -= 1) {
      if (dialogHosts[index].open) {
        return dialogHosts[index];
      }
    }

    return document.body;
  }

  function syncToastHost() {
    const host = getToastHost();

    if (elements.toast.parentElement !== host) {
      host.appendChild(elements.toast);
    }
  }

  function resetRecordForm() {
    elements.recordForm.reset();
    elements.recordIdInput.value = '';
    elements.formTitle.textContent = 'Nova credencial';
    elements.passwordInput.placeholder = 'Digite ou gere uma senha';
    elements.passwordInput.required = true;
    elements.passwordRequiredMark.hidden = false;
    elements.passwordHelp.textContent = 'A senha será criptografada com a chave do cofre.';
    setPasswordVisibility(false);
  }

  function setPasswordVisibility(visible) {
    elements.passwordInput.type = visible ? 'text' : 'password';
    const label = visible ? 'Ocultar senha' : 'Mostrar senha';
    elements.togglePasswordButton.innerHTML = getIcon(visible ? 'eyeOff' : 'eye');
    elements.togglePasswordButton.setAttribute('aria-label', label);
    elements.togglePasswordButton.title = label;
    elements.togglePasswordButton.setAttribute('aria-pressed', String(visible));
  }

  function populateRecordPrefillForm(prefill) {
    resetRecordForm();
    elements.identifierInput.value = prefill.identifier || '';
    elements.usernameInput.value = prefill.username || '';
    elements.linkInput.value = prefill.link || '';
    elements.hintInput.value = prefill.hint || '';
    elements.passwordInput.value = prefill.plainPassword || '';
  }

  function populateRecordForm(record) {
    resetRecordForm();
    elements.recordIdInput.value = record.id;
    elements.identifierInput.value = record.identifier;
    elements.usernameInput.value = record.username;
    elements.linkInput.value = record.link;
    elements.hintInput.value = record.hint || '';
    elements.passwordInput.value = '';
    elements.passwordInput.placeholder = 'Preencha apenas se quiser substituir a senha atual';
    elements.passwordInput.required = false;
    elements.passwordRequiredMark.hidden = true;
    elements.passwordHelp.textContent = 'Deixe em branco para manter a senha atual.';
    elements.formTitle.textContent = 'Editar credencial';
  }

  function openRecordDialog(record = null, options = {}) {
    if (record) {
      populateRecordForm(record);
    } else if (options.prefill) {
      populateRecordPrefillForm(options.prefill);
    } else {
      resetRecordForm();
    }

    elements.recordDialog.showModal();
    syncToastHost();
    elements.identifierInput.focus();
  }

  function renderPage(options = {}) {
    const settingsVisible = window.location.hash === '#settings';
    elements.vaultPage.hidden = settingsVisible;
    elements.settingsPage.hidden = !settingsVisible;

    for (const [link, active] of [
      [elements.vaultPageLink, !settingsVisible],
      [elements.settingsPageLink, settingsVisible],
    ]) {
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }

    const title = settingsVisible ? 'Configurações' : 'Meu cofre';
    elements.currentPageLabel.textContent = title;
    elements.skipLink.textContent = settingsVisible ? 'Pular para as configurações' : 'Pular para o cofre';
    document.title = `${title} · AngelShield`;

    if (options.focus) {
      window.scrollTo(0, 0);
      const heading = settingsVisible ? elements.settingsPageTitle : elements.vaultPageTitle;
      heading.focus({ preventScroll: true });
    }
    if (options.focusSearch) {
      elements.recordSearchInput.focus();
      elements.recordSearchInput.select();
    }
  }

  function navigateToPage(page, options = {}) {
    const hash = `#${page}`;
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
    renderPage({ focus: true, ...options });
  }

  function getFilteredRecords() {
    const query = normalizeSearch(state.searchQuery.trim());

    if (!query) {
      return state.records;
    }

    return state.records.filter((record) => {
      return [record.identifier, record.username, record.link]
        .some((value) => normalizeSearch(value).includes(query));
    });
  }

  function normalizeSearch(value) {
    return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  }

  function getPageSizeLimit() {
    return state.pageSize === 'all' ? Number.POSITIVE_INFINITY : Number.parseInt(state.pageSize, 10) || 10;
  }

  function getPaginationState(records) {
    const totalItems = records.length;
    const pageSizeLimit = getPageSizeLimit();
    const totalPages = pageSizeLimit === Number.POSITIVE_INFINITY
      ? 1
      : Math.max(1, Math.ceil(totalItems / pageSizeLimit));
    const currentPage = Math.min(Math.max(state.currentPage, 1), totalPages);
    const startIndex = pageSizeLimit === Number.POSITIVE_INFINITY ? 0 : (currentPage - 1) * pageSizeLimit;
    const endIndex = pageSizeLimit === Number.POSITIVE_INFINITY
      ? totalItems
      : Math.min(startIndex + pageSizeLimit, totalItems);

    state.currentPage = currentPage;

    return {
      currentPage,
      endIndex,
      pageRecords: records.slice(startIndex, endIndex),
      startIndex,
      totalItems,
      totalPages,
    };
  }

  function renderVaultControl() {
    const label = state.locked ? 'Destrancar cofre' : 'Trancar cofre';
    const labelWithShortcut = `${label} (Ctrl+L)`;
    elements.vaultButton.innerHTML = state.locked ? getClosedLockIcon() : getOpenLockIcon();
    const text = document.createElement('span');
    text.textContent = label;
    elements.vaultButton.appendChild(text);
    elements.vaultButton.classList.toggle('is-unlocked', !state.locked);
    elements.vaultButton.setAttribute('aria-label', label);
    elements.vaultButton.setAttribute('title', labelWithShortcut);
    elements.vaultButton.setAttribute('aria-keyshortcuts', 'Control+L');
    elements.vaultStatusIcon.innerHTML = state.locked ? getClosedLockIcon() : getOpenLockIcon();
    elements.vaultStatusTitle.textContent = state.locked ? 'Cofre trancado' : 'Cofre destrancado nesta sessão';
    elements.vaultStatusDescription.textContent = state.locked
      ? 'Você pode ver seus registros. Para copiar uma senha, informe sua chave.'
      : 'Suas senhas estão disponíveis para copiar. Tranque o cofre quando terminar.';
  }

  function normalizePasswordLength(value) {
    const parsedValue = Number.parseInt(String(value || '').trim(), 10);

    if (!Number.isFinite(parsedValue)) {
      return 16;
    }

    return Math.min(128, Math.max(1, parsedValue));
  }

  function getRandomIndex(max) {
    if (max <= 1) {
      return 0;
    }

    return crypto.getRandomValues(new Uint32Array(1))[0] % max;
  }

  function shuffleCharacters(characters) {
    const shuffled = [...characters];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = getRandomIndex(index + 1);
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled;
  }

  function generatePassword() {
    const charsets = [PASSWORD_CHARSETS.lowercase];

    if (elements.generatorUppercaseInput.checked) {
      charsets.push(PASSWORD_CHARSETS.uppercase);
    }

    if (elements.generatorNumbersInput.checked) {
      charsets.push(PASSWORD_CHARSETS.numbers);
    }

    if (elements.generatorSpecialInput.checked) {
      charsets.push(PASSWORD_CHARSETS.special);
    }

    const length = normalizePasswordLength(elements.generatorLengthInput.value);
    const pool = charsets.join('');
    const characters = [];

    if (length >= charsets.length) {
      for (const charset of charsets) {
        characters.push(charset[getRandomIndex(charset.length)]);
      }
    }

    while (characters.length < length) {
      characters.push(pool[getRandomIndex(pool.length)]);
    }

    state.generatedPassword = shuffleCharacters(characters).join('');
  }

  function renderPasswordGenerator(syncLengthInput = true) {
    if (syncLengthInput) {
      const length = normalizePasswordLength(elements.generatorLengthInput.value);
      elements.generatorLengthInput.value = String(length);
    }

    elements.generatedPasswordOutput.value = state.generatedPassword;
    elements.copyGeneratedPasswordButton.disabled = !state.generatedPassword;
    elements.insertGeneratedPasswordButton.disabled = !state.generatedPassword;
    elements.insertGeneratedPasswordButton.hidden = !state.generatorInsertTarget;
  }

  function openPasswordGenerator(targetInput = null) {
    state.generatorInsertTarget = targetInput;
    generatePassword();
    renderPasswordGenerator();

    if (!elements.passwordGeneratorDialog.open) {
      elements.passwordGeneratorDialog.showModal();
    }

    syncToastHost();
    if (state.generatedPassword) {
      elements.generatedPasswordOutput.focus();
      elements.generatedPasswordOutput.select();
      return;
    }

    elements.generatePasswordButton.focus();
  }

  function renderStatus() {
    const recordCount = state.records.length;
    elements.recordCountLabel.textContent = `${recordCount} ${recordCount === 1 ? 'credencial' : 'credenciais'}`;
    elements.sidebarRecordCount.textContent = String(recordCount);
    elements.globalSaltInput.value = state.settings?.globalSalt || '';
    renderVaultControl();
  }

  function createActionButton(label, className, handler, iconName = null, iconOnly = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = iconOnly ? `icon-button ${className}` : `button ${className}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (iconName) {
      button.innerHTML = getIcon(iconName);
    }
    if (!iconOnly) {
      const text = document.createElement('span');
      text.textContent = label;
      button.appendChild(text);
    }
    button.addEventListener('click', async () => {
      if (button.disabled) {
        return;
      }
      button.disabled = true;
      let restoreFocus = false;
      try {
        await handler();
      } catch (error) {
        restoreFocus = error.name === 'AbortError';
        reportError(error);
      } finally {
        button.disabled = false;
        if (restoreFocus && button.isConnected) {
          button.focus({ preventScroll: true });
        }
      }
    });
    return button;
  }

  function changePage(page) {
    const pagination = getPaginationState(getFilteredRecords());
    const nextPage = Math.max(1, Math.min(page, pagination.totalPages));
    if (pagination.currentPage === nextPage) {
      return;
    }
    state.currentPage = nextPage;
    renderRecords();
    // Keep the pager in place while replacing its buttons, then move to the new results.
    elements.paginationPages.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    elements.searchResultsLabel.scrollIntoView({ block: 'nearest' });
  }

  function clearSearch() {
    state.searchQuery = '';
    state.currentPage = 1;
    elements.recordSearchInput.value = '';
    renderRecords();
    elements.recordSearchInput.focus();
  }

  function renderPagination(pagination) {
    elements.pageSizeSelect.value = state.pageSize;
    // Keep page-size controls available even when a search has fewer results.
    elements.paginationBar.hidden = state.records.length === 0;
    elements.paginationMeta.textContent = pagination.totalItems
      ? `${pagination.startIndex + 1}–${pagination.endIndex} de ${pagination.totalItems}`
      : '0 resultados';
    elements.paginationPageLabel.textContent = `Página ${pagination.currentPage} de ${pagination.totalPages}`;
    elements.paginationPrevButton.disabled = pagination.currentPage <= 1;
    elements.paginationNextButton.disabled = pagination.currentPage >= pagination.totalPages;
    elements.paginationPages.replaceChildren();

    const pages = new Set([1, pagination.totalPages]);
    for (let page = pagination.currentPage - 1; page <= pagination.currentPage + 1; page += 1) {
      if (page >= 1 && page <= pagination.totalPages) {
        pages.add(page);
      }
    }
    let previousPage = 0;
    for (const page of [...pages].sort((left, right) => left - right)) {
      if (page - previousPage > 1) {
        const gap = document.createElement('span');
        gap.className = 'page-ellipsis';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        elements.paginationPages.appendChild(gap);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-button';
      button.textContent = String(page);
      button.setAttribute('aria-label', `Página ${page} de ${pagination.totalPages}`);
      if (page === pagination.currentPage) {
        button.setAttribute('aria-current', 'page');
      }
      button.addEventListener('click', () => changePage(page));
      elements.paginationPages.appendChild(button);
      previousPage = page;
    }
  }

  function getRecordUrl(link) {
    try {
      const url = new URL(link);
      return ['http:', 'https:'].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  function openDeleteDialog(record) {
    state.pendingDeleteRecord = record;
    elements.deleteDescription.textContent = `“${record.identifier}” será removida deste navegador. Esta ação não pode ser desfeita.`;
    elements.deleteDialog.showModal();
    syncToastHost();
    elements.cancelDeleteButton.focus();
  }

  async function deletePendingRecord(event) {
    event.preventDefault();
    const record = state.pendingDeleteRecord;
    if (!record || elements.confirmDeleteButton.disabled) {
      return;
    }
    elements.confirmDeleteButton.disabled = true;
    try {
      await sendMessage('DELETE_RECORD', { id: record.id });
      closeDialog(elements.deleteDialog);
      await refreshDashboard();
      showToast(`Credencial “${record.identifier}” excluída.`);
      elements.recordsList.querySelector('button')?.focus({ preventScroll: true });
    } finally {
      elements.confirmDeleteButton.disabled = false;
    }
  }

  function renderRecords() {
    const filteredRecords = getFilteredRecords();
    const pagination = getPaginationState(filteredRecords);
    const searching = Boolean(state.searchQuery.trim());
    elements.recordsList.replaceChildren();
    elements.recordsList.setAttribute('aria-busy', 'false');
    elements.recordsEmptyState.hidden = pagination.totalItems > 0;
    elements.recordsColumnHeadings.hidden = pagination.totalItems === 0;
    elements.clearSearchButton.hidden = !state.searchQuery;
    elements.emptyStateIcon.innerHTML = getIcon(searching ? 'search' : 'vault');
    elements.emptyStateTitle.textContent = searching ? 'Nenhuma credencial encontrada' : 'Seu cofre começa aqui';
    elements.emptyStateDescription.textContent = searching
      ? 'Tente outro nome, usuário ou site. Você também pode limpar a busca para ver tudo.'
      : 'Adicione sua primeira credencial para ter seus acessos sempre à mão.';
    elements.emptyStateAction.textContent = searching ? 'Limpar busca' : 'Adicionar credencial';
    elements.emptyStateAction.className = `button ${searching ? 'button-secondary' : 'button-primary'}`;

    const countLabel = `${pagination.totalItems} ${pagination.totalItems === 1 ? 'credencial encontrada' : 'credenciais encontradas'}`;
    elements.searchResultsLabel.textContent = searching
      ? `${countLabel} para “${state.searchQuery.trim()}” · Página ${pagination.currentPage} de ${pagination.totalPages}`
      : `${pagination.totalItems} ${pagination.totalItems === 1 ? 'credencial salva' : 'credenciais salvas'} · Página ${pagination.currentPage} de ${pagination.totalPages}`;
    renderPagination(pagination);

    for (const record of pagination.pageRecords) {
      const card = document.createElement('article');
      card.className = 'record-card';
      card.dataset.recordId = record.id;
      card.tabIndex = -1;
      card.setAttribute('aria-label', record.identifier);

      const identity = document.createElement('div');
      identity.className = 'record-identity';
      const avatar = document.createElement('span');
      const name = record.identifier || '?';
      const colorIndex = Array.from(name).reduce((sum, char) => sum + char.codePointAt(0), 0) % 6;
      avatar.className = `record-avatar avatar-${colorIndex}`;
      avatar.textContent = Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') || '?';
      avatar.setAttribute('aria-hidden', 'true');

      const titleBlock = document.createElement('div');
      titleBlock.className = 'record-title-block';
      const title = document.createElement('h3');
      title.className = 'record-title';
      title.textContent = record.identifier;
      titleBlock.appendChild(title);
      const recordUrl = getRecordUrl(record.link);
      if (recordUrl) {
        const link = document.createElement('a');
        link.className = 'record-link';
        link.href = recordUrl.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = recordUrl.hostname.replace(/^www\./, '');
        link.title = `Abrir ${recordUrl.href} em uma nova aba`;
        link.setAttribute('aria-label', link.title);
        titleBlock.appendChild(link);
      }
      if (record.hint) {
        const hint = document.createElement('p');
        hint.className = 'record-hint';
        hint.textContent = record.hint;
        titleBlock.appendChild(hint);
      }
      identity.append(avatar, titleBlock);

      const username = document.createElement('div');
      username.className = 'record-username';
      const usernameText = document.createElement('span');
      usernameText.textContent = record.username || 'Usuário não informado';
      username.appendChild(usernameText);
      if (record.username) {
        username.appendChild(createActionButton(`Copiar usuário de ${record.identifier}`, '', async () => {
          await navigator.clipboard.writeText(record.username);
          showToast('Usuário copiado.');
        }, 'copy', true));
      }

      const actions = document.createElement('div');
      actions.className = 'record-controls';
      const copyPassword = createActionButton('Copiar senha', 'button-secondary', async () => {
        const secret = await getRecordSecretForAction(record.id, 'Informe sua chave para copiar a senha desta credencial.');
        await navigator.clipboard.writeText(secret.password);
        showToast('Senha copiada.');
      }, 'copy');
      copyPassword.setAttribute('aria-label', `Copiar senha de ${record.identifier}`);
      copyPassword.disabled = !record.hasPassword;
      if (!record.hasPassword) {
        copyPassword.title = 'Esta credencial não tem uma senha salva';
      }
      actions.append(
        copyPassword,
        createActionButton(`Editar ${record.identifier}`, '', () => openRecordDialog(record), 'edit', true),
        createActionButton(`Excluir ${record.identifier}`, 'is-danger', () => openDeleteDialog(record), 'trash', true),
      );
      card.append(identity, username, actions);
      elements.recordsList.appendChild(card);
    }
  }

  async function refreshDashboard(options = {}) {
    const version = ++state.refreshVersion;
    const data = await sendMessage('GET_DASHBOARD_DATA');
    if (version !== state.refreshVersion) {
      return;
    }
    state.locked = data.locked;
    state.records = data.records || [];
    state.settings = data.settings || {};
    if (options.revealId) {
      if (!getFilteredRecords().some((record) => record.id === options.revealId)) {
        state.searchQuery = '';
        elements.recordSearchInput.value = '';
      }
      const index = getFilteredRecords().findIndex((record) => record.id === options.revealId);
      state.currentPage = state.pageSize === 'all' || index < 0
        ? 1
        : Math.floor(index / getPageSizeLimit()) + 1;
    }
    renderStatus();
    renderRecords();
  }

  function openKeyDialog(options = {}) {
    elements.unlockTitle.textContent = options.title || 'Informar chave';
    elements.unlockDescription.textContent =
      options.description || 'Informe sua chave para continuar.';
    elements.unlockConfirmButton.textContent = options.confirmLabel || 'Confirmar';
    elements.unlockKeyInput.value = '';
    elements.unlockDialog.showModal();
    syncToastHost();
    elements.unlockKeyInput.focus();

    return new Promise((resolve, reject) => {
      state.pendingKeyResolver = resolve;
      state.pendingKeyRejecter = reject;
    });
  }

  function settleKeyDialogAsCancelled() {
    const rejecter = state.pendingKeyRejecter;
    state.pendingKeyResolver = null;
    state.pendingKeyRejecter = null;
    closeDialog(elements.unlockDialog);
    elements.unlockKeyInput.value = '';
    rejecter?.(new DOMException('Ação cancelada pelo usuário.', 'AbortError'));
  }

  async function promptKeyForOneOffAction(description, confirmLabel = 'Confirmar') {
    return openKeyDialog({
      title: 'Confirmar chave do cofre',
      description,
      confirmLabel,
    });
  }

  async function unlockVaultExplicitly() {
    const key = await openKeyDialog({
      title: 'Destrancar cofre',
      description: 'Informe sua chave para destrancar o cofre. Ela será mantida apenas na memória desta sessão.',
      confirmLabel: 'Destrancar',
    });

    await sendMessage('UNLOCK_VAULT', { key });
    showToast('Cofre destrancado para esta sessão.');
    await refreshDashboard();
  }

  async function getRecordSecretForAction(recordId, description) {
    if (!state.locked) {
      return sendMessage('GET_RECORD_SECRET', { id: recordId });
    }

    const key = await promptKeyForOneOffAction(description);
    return sendMessage('GET_RECORD_SECRET', {
      id: recordId,
      key,
    });
  }

  async function exportCsv() {
    const data = await sendMessage('EXPORT_CSV');
    const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `angelshield-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast('CSV exportado.');
  }

  async function importCsv(file) {
    const csv = await file.text();

    try {
      const result = await sendMessage('IMPORT_CSV', { csv });
      showToast(`${result.importedCount} registro(s) importado(s).`);
      await refreshDashboard();
      return;
    } catch (error) {
      if (!error.message.includes('O cofre está trancado')) {
        throw error;
      }
    }

    const key = await promptKeyForOneOffAction(
      'Informe sua chave para criptografar temporariamente as senhas em texto puro durante a importação.',
      'Importar',
    );

    const result = await sendMessage('IMPORT_CSV', { csv, key });
    showToast(`${result.importedCount} registro(s) importado(s).`);
    await refreshDashboard();
  }

  async function handleRecordSubmit(event) {
    event.preventDefault();
    if (state.savingRecord) {
      return;
    }
    state.savingRecord = true;
    elements.saveRecordButton.disabled = true;
    elements.saveRecordButton.textContent = 'Salvando…';

    try {
      const record = {
        id: elements.recordIdInput.value,
        identifier: elements.identifierInput.value,
        username: elements.usernameInput.value,
        link: elements.linkInput.value,
        hint: elements.hintInput.value,
        plainPassword: elements.passwordInput.value,
      };

      const payload = { record };
      if (record.plainPassword && state.locked) {
        payload.key = await promptKeyForOneOffAction(
          'Informe sua chave para criptografar esta senha sem destrancar o cofre.',
          'Salvar',
        );
      }

      const savedRecord = await sendMessage('SAVE_RECORD', payload);
      closeDialog(elements.recordDialog);
      resetRecordForm();
      await refreshDashboard({ revealId: savedRecord.id });
      const savedCard = Array.from(elements.recordsList.children)
        .find((card) => card.dataset.recordId === savedRecord.id);
      savedCard?.focus({ preventScroll: true });
      savedCard?.scrollIntoView({ block: 'nearest' });
      showToast(record.id ? 'Credencial atualizada.' : 'Credencial criada.');
    } finally {
      state.savingRecord = false;
      elements.saveRecordButton.disabled = false;
      elements.saveRecordButton.textContent = 'Salvar credencial';
      if (elements.recordDialog.open && !elements.unlockDialog.open) {
        elements.saveRecordButton.focus({ preventScroll: true });
      }
    }
  }

  async function handleSaltSave() {
    if (elements.saveSaltButton.disabled) {
      return;
    }
    elements.saveSaltButton.disabled = true;
    elements.saveSaltButton.textContent = 'Atualizando…';
    try {
      const payload = {
        salt: elements.globalSaltInput.value,
      };

      if (state.records.length > 0 && state.locked) {
        payload.key = await promptKeyForOneOffAction(
          'Informe sua chave para recriptografar os registros com o novo salt sem destrancar o cofre.',
          'Aplicar',
        );
      }

      const result = await sendMessage('CHANGE_GLOBAL_SALT', payload);
      showToast(`Salt global atualizado. ${result.migratedRecords} registro(s) migrado(s).`);
      await refreshDashboard();
    } finally {
      elements.saveSaltButton.disabled = false;
      elements.saveSaltButton.textContent = 'Atualizar salt';
      if (!elements.settingsPage.hidden) {
        elements.saveSaltButton.focus({ preventScroll: true });
      }
    }
  }

  async function handleVaultControlClick() {
    if (state.locked) {
      await unlockVaultExplicitly();
      return;
    }

    await sendMessage('LOCK_VAULT');
    showToast('Cofre trancado.');
    await refreshDashboard();
  }

  async function copyGeneratedPassword() {
    if (!state.generatedPassword) {
      return;
    }

    await navigator.clipboard.writeText(state.generatedPassword);
    showToast('Senha gerada copiada.');
  }

  function insertGeneratedPassword() {
    if (!state.generatorInsertTarget || !state.generatedPassword) {
      return;
    }

    state.generatorInsertTarget.value = state.generatedPassword;
    const targetInput = state.generatorInsertTarget;
    closeDialog(elements.passwordGeneratorDialog);
    targetInput.focus();
    showToast('Senha inserida no formulário.');
  }

  function getRecordPrefillTokenFromUrl() {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get(RECORD_PREFILL_PARAM) || '';
  }

  function clearRecordPrefillTokenFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RECORD_PREFILL_PARAM)) {
      return;
    }

    url.searchParams.delete(RECORD_PREFILL_PARAM);
    window.history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  async function openInitialRecordPrefill() {
    const token = getRecordPrefillTokenFromUrl();
    if (!token) {
      return;
    }

    try {
      const data = await sendMessage('CONSUME_RECORD_PREFILL', { token });
      if (data?.record) {
        navigateToPage('vault');
        openRecordDialog(null, { prefill: data.record });
      }
    } finally {
      clearRecordPrefillTokenFromUrl();
    }
  }

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
  }

  function handleManagerShortcut(event) {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    if (!event.ctrlKey || document.querySelector('dialog[open]')) {
      return;
    }

    if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      navigateToPage('vault', { focusSearch: true });
      return;
    }

    if (event.key.toLowerCase() !== 'l') {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    handleVaultControlClick().catch(reportError);
  }

  function wireEvents() {
    elements.openPasswordGeneratorButton.innerHTML = getDiceIcon();
    elements.openGeneratorButton.querySelector('[data-icon]').innerHTML = getDiceIcon();
    elements.openGeneratorButton.setAttribute('title', 'Gerar senha');
    elements.openRecordModalButton.addEventListener('click', () => openRecordDialog());
    elements.openPasswordGeneratorButton.addEventListener('click', () => openPasswordGenerator(elements.passwordInput));
    elements.closeRecordDialogButton.addEventListener('click', () => closeDialog(elements.recordDialog));
    elements.closePasswordGeneratorDialogButton.addEventListener('click', () => closeDialog(elements.passwordGeneratorDialog));
    elements.copyGeneratedPasswordButton.addEventListener('click', () => {
      copyGeneratedPassword().catch(reportError);
    });
    elements.cancelRecordButton.addEventListener('click', () => closeDialog(elements.recordDialog));
    elements.togglePasswordButton.addEventListener('click', () => {
      setPasswordVisibility(elements.passwordInput.type === 'password');
    });
    elements.clearSearchButton.addEventListener('click', clearSearch);
    elements.emptyStateAction.addEventListener('click', () => {
      if (state.searchQuery.trim()) {
        clearSearch();
      } else {
        openRecordDialog();
      }
    });
    elements.closeDeleteDialogButton.addEventListener('click', () => closeDialog(elements.deleteDialog));
    elements.cancelDeleteButton.addEventListener('click', () => closeDialog(elements.deleteDialog));
    elements.deleteForm.addEventListener('submit', (event) => {
      deletePendingRecord(event).catch(reportError);
    });
    elements.deleteDialog.addEventListener('close', () => {
      state.pendingDeleteRecord = null;
      syncToastHost();
    });
    elements.generatePasswordButton.addEventListener('click', () => {
      generatePassword();
      renderPasswordGenerator();
    });
    elements.insertGeneratedPasswordButton.addEventListener('click', insertGeneratedPassword);
    elements.openGeneratorButton.addEventListener('click', () => openPasswordGenerator());
    elements.vaultButton.addEventListener('click', () => {
      handleVaultControlClick().catch(reportError);
    });
    for (const input of [elements.generatorLengthInput, elements.generatorUppercaseInput, elements.generatorNumbersInput, elements.generatorSpecialInput]) {
      input.addEventListener('change', () => {
        generatePassword();
        renderPasswordGenerator();
      });
    }

    elements.recordSearchInput.addEventListener('input', (event) => {
      state.searchQuery = event.target.value || '';
      state.currentPage = 1;
      renderRecords();
    });
    elements.recordSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.searchQuery) {
        event.preventDefault();
        clearSearch();
      }
    });

    elements.pageSizeSelect.addEventListener('change', (event) => {
      const pageSize = event.target.value;
      state.pageSize = ['10', '50', '100', 'all'].includes(pageSize) ? pageSize : '10';
      state.currentPage = 1;
      renderRecords();
    });

    elements.paginationPrevButton.addEventListener('click', () => {
      changePage(state.currentPage - 1);
    });

    elements.paginationNextButton.addEventListener('click', () => {
      changePage(state.currentPage + 1);
    });

    elements.recordForm.addEventListener('submit', (event) => {
      handleRecordSubmit(event).catch(reportError);
    });

    elements.exportButton.addEventListener('click', () => {
      exportCsv().catch(reportError);
    });

    elements.importButton.addEventListener('click', () => {
      elements.importFileInput.click();
    });

    elements.importFileInput.addEventListener('change', () => {
      const [file] = elements.importFileInput.files || [];
      if (!file) {
        return;
      }

      importCsv(file)
        .catch(reportError)
        .finally(() => {
          elements.importFileInput.value = '';
        });
    });

    elements.saltForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSaltSave().catch(reportError);
    });

    elements.unlockForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = elements.unlockKeyInput.value;

      if (!key.trim()) {
        showToast('Informe uma chave não vazia.', 'error');
        return;
      }

      const resolver = state.pendingKeyResolver;
      elements.unlockKeyInput.value = '';
      state.pendingKeyResolver = null;
      state.pendingKeyRejecter = null;
      closeDialog(elements.unlockDialog);
      resolver?.(key);
    });

    elements.unlockCancelButton.addEventListener('click', settleKeyDialogAsCancelled);

    elements.unlockDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      settleKeyDialogAsCancelled();
    });

    elements.recordDialog.addEventListener('close', () => {
      syncToastHost();
      if (!elements.recordDialog.open) {
        if (state.generatorInsertTarget === elements.passwordInput) {
          closeDialog(elements.passwordGeneratorDialog);
        }
        state.generatorInsertTarget = null;
        resetRecordForm();
      }
    });

    elements.passwordGeneratorDialog.addEventListener('close', () => {
      state.generatorInsertTarget = null;
      syncToastHost();
    });
    elements.passwordGeneratorDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog(elements.passwordGeneratorDialog);
    });
    elements.unlockDialog.addEventListener('close', syncToastHost);
    document.addEventListener('keydown', handleManagerShortcut);
    window.addEventListener('hashchange', () => renderPage({ focus: true }));
    elements.skipLink.addEventListener('click', (event) => {
      event.preventDefault();
      elements.mainContent.focus();
      elements.mainContent.scrollIntoView({ block: 'start' });
    });
  }

  async function init() {
    wireEvents();
    renderPage();
    resetRecordForm();
    renderPasswordGenerator();
    await refreshDashboard();
    await openInitialRecordPrefill();
  }

  init().catch(reportError);
})();
