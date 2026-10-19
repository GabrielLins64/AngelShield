(function bootstrapDriveManager() {
  const manager = window.AngelShieldManager;
  const names = [
    'google-configure', 'google-config-dialog', 'google-config-title', 'google-close-config', 'google-cancel-config',
    'google-config-form', 'google-client-id', 'google-client-secret', 'google-folder-name',
    'google-save-config', 'google-clear-oauth', 'google-redirect-url', 'google-connect',
    'google-disconnect', 'google-connection-status', 'google-config-connection-status', 'google-config-connection-help',
    'drive-import-action', 'drive-export-action', 'drive-sync-panel', 'drive-version-placeholder', 'drive-local-version', 'drive-remote-version', 'drive-list-versions', 'drive-upload',
    'drive-recover-pending', 'drive-operation-status', 'drive-versions', 'drive-review-dialog', 'drive-close-review',
    'drive-review-title', 'drive-review-description', 'drive-review-local', 'drive-review-remote',
    'drive-review-remote-info', 'drive-conflict-actions', 'drive-use-local', 'drive-use-remote',
    'drive-show-differences', 'drive-comparison-summary', 'drive-differences', 'drive-choose-merge',
    'drive-confirmation', 'drive-confirmation-text', 'drive-apply',
  ];
  const elements = Object.fromEntries(names.map((name) => [name, document.getElementById(name)]));
  const state = {
    data: null, review: null, differences: [], choices: new Map(), busy: false, committing: false, mode: '', generation: 0,
    connection: 'disconnected', connectionError: '', validationGeneration: 0, needsValidation: true,
    remoteVersion: null, remoteVersionStatus: 'idle', remoteVersionError: '', remoteVersionGeneration: 0,
    configLoading: false, configLoadGeneration: 0,
  };
  const dialog = elements['drive-review-dialog'];
  const configDialog = elements['google-config-dialog'];
  const dateLabel = (value) => new Date(value).toLocaleString('pt-BR');
  const revisionLabel = (revision) => `v${revision.number} · ${dateLabel(revision.updatedAt)}`;

  async function send(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...payload });
    if (!response?.success) {
      const error = new Error(response?.error || 'Não foi possível comunicar com a extensão.');
      error.code = response?.code;
      throw error;
    }
    return response.data;
  }

  function controls() {
    const connected = state.connection === 'connected' && Boolean(state.data?.connected);
    const configured = Boolean(state.data?.config?.clientId && state.data?.config?.hasClientSecret);
    for (const name of ['google-save-config', 'google-client-id', 'google-client-secret', 'google-folder-name']) elements[name].disabled = state.busy || state.configLoading;
    for (const name of ['google-clear-oauth', 'google-close-config', 'google-cancel-config']) elements[name].disabled = state.busy;
    elements['google-configure'].disabled = state.busy;
    elements['google-connect'].disabled = state.busy || state.configLoading || !configured;
    elements['google-connect'].title = !configured ? 'Salve Client ID e Client Secret em Configurar Integração com Google.'
      : connected ? 'Conectar novamente ou trocar a conta Google' : '';
    elements['google-disconnect'].disabled = state.busy || state.configLoading || !state.data?.connected;
    for (const name of ['drive-list-versions', 'drive-upload', 'drive-recover-pending']) {
      elements[name].disabled = state.busy || !connected;
    }
    for (const [name, help] of [['drive-import-action', 'drive-import-help'], ['drive-export-action', 'drive-export-help']]) {
      const wrapper = elements[name];
      wrapper.dataset.unavailable = String(!connected);
      wrapper.tabIndex = connected ? -1 : 0;
      for (const target of [wrapper, wrapper.querySelector('button')]) {
        if (connected) target.removeAttribute('aria-describedby');
        else target.setAttribute('aria-describedby', help);
      }
    }
    const label = { disconnected: 'Não conectado', validating: 'Validando conexão...', connected: 'Conectado' }[state.connection];
    const account = state.data?.account?.email || state.data?.account?.name;
    for (const name of ['google-connection-status', 'google-config-connection-status']) {
      elements[name].textContent = name === 'google-config-connection-status' && connected && account ? `${label} · ${account}` : label;
      elements[name].dataset.state = state.connection;
    }
    elements['google-config-connection-help'].textContent = state.connectionError || (state.connection === 'validating'
      ? 'Verificando a autorização salva com o Google Drive…'
      : connected ? 'Sua conta está pronta para importar e exportar backups manualmente.'
        : 'Siga os passos acima, salve Client ID e Client Secret e conecte sua conta Google.');
    elements['drive-sync-panel'].hidden = !connected;
    elements['drive-version-placeholder'].hidden = connected;
    for (const name of ['drive-use-local', 'drive-use-remote', 'drive-show-differences', 'drive-review-remote', 'drive-apply']) elements[name].disabled = state.busy;
    for (const select of elements['drive-differences'].querySelectorAll('select')) select.disabled = state.busy;
    elements['drive-show-differences'].textContent = manager.locked ? 'Destrancar e mostrar diferenças' : 'Mostrar diferenças';
    elements['drive-choose-merge'].disabled = state.busy || state.differences.some((item) => !state.choices.has(item.id));
    for (const button of elements['drive-versions'].querySelectorAll('button')) button.disabled = state.busy || !connected;
    elements['drive-close-review'].disabled = state.committing;
  }

  function render(data, fillForm = false) {
    state.data = { ...state.data, ...data };
    if (!state.data.connected && state.connection === 'connected') state.connection = 'disconnected';
    const settings = state.data.config;
    if (fillForm) {
      elements['google-client-id'].value = settings?.clientId || '';
      elements['google-folder-name'].value = settings?.folderName || 'AngelShield';
    }
    elements['google-redirect-url'].value = state.data.redirectUrl || chrome.identity?.getRedirectURL('google') || '';
    elements['google-disconnect'].hidden = !state.data.connected;
    if (state.data.revision) elements['drive-local-version'].textContent = `Versão local: ${revisionLabel(state.data.revision)}`;
    elements['drive-recover-pending'].hidden = !state.data.pendingUpload;
    controls();
  }

  async function refresh() {
    render(await send('DRIVE_GET_STATE'));
    validateWhenVisible();
  }

  function renderRemoteVersion() {
    const element = elements['drive-remote-version'];
    element.title = '';
    if (state.remoteVersionStatus === 'loading') element.textContent = 'Versão no Drive: consultando…';
    else if (state.remoteVersionStatus === 'error') {
      element.textContent = 'Versão no Drive: indisponível';
      element.title = state.remoteVersionError;
    } else if (state.remoteVersionStatus !== 'ready') element.textContent = 'Versão no Drive: não consultada';
    else if (!state.remoteVersion.latest) element.textContent = 'Versão no Drive: nenhum backup';
    else {
      const heads = state.remoteVersion.heads;
      element.textContent = `Versão no Drive: ${revisionLabel(state.remoteVersion.latest)}${heads.length > 1 ? ` · ${heads.length} ramificações` : ''}`;
      if (heads.length > 1) element.title = heads.map(revisionLabel).join('\n');
    }
  }

  function setRemoteVersion(version) {
    if (!version || !Array.isArray(version.heads)) throw new Error('Resposta inválida ao consultar a versão no Drive.');
    state.remoteVersion = version;
    state.remoteVersionStatus = 'ready';
    state.remoteVersionError = '';
    renderRemoteVersion();
    state.remoteVersionGeneration += 1;
  }

  function remoteVersionFromList(result) {
    if (!Array.isArray(result.versions)) throw new Error('Resposta inválida ao consultar o histórico do Drive.');
    const heads = result.versions.filter((item) => item.head).map((item) => item.revision);
    if (result.versions.length && !heads.length) throw new Error('O histórico do Drive não informa suas versões atuais.');
    return { latest: heads[0] || null, heads };
  }

  async function refreshRemoteVersion() {
    if (state.connection !== 'connected' || !state.data?.connected) return;
    const generation = ++state.remoteVersionGeneration;
    state.remoteVersion = null;
    state.remoteVersionStatus = 'loading';
    state.remoteVersionError = '';
    renderRemoteVersion();
    try {
      const result = await send('DRIVE_LIST_VERSIONS');
      if (generation !== state.remoteVersionGeneration) return;
      setRemoteVersion(remoteVersionFromList(result));
    } catch (error) {
      if (generation !== state.remoteVersionGeneration) return;
      state.remoteVersionStatus = 'error';
      state.remoteVersionError = error.message;
      renderRemoteVersion();
    }
  }

  function invalidateConnection() {
    state.validationGeneration += 1;
    state.connection = 'disconnected';
    state.connectionError = '';
    state.needsValidation = true;
    state.remoteVersionGeneration += 1;
    state.remoteVersion = null;
    state.remoteVersionStatus = 'idle';
    state.remoteVersionError = '';
    renderRemoteVersion();
    controls();
  }

  function validateWhenVisible() {
    if (window.location.hash === '#settings' && state.data?.config && state.needsValidation && !state.busy) {
      validateConnection();
    }
  }

  async function validateConnection() {
    const generation = ++state.validationGeneration;
    state.needsValidation = false;
    state.connectionError = '';
    const configured = state.data?.config?.clientId && state.data?.config?.hasClientSecret;
    state.connection = configured ? 'validating' : 'disconnected';
    controls();
    if (!configured) return;
    try {
      const result = await send('DRIVE_VALIDATE_CONNECTION');
      if (generation !== state.validationGeneration) return;
      state.connection = result.connectionValid && result.connected ? 'connected' : 'disconnected';
      state.connectionError = result.connectionError || '';
      render(result);
      if (state.connection === 'connected') refreshRemoteVersion();
    } catch (error) {
      if (generation !== state.validationGeneration) return;
      state.connection = 'disconnected';
      state.connectionError = error.message;
      controls();
    }
  }

  function cancelConfigLoad() {
    state.configLoadGeneration += 1;
    state.configLoading = false;
  }

  async function loadConfig() {
    const generation = ++state.configLoadGeneration;
    state.configLoading = true;
    controls();
    try {
      const settings = await send('DRIVE_GET_CONFIG');
      if (generation !== state.configLoadGeneration || !configDialog.open) return;
      elements['google-client-id'].value = settings.clientId || '';
      elements['google-client-secret'].value = settings.clientSecret || '';
      elements['google-folder-name'].value = settings.folderName || 'AngelShield';
    } catch (error) {
      if (generation === state.configLoadGeneration && configDialog.open) manager.reportError(error);
    } finally {
      if (generation === state.configLoadGeneration) {
        state.configLoading = false;
        controls();
      }
    }
  }

  function openConfig() {
    if (state.busy) return;
    render(state.data || {}, true);
    elements['google-client-secret'].value = '';
    configDialog.showModal();
    elements['google-config-title'].focus();
    loadConfig();
  }

  function closeConfig() {
    if (!state.busy) manager.closeDialog(configDialog);
  }

  async function run(action, status) {
    if (state.busy) return;
    state.busy = true;
    controls();
    if (status) elements['drive-operation-status'].textContent = status;
    try {
      await action();
    } catch (error) {
      if (error.code === 'CONTEXT_EXPIRED') closeReview(true);
      if (['GOOGLE_AUTH', 'GOOGLE_RECONNECT', 'NETWORK_ERROR', 'DRIVE_FORBIDDEN'].includes(error.code)) {
        invalidateConnection();
        state.needsValidation = false;
        state.connectionError = error.message;
      }
      manager.reportError(error);
      elements['drive-operation-status'].textContent = error.name === 'AbortError' ? 'Operação cancelada.' : error.message;
    } finally {
      state.busy = false;
      state.committing = false;
      await refresh().catch(manager.reportError);
      controls();
    }
  }

  async function withKey(action) {
    await manager.refreshDashboard();
    if (!manager.locked) return action();
    let key = await manager.promptKeyForOneOffAction('Informe sua chave para esta operação no Drive, sem destrancar o cofre.', 'Continuar');
    try { return await action(key); } finally { key = ''; }
  }

  function clearDifferences() {
    state.differences = [];
    state.choices.clear();
    elements['drive-differences'].replaceChildren();
    elements['drive-comparison-summary'].textContent = '';
    elements['drive-choose-merge'].hidden = true;
  }

  function closeReview(force = false) {
    if (state.committing && !force) return;
    manager.closeDialog(dialog);
  }

  function cleanupReview() {
    const previous = state.review;
    state.review = null;
    state.generation += 1;
    state.mode = '';
    clearDifferences();
    elements['drive-confirmation'].hidden = true;
    if (previous) send('DRIVE_DISCARD_CONTEXT', { contextId: previous.contextId }).catch(() => {});
  }

  function selectedRemote() {
    return state.review?.versions.find((item) => item.fileId === elements['drive-review-remote'].value);
  }

  function remoteInfo() {
    const selected = selectedRemote();
    elements['drive-review-remote-info'].textContent = selected ? `${revisionLabel(selected.revision)} · ${selected.name}` : 'Nenhuma versão publicada.';
  }

  function chooseMode(mode) {
    state.mode = mode;
    const review = state.review;
    if (!review) return;
    const number = Math.max(review.local.revision.number, ...review.versions.map((item) => item.revision.number)) + 1;
    const messages = {
      upload: `Enviar a versão local v${review.local.revision.number} para o Drive. O conteúdo local será preservado.`,
      download: `Substituir toda a lista local pela cópia ${selectedRemote() ? `v${selectedRemote().revision.number}` : ''} do Drive, incluindo as remoções dessa cópia.`,
      local: `Publicar a cópia local como v${number} e atualizar os dois lados com esse conteúdo.`,
      remote: `Publicar a cópia selecionada do Drive como v${number} e substituir a lista local por esse conteúdo.`,
      merge: `Publicar o resultado das escolhas como v${number} e atualizar a lista local com o mesmo resultado.`,
    };
    const otherCopies = review.versions.length > 1 && ['remote', 'merge'].includes(mode)
      ? ' As outras cópias remotas permanecem apenas no histórico.' : '';
    elements['drive-confirmation-text'].textContent = messages[mode] + otherCopies;
    elements['drive-apply'].textContent = mode === 'upload' ? 'Confirmar envio' : mode === 'download' ? 'Confirmar substituição local' : 'Publicar e atualizar cofre';
    elements['drive-confirmation'].hidden = false;
  }

  function openReview(review) {
    cleanupReview();
    state.review = review;
    const conflict = review.status === 'conflict';
    elements['drive-review-title'].textContent = conflict ? 'Resolver conflito de versões' : 'Confirmar sincronização';
    elements['drive-review-description'].textContent = conflict
      ? 'As cópias têm históricos diferentes. Escolha uma cópia inteira ou compare as credenciais. Datas diferentes não resolvem um conflito de numeração.'
      : 'Confira as cópias antes de confirmar esta operação manual.';
    elements['drive-review-local'].textContent = `${revisionLabel(review.local.revision)} · ${review.local.count} credencial(is)`;
    elements['drive-review-remote'].replaceChildren(...review.versions.map((item) => new Option(revisionLabel(item.revision), item.fileId)));
    elements['drive-review-remote'].value = review.selectedFileId;
    if (!elements['drive-review-remote'].value && review.versions.length) elements['drive-review-remote'].selectedIndex = 0;
    elements['drive-conflict-actions'].hidden = !conflict;
    remoteInfo();
    if (!conflict) chooseMode(review.action);
    dialog.showModal();
    elements['drive-close-review'].focus();
    controls();
  }

  async function begin(action, fileId) {
    const generation = state.generation;
    const connectionGeneration = state.validationGeneration;
    const review = await withKey((key) => send('DRIVE_PREPARE', { action, fileId, ...(key ? { key } : {}) }));
    if (generation !== state.generation || connectionGeneration !== state.validationGeneration) {
      if (review.contextId) await send('DRIVE_DISCARD_CONTEXT', { contextId: review.contextId });
      return;
    }
    if (review.remoteVersion) setRemoteVersion(review.remoteVersion);
    else refreshRemoteVersion();
    if (review.status === 'unchanged') {
      manager.showToast('Esta versão já corresponde à cópia atual.');
      elements['drive-operation-status'].textContent = 'As cópias desta revisão já correspondem.';
      return;
    }
    openReview(review);
    elements['drive-operation-status'].textContent = 'Revisão pronta. Nenhuma lista foi substituída.';
  }

  async function listVersions() {
    const generation = state.validationGeneration;
    const result = await send('DRIVE_LIST_VERSIONS');
    if (generation !== state.validationGeneration) return;
    render(result.state);
    setRemoteVersion(remoteVersionFromList(result));
    elements['drive-versions'].replaceChildren();
    for (const item of result.versions) {
      const article = document.createElement('article');
      article.className = 'drive-version';
      const description = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${revisionLabel(item.revision)}${item.head ? ' · ponta do histórico' : ''}`;
      const name = document.createElement('p');
      name.className = 'field-help';
      name.textContent = item.name;
      description.append(title, name);
      const button = document.createElement('button');
      button.className = 'button button-secondary';
      button.type = 'button';
      button.textContent = 'Baixar / revisar';
      button.addEventListener('click', () => run(() => begin('download', item.fileId), 'Consultando as cópias para download…'));
      article.append(description, button);
      elements['drive-versions'].appendChild(article);
    }
    elements['drive-operation-status'].textContent = result.versions.length
      ? `${result.versions.length} versão(ões) consultada(s) em ${new Date().toLocaleTimeString('pt-BR')}.${result.branched ? ' Há ramificações que precisam de resolução manual.' : ''}`
      : 'Nenhuma versão encontrada. O primeiro envio criará o backup na pasta configurada.';
  }

  function side(record, label) {
    const panel = document.createElement('section');
    panel.className = 'drive-record-side';
    const heading = document.createElement('h4');
    heading.textContent = label;
    panel.appendChild(heading);
    if (!record) {
      const absent = document.createElement('p');
      absent.className = 'field-help';
      absent.textContent = 'Não existe nesta cópia.';
      panel.appendChild(absent);
      return panel;
    }
    for (const [field, title] of [['identifier', 'Nome'], ['username', 'Usuário'], ['link', 'Site'], ['hint', 'Observação']]) {
      const line = document.createElement('p');
      line.textContent = `${title}: ${record[field] || '—'}`;
      panel.appendChild(line);
    }
    const passwordLabel = document.createElement('label');
    passwordLabel.className = 'field';
    const text = document.createElement('span');
    text.textContent = `Senha · ${label}`;
    const row = document.createElement('div');
    row.className = 'input-action-row';
    const input = document.createElement('input');
    input.type = 'password';
    input.value = record.password;
    input.readOnly = true;
    input.autocomplete = 'off';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'button button-secondary';
    toggle.textContent = 'Mostrar';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Ocultar' : 'Mostrar';
      toggle.setAttribute('aria-pressed', String(show));
    });
    row.append(input, toggle);
    passwordLabel.append(text, row);
    panel.appendChild(passwordLabel);
    return panel;
  }

  function renderDifferences(result) {
    clearDifferences();
    state.differences = result.differences;
    elements['drive-comparison-summary'].textContent = `${result.differences.length} diferença(s), ${result.equalCount} credencial(is) igual(is). Escolha o resultado de cada diferença. O salt usado é somente o deste navegador.`;
    const labels = { localOnly: 'Somente neste navegador', driveOnly: 'Somente no Drive', different: 'Presentes em ambos com valores diferentes' };
    for (const type of ['localOnly', 'driveOnly', 'different']) {
      const differences = result.differences.filter((item) => item.type === type);
      const group = document.createElement('section');
      group.className = 'drive-diff-group';
      const title = document.createElement('h3');
      title.textContent = `${labels[type]} (${differences.length})`;
      group.appendChild(title);
      for (const difference of differences) {
        const article = document.createElement('article');
        article.className = 'drive-diff-record';
        const heading = document.createElement('h4');
        heading.textContent = (difference.local || difference.drive).identifier;
        const changed = document.createElement('p');
        changed.className = 'field-help';
        const fieldNames = { identifier: 'nome', username: 'usuário', link: 'site', hint: 'observação', password: 'senha' };
        changed.textContent = type === 'different'
          ? `Campos diferentes: ${difference.changedFields.map((field) => fieldNames[field]).join(', ')}.` : '';
        const grid = document.createElement('div');
        grid.className = 'drive-copy-grid';
        grid.append(side(difference.local, 'Local'), side(difference.drive, 'Drive'));
        const label = document.createElement('label');
        label.className = 'field';
        const text = document.createElement('span');
        text.textContent = `Resultado para ${heading.textContent}`;
        const select = document.createElement('select');
        select.add(new Option('Escolha o resultado…', ''));
        const choices = type === 'different' ? [['local', 'Manter versão local'], ['drive', 'Manter versão do Drive']]
          : [[type === 'localOnly' ? 'local' : 'drive', 'Incluir na lista final'], ['remove', 'Remover da lista final']];
        for (const [value, name] of choices) select.add(new Option(name, value));
        select.addEventListener('change', () => {
          if (select.value) state.choices.set(difference.id, select.value);
          else state.choices.delete(difference.id);
          elements['drive-confirmation'].hidden = true;
          state.mode = '';
          controls();
        });
        label.append(text, select);
        article.append(heading, changed, grid, label);
        group.appendChild(article);
      }
      elements['drive-differences'].appendChild(group);
    }
    elements['drive-choose-merge'].hidden = false;
    controls();
  }

  async function compare() {
    if (!state.review) return;
    const generation = state.generation;
    await manager.refreshDashboard();
    if (manager.locked) await manager.unlockVaultExplicitly();
    if (!state.review || generation !== state.generation) return;
    const result = await send('DRIVE_COMPARE', { contextId: state.review.contextId, fileId: elements['drive-review-remote'].value });
    if (!dialog.open || generation !== state.generation) return;
    renderDifferences(result);
  }

  async function commit() {
    if (!state.review || !state.mode) return;
    state.committing = true;
    controls();
    const payload = {
      contextId: state.review.contextId, fileId: elements['drive-review-remote'].value,
      mode: state.mode, choices: Object.fromEntries(state.choices),
    };
    let result;
    if (state.mode === 'merge') result = await send('DRIVE_COMMIT', payload);
    else result = await withKey((key) => send('DRIVE_COMMIT', { ...payload, ...(key ? { key } : {}) }));
    closeReview(true);
    await manager.refreshDashboard();
    render(result.state);
    refreshRemoteVersion();
    elements['drive-versions'].replaceChildren();
    elements['drive-operation-status'].textContent = `Operação concluída: v${result.revision.number}, ${result.count} credencial(is). Clique em Importar do Drive para atualizar o histórico exibido.`;
    manager.showToast('Sincronização manual concluída.');
  }

  elements['google-configure'].addEventListener('click', openConfig);
  elements['google-close-config'].addEventListener('click', closeConfig);
  elements['google-cancel-config'].addEventListener('click', closeConfig);
  manager.enableBackdropDismiss(configDialog, closeConfig);
  configDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeConfig(); });
  configDialog.addEventListener('close', () => {
    cancelConfigLoad();
    elements['google-client-secret'].value = '';
    controls();
  });
  elements['google-clear-oauth'].addEventListener('click', () => run(async () => {
    cancelConfigLoad();
    invalidateConnection();
    const config = { clientId: '', clientSecret: '', folderName: state.data?.config?.folderName || 'AngelShield' };
    render(await send('DRIVE_SAVE_CONFIG', { config }), true);
    elements['google-client-secret'].value = '';
    state.needsValidation = false;
    elements['drive-versions'].replaceChildren();
    elements['drive-operation-status'].textContent = 'Cliente OAuth e autorização Google removidos deste navegador.';
    manager.showToast('Cliente OAuth removido.');
  }, 'Limpando cliente OAuth…'));
  elements['google-config-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.configLoading) return;
    run(async () => {
      invalidateConnection();
      const config = {
        clientId: elements['google-client-id'].value,
        clientSecret: elements['google-client-secret'].value,
        folderName: elements['google-folder-name'].value,
      };
      render(await send('DRIVE_SAVE_CONFIG', { config }), true);
      elements['google-client-secret'].value = config.clientSecret.trim();
      elements['drive-versions'].replaceChildren();
      elements['drive-operation-status'].textContent = 'Configuração salva neste navegador. Nenhuma sincronização foi iniciada.';
      manager.showToast('Configuração Google salva.');
    });
  });
  elements['google-connect'].addEventListener('click', () => run(async () => {
    invalidateConnection();
    state.connection = 'validating';
    controls();
    const result = await send('DRIVE_CONNECT');
    state.validationGeneration += 1;
    state.needsValidation = false;
    state.connection = result.connected ? 'connected' : 'disconnected';
    state.connectionError = '';
    render(result);
    if (state.connection === 'connected') refreshRemoteVersion();
    elements['drive-versions'].replaceChildren();
    elements['drive-operation-status'].textContent = 'Conta conectada. Use Importar do Drive para escolher uma versão ou Exportar para o Drive para salvar uma cópia.';
  }, 'Aguardando autorização do Google…'));
  elements['google-disconnect'].addEventListener('click', () => run(async () => {
    invalidateConnection();
    const result = await send('DRIVE_DISCONNECT');
    state.needsValidation = false;
    render(result);
    elements['drive-versions'].replaceChildren();
    elements['drive-operation-status'].textContent = result.revoked ? 'Conta desconectada.' : 'Conta desconectada neste navegador. Não foi possível confirmar a revogação no Google.';
    manager.showToast(elements['drive-operation-status'].textContent);
  }, 'Desconectando…'));
  elements['drive-list-versions'].addEventListener('click', () => run(listVersions, 'Consultando versões no Drive…'));
  elements['drive-upload'].addEventListener('click', () => run(() => begin('upload'), 'Consultando o histórico antes do envio…'));
  elements['drive-recover-pending'].addEventListener('click', () => run(async () => {
    const result = await send('DRIVE_RECOVER_PENDING');
    render(result.state);
    refreshRemoteVersion();
    elements['drive-operation-status'].textContent = result.found
      ? 'O arquivo pendente está preservado no Drive. Clique em Importar do Drive para escolher se deseja aplicá-lo ao cofre local.'
      : 'O arquivo pendente não está no Drive. Você pode iniciar um novo envio.';
  }, 'Verificando envio pendente…'));
  elements['drive-review-remote'].addEventListener('change', () => {
    state.generation += 1;
    clearDifferences();
    state.mode = '';
    elements['drive-confirmation'].hidden = true;
    remoteInfo();
    if (state.review?.status === 'ready') chooseMode(state.review.action);
    controls();
  });
  elements['drive-use-local'].addEventListener('click', () => chooseMode('local'));
  elements['drive-use-remote'].addEventListener('click', () => chooseMode('remote'));
  elements['drive-choose-merge'].addEventListener('click', () => chooseMode('merge'));
  elements['drive-show-differences'].addEventListener('click', () => run(compare, 'Comparando credenciais…'));
  elements['drive-apply'].addEventListener('click', () => run(commit, 'Aplicando a operação confirmada…'));
  elements['drive-close-review'].addEventListener('click', () => closeReview());
  manager.enableBackdropDismiss(dialog, () => closeReview());
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeReview(); });
  dialog.addEventListener('close', cleanupReview);

  chrome.storage.onChanged.addListener((changes, area) => {
    const config = area === 'local' && changes['angelshield.googleConfig'];
    const configChanged = config && ['clientId', 'clientSecret', 'folderName']
      .some((name) => config.oldValue?.[name] !== config.newValue?.[name]);
    const auth = area === 'local' && changes['angelshield.googleAuth'];
    const authChanged = auth && (auth.oldValue?.clientId !== auth.newValue?.clientId
      || auth.oldValue?.account?.id !== auth.newValue?.account?.id
      || Boolean(auth.oldValue?.refreshToken) !== Boolean(auth.newValue?.refreshToken));
    if (configChanged || authChanged) {
      invalidateConnection();
      closeReview(true);
      elements['drive-versions'].replaceChildren();
    }
    const keyInvalidated = area === 'session' && changes['angelshield.vaultKey']
      && (changes['angelshield.vaultKey'].oldValue != null || !changes['angelshield.vaultKey'].newValue);
    const saltChanged = area === 'local' && changes['angelshield.settings']
      && changes['angelshield.settings'].oldValue?.globalSalt !== changes['angelshield.settings'].newValue?.globalSalt;
    const recordsChanged = area === 'local' && changes['angelshield.vaultRevision'];
    if (keyInvalidated || saltChanged || recordsChanged && !state.committing) closeReview(true);
    if (keyInvalidated || saltChanged || recordsChanged) {
      if (keyInvalidated || saltChanged) {
        state.generation += 1;
        clearDifferences();
      }
      manager.refreshDashboard().then(controls).catch(manager.reportError);
    }
    if (area === 'local' && ['angelshield.vaultRevision', 'angelshield.googleAuth', 'angelshield.googleConfig', 'angelshield.drivePendingUpload'].some((name) => changes[name])) {
      refresh().catch(manager.reportError);
    }
  });
  window.addEventListener('hashchange', () => {
    invalidateConnection();
    if (window.location.hash === '#settings') refresh().catch(manager.reportError);
  });
  window.addEventListener('angelshield-vault-state', controls);
  controls();
  send('DRIVE_GET_STATE').then((data) => {
    render(data, !configDialog.open);
    validateWhenVisible();
  }).catch(manager.reportError);
})();
