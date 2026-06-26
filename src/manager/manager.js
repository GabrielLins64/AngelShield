(function bootstrapManager() {
  const RECORD_PREFILL_PARAM = 'recordPrefill';
  const state = {
    currentPage: 1,
    locked: true,
    pageSize: '10',
    pendingKeyRejecter: null,
    pendingKeyResolver: null,
    records: [],
    searchQuery: '',
    settings: null,
  };

  const elements = {
    clearFormButton: document.getElementById('clear-form-button'),
    closeRecordDialogButton: document.getElementById('close-record-dialog-button'),
    closeSettingsDialogButton: document.getElementById('close-settings-dialog-button'),
    exportButton: document.getElementById('export-button'),
    formTitle: document.getElementById('form-title'),
    globalSaltInput: document.getElementById('global-salt-input'),
    hintInput: document.getElementById('hint-input'),
    identifierInput: document.getElementById('identifier-input'),
    importButton: document.getElementById('import-button'),
    importFileInput: document.getElementById('import-file-input'),
    linkInput: document.getElementById('link-input'),
    openRecordModalButton: document.getElementById('open-record-modal-button'),
    openSettingsModalButton: document.getElementById('open-settings-modal-button'),
    passwordInput: document.getElementById('password-input'),
    paginationBar: document.getElementById('pagination-bar'),
    paginationMeta: document.getElementById('pagination-meta'),
    paginationNextButton: document.getElementById('pagination-next-button'),
    paginationPageLabel: document.getElementById('pagination-page-label'),
    paginationPrevButton: document.getElementById('pagination-prev-button'),
    pageSizeSelect: document.getElementById('page-size-select'),
    recordCountLabel: document.getElementById('record-count-label'),
    recordDialog: document.getElementById('record-dialog'),
    recordForm: document.getElementById('record-form'),
    recordIdInput: document.getElementById('record-id'),
    recordSearchInput: document.getElementById('record-search-input'),
    recordsEmptyState: document.getElementById('records-empty-state'),
    recordsList: document.getElementById('records-list'),
    saveSaltButton: document.getElementById('save-salt-button'),
    settingsDialog: document.getElementById('settings-dialog'),
    toast: document.getElementById('toast'),
    unlockCancelButton: document.getElementById('unlock-cancel-button'),
    unlockConfirmButton: document.getElementById('unlock-confirm-button'),
    unlockDescription: document.getElementById('unlock-description'),
    unlockDialog: document.getElementById('unlock-dialog'),
    unlockForm: document.getElementById('unlock-form'),
    unlockKeyInput: document.getElementById('unlock-key-input'),
    unlockTitle: document.getElementById('unlock-title'),
    usernameInput: document.getElementById('username-input'),
    vaultFab: document.getElementById('vault-fab'),
  };

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

  function closeDialog(dialog) {
    if (dialog.open) {
      dialog.close();
    }
  }

  function getToastHost() {
    const dialogHosts = [
      elements.recordDialog,
      elements.settingsDialog,
      elements.unlockDialog,
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
    elements.formTitle.textContent = 'Novo registro';
    elements.passwordInput.placeholder = 'Nova senha ou deixe em branco para manter a atual';
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
    elements.recordIdInput.value = record.id;
    elements.identifierInput.value = record.identifier;
    elements.usernameInput.value = record.username;
    elements.linkInput.value = record.link;
    elements.hintInput.value = record.hint || '';
    elements.passwordInput.value = '';
    elements.passwordInput.placeholder = 'Preencha apenas se quiser substituir a senha atual';
    elements.formTitle.textContent = `Editando: ${record.identifier}`;
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

  function openSettingsDialog() {
    elements.settingsDialog.showModal();
    syncToastHost();
    elements.globalSaltInput.focus();
  }

  function getFilteredRecords() {
    const query = state.searchQuery.trim().toLowerCase();

    if (!query) {
      return state.records;
    }

    return state.records.filter((record) => {
      const identifier = (record.identifier || '').toLowerCase();
      const username = (record.username || '').toLowerCase();
      return identifier.includes(query) || username.includes(query);
    });
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
      pageSizeLimit,
      shouldPaginate: totalItems > 10,
      startIndex,
      totalItems,
      totalPages,
    };
  }

  function renderVaultFab() {
    const label = state.locked ? 'Destrancar' : 'Trancar';
    const labelWithShortcut = `${label} (Ctrl+L)`;
    elements.vaultFab.innerHTML = state.locked ? getClosedLockIcon() : getOpenLockIcon();
    elements.vaultFab.setAttribute('aria-label', label);
    elements.vaultFab.setAttribute('title', labelWithShortcut);
    elements.vaultFab.setAttribute('data-tooltip', labelWithShortcut);
    elements.vaultFab.setAttribute('aria-keyshortcuts', 'Control+L');
  }

  function renderStatus() {
    const recordCount = state.records.length;
    elements.recordCountLabel.textContent = `${recordCount} registro${recordCount === 1 ? '' : 's'}`;
    elements.globalSaltInput.value = state.settings?.globalSalt || '';
    renderVaultFab();
  }

  function createActionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener('click', handler);
    return button;
  }

  function renderPagination(pagination) {
    elements.pageSizeSelect.value = state.pageSize;

    if (!pagination.shouldPaginate) {
      elements.paginationBar.hidden = true;
      return;
    }

    elements.paginationBar.hidden = false;
    elements.paginationMeta.textContent = `Mostrando ${pagination.startIndex + 1}-${pagination.endIndex} de ${pagination.totalItems}`;
    elements.paginationPageLabel.textContent = `Página ${pagination.currentPage} de ${pagination.totalPages}`;
    elements.paginationPrevButton.disabled = pagination.currentPage <= 1;
    elements.paginationNextButton.disabled = pagination.currentPage >= pagination.totalPages;

    if (pagination.pageSizeLimit === Number.POSITIVE_INFINITY) {
      elements.paginationPageLabel.textContent = 'Todos os registros';
    }
  }

  function renderRecords() {
    const filteredRecords = getFilteredRecords();
    const pagination = getPaginationState(filteredRecords);
    elements.recordsList.innerHTML = '';
    elements.recordsEmptyState.hidden = filteredRecords.length > 0;
    elements.recordsEmptyState.textContent = state.searchQuery.trim()
      ? 'Nenhum registro corresponde à busca.'
      : 'Nenhum registro salvo ainda. Clique em "Novo registro" para começar.';

    renderPagination(pagination);

    for (const record of pagination.pageRecords) {
      const card = document.createElement('article');
      card.className = 'record-card';

      const layout = document.createElement('div');
      layout.className = 'record-layout';

      const contentBlock = document.createElement('div');
      contentBlock.className = 'record-main';

      const topLine = document.createElement('div');
      topLine.className = 'record-topline';

      const titleBlock = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'record-title';
      title.textContent = record.identifier;
      titleBlock.appendChild(title);

      if (record.link) {
        const link = document.createElement('a');
        link.className = 'record-link';
        link.href = record.link;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = record.link;
        titleBlock.appendChild(link);
      }

      topLine.appendChild(titleBlock);

      // if (record.hasPassword) {
      //   const tag = document.createElement('span');
      //   tag.className = 'tag';
      //   tag.textContent = 'Senha protegida';
      //   topLine.appendChild(tag);
      // }

      const meta = document.createElement('div');
      meta.className = 'meta-line';
      const usernameMeta = document.createElement('span');
      usernameMeta.textContent = `Usuário: ${record.username || 'não informado'}`;
      meta.append(usernameMeta);

      const hint = document.createElement('p');
      hint.className = 'panel-note';
      hint.textContent = record.hint || 'Sem dica cadastrada.';

      const copyActions = document.createElement('div');
      copyActions.className = 'copy-actions';
      copyActions.appendChild(
        createActionButton('Copiar usuário', 'button-secondary', async () => {
          await navigator.clipboard.writeText(record.username || '');
          showToast(`Usuário de "${record.identifier}" copiado.`);
        }),
      );
      copyActions.appendChild(
        createActionButton('Copiar senha', 'button-secondary', async () => {
          const secret = await getRecordSecretForAction(
            record.id,
            'Informe a key para descriptografar e copiar a senha deste registro.',
          );
          await navigator.clipboard.writeText(secret.password);
          showToast(`Senha de "${record.identifier}" copiada.`);
        }),
      );

      const cardActions = document.createElement('div');
      cardActions.className = 'card-actions';
      cardActions.appendChild(
        createActionButton('Editar', 'button-secondary', () => openRecordDialog(record)),
      );
      cardActions.appendChild(
        createActionButton('Remover', 'button-danger', async () => {
          const confirmed = window.confirm(`Remover o registro "${record.identifier}"?`);
          if (!confirmed) {
            return;
          }

          await sendMessage('DELETE_RECORD', { id: record.id });
          showToast(`Registro "${record.identifier}" removido.`);
          await refreshDashboard();
        }),
      );

      const actionsBlock = document.createElement('div');
      actionsBlock.className = 'record-controls';
      actionsBlock.append(copyActions, cardActions);

      contentBlock.append(topLine, meta, hint);
      layout.append(contentBlock, actionsBlock);
      card.append(layout);
      elements.recordsList.appendChild(card);
    }
  }

  async function refreshDashboard() {
    const data = await sendMessage('GET_DASHBOARD_DATA');
    state.locked = data.locked;
    state.records = data.records || [];
    state.settings = data.settings || {};
    renderStatus();
    renderRecords();
  }

  function openKeyDialog(options = {}) {
    elements.unlockTitle.textContent = options.title || 'Informar key';
    elements.unlockDescription.textContent =
      options.description || 'Informe a key para continuar.';
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
    rejecter?.(new Error('Ação cancelada pelo usuário.'));
  }

  async function promptKeyForOneOffAction(description, confirmLabel = 'Usar key') {
    return openKeyDialog({
      title: 'Usar key temporariamente',
      description,
      confirmLabel,
    });
  }

  async function unlockVaultExplicitly() {
    const key = await openKeyDialog({
      title: 'Destrancar cofre',
      description: 'Informe a key para mantê-la em memória e destrancar o cofre nesta sessão.',
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
      'Informe a key para criptografar temporariamente as senhas em texto puro durante a importação.',
      'Importar',
    );

    const result = await sendMessage('IMPORT_CSV', { csv, key });
    showToast(`${result.importedCount} registro(s) importado(s).`);
    await refreshDashboard();
  }

  async function handleRecordSubmit(event) {
    event.preventDefault();

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
        'Informe a key para criptografar esta senha sem destrancar o cofre.',
        'Salvar',
      );
    }

    await sendMessage('SAVE_RECORD', payload);
    showToast(record.id ? 'Registro atualizado.' : 'Registro criado.');
    closeDialog(elements.recordDialog);
    resetRecordForm();
    await refreshDashboard();
  }

  async function handleSaltSave() {
    const payload = {
      salt: elements.globalSaltInput.value,
    };

    if (state.records.length > 0 && state.locked) {
      payload.key = await promptKeyForOneOffAction(
        'Informe a key para recriptografar os registros com o novo salt sem destrancar o cofre.',
        'Aplicar',
      );
    }

    const result = await sendMessage('CHANGE_GLOBAL_SALT', payload);
    showToast(`Salt global atualizado. ${result.migratedRecords} registro(s) migrado(s).`);
    await refreshDashboard();
  }

  async function handleVaultFabClick() {
    if (state.locked) {
      await unlockVaultExplicitly();
      return;
    }

    await sendMessage('LOCK_VAULT');
    showToast('Cofre trancado.');
    await refreshDashboard();
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

    if (!event.ctrlKey || event.key.toLowerCase() !== 'l') {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    handleVaultFabClick().catch((error) => showToast(error.message, 'error'));
  }

  function wireEvents() {
    elements.openRecordModalButton.addEventListener('click', () => openRecordDialog());
    elements.openSettingsModalButton.addEventListener('click', openSettingsDialog);
    elements.closeRecordDialogButton.addEventListener('click', () => closeDialog(elements.recordDialog));
    elements.closeSettingsDialogButton.addEventListener('click', () => closeDialog(elements.settingsDialog));
    elements.clearFormButton.addEventListener('click', resetRecordForm);
    elements.vaultFab.addEventListener('click', () => {
      handleVaultFabClick().catch((error) => showToast(error.message, 'error'));
    });

    elements.recordSearchInput.addEventListener('input', (event) => {
      state.searchQuery = event.target.value || '';
      state.currentPage = 1;
      renderRecords();
    });

    elements.pageSizeSelect.addEventListener('change', (event) => {
      state.pageSize = event.target.value || '10';
      state.currentPage = 1;
      renderRecords();
    });

    elements.paginationPrevButton.addEventListener('click', () => {
      if (state.currentPage <= 1) {
        return;
      }

      state.currentPage -= 1;
      renderRecords();
    });

    elements.paginationNextButton.addEventListener('click', () => {
      state.currentPage += 1;
      renderRecords();
    });

    elements.recordForm.addEventListener('submit', (event) => {
      handleRecordSubmit(event).catch((error) => showToast(error.message, 'error'));
    });

    elements.exportButton.addEventListener('click', () => {
      exportCsv().catch((error) => showToast(error.message, 'error'));
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
        .catch((error) => showToast(error.message, 'error'))
        .finally(() => {
          elements.importFileInput.value = '';
        });
    });

    elements.saveSaltButton.addEventListener('click', () => {
      handleSaltSave().catch((error) => showToast(error.message, 'error'));
    });

    elements.unlockForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = elements.unlockKeyInput.value;

      if (!key.trim()) {
        showToast('Informe uma key não vazia.', 'error');
        return;
      }

      const resolver = state.pendingKeyResolver;
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
        resetRecordForm();
      }
    });

    elements.settingsDialog.addEventListener('close', syncToastHost);
    elements.unlockDialog.addEventListener('close', syncToastHost);
    document.addEventListener('keydown', handleManagerShortcut);
  }

  async function init() {
    wireEvents();
    resetRecordForm();
    await refreshDashboard();
    await openInitialRecordPrefill();
  }

  init().catch((error) => showToast(error.message, 'error'));
})();
