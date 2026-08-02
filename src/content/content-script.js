(function bootstrapContentScript() {
  document.documentElement.removeAttribute('data-angelshield-content-script');
  document.querySelectorAll('.angelshield-trigger, .angelshield-backdrop, .angelshield-panel')
    .forEach((element) => element.remove());

  const OPEN_AUTOFILL_PANEL_MESSAGE = 'OPEN_AUTOFILL_PANEL';
  const logoUrl = chrome.runtime.getURL('assets/as_logo-removebg.png');
  const state = {
    activeFields: null,
    filterQuery: '',
    isDropdownOpen: false,
    locked: true,
    records: [],
    selectedRecordId: '',
  };
  const floatingUiMargin = 8;
  const triggerRenderDelaysMs = [500, 1000, 1500];
  let floatingUiUpdateFrame = 0;
  let observedAnchorInput = null;
  let triggerShowTimeoutIds = [];

  const trigger = document.createElement('button');
  trigger.className = 'angelshield-trigger';
  trigger.type = 'button';
  trigger.hidden = true;
  trigger.title = 'Abrir AngelShield para este login';
  trigger.innerHTML = `
    <img src="${logoUrl}" alt="" aria-hidden="true">
  `;

  const panel = document.createElement('div');
  panel.className = 'angelshield-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="angelshield-panel-header">
      <img class="angelshield-panel-logo" src="${logoUrl}" alt="" aria-hidden="true">
      <h3>AngelShield</h3>
    </div>
    <p>Escolha um registro salvo para preencher este login.</p>
    <div class="angelshield-panel-body">
      <div class="angelshield-combobox">
        <input
          id="angelshield-record-input"
          class="angelshield-combobox-input"
          type="text"
          placeholder="Buscar credencial"
          autocomplete="off"
          spellcheck="false"
        >
        <div id="angelshield-record-dropdown" class="angelshield-combobox-dropdown" hidden></div>
      </div>
      <div id="angelshield-key-wrap" class="angelshield-key-wrap" hidden>
        <input id="angelshield-key-input" type="password" placeholder="Informe a key para usar esta senha">
        <label class="angelshield-checkbox-row" for="angelshield-keep-open-checkbox">
          <input id="angelshield-keep-open-checkbox" type="checkbox">
          <span>Manter o cofre aberto</span>
        </label>
      </div>
      <div id="angelshield-feedback" class="angelshield-muted"></div>
      <div class="angelshield-panel-actions">
        <button id="angelshield-fill-button" class="angelshield-primary" type="button">Preencher</button>
        <button id="angelshield-new-password-button" class="angelshield-secondary" type="button">Nova senha</button>
        <button id="angelshield-open-button" class="angelshield-secondary" type="button">Abrir cofre</button>
      </div>
    </div>
  `;

  const backdrop = document.createElement('div');
  backdrop.className = 'angelshield-backdrop';
  backdrop.hidden = true;

  document.documentElement.append(trigger, backdrop, panel);

  const recordInput = panel.querySelector('#angelshield-record-input');
  const recordDropdown = panel.querySelector('#angelshield-record-dropdown');
  const keyWrap = panel.querySelector('#angelshield-key-wrap');
  const keyInput = panel.querySelector('#angelshield-key-input');
  const keepOpenCheckbox = panel.querySelector('#angelshield-keep-open-checkbox');
  const feedback = panel.querySelector('#angelshield-feedback');
  const fillButton = panel.querySelector('#angelshield-fill-button');
  const newPasswordButton = panel.querySelector('#angelshield-new-password-button');
  const openButton = panel.querySelector('#angelshield-open-button');

  function scheduleFloatingUiUpdate() {
    if (!state.activeFields || floatingUiUpdateFrame) {
      return;
    }

    floatingUiUpdateFrame = requestAnimationFrame(() => {
      floatingUiUpdateFrame = 0;
      updateFloatingUiPositions();
    });
  }

  function clearTriggerShowTimeout() {
    triggerShowTimeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    triggerShowTimeoutIds = [];
  }

  function showTriggerWithDelay() {
    clearTriggerShowTimeout();
    trigger.hidden = true;

    triggerShowTimeoutIds = triggerRenderDelaysMs.map((delayMs, index) => {
      return window.setTimeout(() => {
        if (!state.activeFields?.anchorInput || panel.hidden === false) {
          return;
        }

        if (index === 0) {
          trigger.hidden = false;
        }

        scheduleFloatingUiUpdate();
      }, delayMs);
    });
  }

  const activeAnchorResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(scheduleFloatingUiUpdate)
    : null;
  const floatingUiMutationObserver = typeof MutationObserver === 'function'
    ? new MutationObserver((mutations) => {
      if (shouldRepositionAfterPageMutation(mutations)) {
        scheduleFloatingUiUpdate();
      }
    })
    : null;

  function isExtensionElement(element) {
    return Boolean(
      element instanceof Element
      && (panel.contains(element) || trigger.contains(element) || backdrop.contains(element)),
    );
  }

  function shouldRepositionAfterPageMutation(mutations) {
    if (!state.activeFields) {
      return false;
    }

    return mutations.some((mutation) => {
      if (mutation.target instanceof Element && isExtensionElement(mutation.target)) {
        return false;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
        return !(node instanceof Element) || !isExtensionElement(node);
      }) || mutation.type === 'attributes';
    });
  }

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

  function getViewportBounds() {
    const visualViewport = window.visualViewport;
    if (visualViewport) {
      return {
        bottom: visualViewport.offsetTop + visualViewport.height,
        left: visualViewport.offsetLeft,
        right: visualViewport.offsetLeft + visualViewport.width,
        top: visualViewport.offsetTop,
      };
    }

    return {
      bottom: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: 0,
    };
  }

  function clamp(value, min, max) {
    if (max < min) {
      return min;
    }

    return Math.max(min, Math.min(value, max));
  }

  function isRectInsideViewport(rect, viewport = getViewportBounds()) {
    return rect.width > 0
      && rect.height > 0
      && rect.bottom > viewport.top
      && rect.top < viewport.bottom
      && rect.right > viewport.left
      && rect.left < viewport.right;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (isExtensionElement(element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }

  function isVisibleInsideViewport(element) {
    return isVisible(element) && isRectInsideViewport(element.getBoundingClientRect());
  }

  function isCandidateUsernameInput(element) {
    if (!(element instanceof HTMLInputElement) || !isVisible(element)) {
      return false;
    }

    const type = (element.getAttribute('type') || 'text').toLowerCase();
    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    return ['text', 'email', 'tel', 'url'].includes(type) || autocomplete.includes('username') || autocomplete.includes('email');
  }

  function isCandidatePasswordInput(element) {
    return element instanceof HTMLInputElement && element.type === 'password' && isVisible(element);
  }

  function getFieldScopes(element) {
    const scopes = [];
    const seen = new Set();

    function appendScope(scope) {
      if (!scope || seen.has(scope)) {
        return;
      }

      seen.add(scope);
      scopes.push(scope);
    }

    appendScope(element.form);
    appendScope(element.closest('form'));

    let current = element.parentElement;
    while (current) {
      if (current.matches('form, section, article, div')) {
        appendScope(current);
      }

      current = current.parentElement;
    }

    appendScope(document);

    return scopes;
  }

  function getHintText(element) {
    const labelText = Array.from(element.labels || [])
      .map((label) => label.textContent || '')
      .join(' ');

    return [
      element.id,
      element.name,
      element.getAttribute('autocomplete'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.dataset?.name,
      labelText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function getDistanceScore(referenceInput, candidateInput) {
    const referenceRect = referenceInput.getBoundingClientRect();
    const candidateRect = candidateInput.getBoundingClientRect();
    const verticalDistance = Math.abs(referenceRect.top - candidateRect.top);
    const horizontalDistance = Math.abs(referenceRect.left - candidateRect.left);

    let score = 0;
    score -= verticalDistance * 0.4;
    score -= horizontalDistance * 0.08;

    if (candidateRect.top <= referenceRect.top + 40) {
      score += 20;
    }

    if (candidateRect.top < referenceRect.top) {
      score += 20;
    }

    if (Math.abs(candidateRect.left - referenceRect.left) <= 80) {
      score += 10;
    }

    return score;
  }

  function findBestMatchingInput(candidates, scoreCandidate) {
    let bestCandidate = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  function findAssociatedPassword(target) {
    if (isCandidatePasswordInput(target)) {
      return target;
    }

    for (const scope of getFieldScopes(target)) {
      const passwordInputs = Array.from(scope.querySelectorAll('input[type="password"]')).filter(isVisible);
      if (passwordInputs.length === 0) {
        continue;
      }

      return findBestMatchingInput(passwordInputs, (input) => getDistanceScore(target, input));
    }

    return null;
  }

  function findAssociatedUsername(passwordInput) {
    if (!passwordInput) {
      return null;
    }

    for (const scope of getFieldScopes(passwordInput)) {
      const inputs = Array.from(scope.querySelectorAll('input'))
        .filter((input) => input !== passwordInput)
        .filter(isCandidateUsernameInput);

      if (inputs.length === 0) {
        continue;
      }

      return findBestMatchingInput(inputs, (input) => {
        const hints = getHintText(input);
        let score = getDistanceScore(passwordInput, input);

        if (hints.includes('username')) {
          score += 120;
        }

        if (hints.includes('email')) {
          score += 60;
        }

        if (hints.includes('user') || hints.includes('login') || hints.includes('usuario') || hints.includes('usuário')) {
          score += 50;
        }

        if (hints.includes('account') || hints.includes('conta')) {
          score += 25;
        }

        return score;
      });
    }

    return null;
  }

  function resolveAnchorInput(target, usernameInput, passwordInput) {
    if (isCandidateUsernameInput(target)) {
      return target;
    }

    if (usernameInput) {
      return usernameInput;
    }

    if (target !== passwordInput && target instanceof HTMLInputElement) {
      return target;
    }

    return passwordInput;
  }

  function detectFieldGroup(target) {
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }

    if (isExtensionElement(target)) {
      return null;
    }

    const passwordInput = findAssociatedPassword(target);
    if (!passwordInput) {
      return null;
    }

    const usernameInput = isCandidateUsernameInput(target) ? target : findAssociatedUsername(passwordInput);
    const anchorInput = resolveAnchorInput(target, usernameInput, passwordInput);

    return {
      anchorInput,
      passwordInput,
      usernameInput,
    };
  }

  function isFocusableSubmitControl(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) {
      return false;
    }

    if (element instanceof HTMLButtonElement) {
      const type = (element.getAttribute('type') || 'submit').toLowerCase();
      return type === 'submit' && !element.disabled;
    }

    if (element instanceof HTMLInputElement) {
      return ['submit', 'button'].includes((element.type || '').toLowerCase()) && !element.disabled;
    }

    return false;
  }

  function getFieldGroupScopes(fields) {
    const scopes = [];
    const seen = new Set();

    function appendScope(scope) {
      if (!scope || seen.has(scope)) {
        return;
      }

      seen.add(scope);
      scopes.push(scope);
    }

    [fields.passwordInput, fields.usernameInput, fields.anchorInput].forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      getFieldScopes(input).forEach(appendScope);
    });

    appendScope(document);

    return scopes;
  }

  function findSubmitControl(fields) {
    for (const scope of getFieldGroupScopes(fields)) {
      const controls = Array.from(scope.querySelectorAll('button, input'))
        .filter((element) => !isExtensionElement(element))
        .filter(isFocusableSubmitControl);

      if (controls.length > 0) {
        return controls[0];
      }
    }

    return null;
  }

  function focusSubmitControl(fields) {
    const submitControl = findSubmitControl(fields);
    if (!submitControl) {
      return;
    }

    requestAnimationFrame(() => {
      submitControl.focus({ preventScroll: true });
    });
  }

  function formatRecordLabel(record) {
    return `${record.identifier}${record.username ? ` (${record.username})` : ''}`;
  }

  function getFilteredRecords() {
    const query = state.filterQuery.trim().toLowerCase();

    if (!query) {
      return state.records;
    }

    return state.records.filter((record) => {
      const identifier = (record.identifier || '').toLowerCase();
      const username = (record.username || '').toLowerCase();
      return identifier.includes(query) || username.includes(query);
    });
  }

  function getSelectedRecord() {
    return state.records.find((record) => record.id === state.selectedRecordId) || null;
  }

  function fieldsContainFocusedElement(fields) {
    return document.activeElement === fields.anchorInput
      || document.activeElement === fields.passwordInput
      || document.activeElement === fields.usernameInput
      || trigger.contains(document.activeElement)
      || panel.contains(document.activeElement);
  }

  function observeActiveAnchor(anchor) {
    if (!activeAnchorResizeObserver || observedAnchorInput === anchor) {
      return;
    }

    if (observedAnchorInput) {
      activeAnchorResizeObserver.unobserve(observedAnchorInput);
    }

    observedAnchorInput = anchor;
    activeAnchorResizeObserver.observe(anchor);
  }

  function stopObservingActiveAnchor() {
    if (!activeAnchorResizeObserver || !observedAnchorInput) {
      return;
    }

    activeAnchorResizeObserver.unobserve(observedAnchorInput);
    observedAnchorInput = null;
  }

  function positionTriggerNear(anchor) {
    const rect = anchor.getBoundingClientRect();
    const viewport = getViewportBounds();
    const maxLeft = viewport.right - trigger.offsetWidth - floatingUiMargin;
    const maxTop = viewport.bottom - trigger.offsetHeight - floatingUiMargin;
    const shouldAvoidRightEdge = anchor instanceof HTMLInputElement && anchor.type === 'password';
    const left = clamp(
      shouldAvoidRightEdge ? rect.left - trigger.offsetWidth - floatingUiMargin : rect.right - trigger.offsetWidth,
      viewport.left + floatingUiMargin,
      maxLeft,
    );
    const top = clamp(
      rect.top + (rect.height - trigger.offsetHeight) / 2,
      viewport.top + floatingUiMargin,
      maxTop,
    );

    trigger.style.left = `${left}px`;
    trigger.style.top = `${top}px`;
  }

  function updateFloatingUiPositions() {
    const anchor = state.activeFields?.anchorInput;

    if (!anchor || !anchor.isConnected || !isVisible(anchor)) {
      hideAll();
      syncActiveFields();
      return;
    }

    if (!isRectInsideViewport(anchor.getBoundingClientRect())) {
      trigger.hidden = true;
      hidePanel();
      return;
    }

    if (trigger.hidden && panel.hidden && fieldsContainFocusedElement(state.activeFields)) {
      trigger.hidden = false;
    }

    if (!trigger.hidden) {
      positionTriggerNear(anchor);
    }
  }

  function showTriggerFor(fields) {
    const shouldDelayShow = trigger.hidden;
    state.activeFields = fields;
    observeActiveAnchor(fields.anchorInput);

    if (shouldDelayShow) {
      showTriggerWithDelay();
      return;
    }

    scheduleFloatingUiUpdate();
  }

  function closeDropdown(restoreSelection = true) {
    state.isDropdownOpen = false;
    recordDropdown.hidden = true;

    if (restoreSelection) {
      const selectedRecord = getSelectedRecord();
      if (selectedRecord) {
        recordInput.value = formatRecordLabel(selectedRecord);
      } else if (!state.filterQuery.trim()) {
        recordInput.value = '';
      }
    }
  }

  function hidePanel() {
    backdrop.hidden = true;
    panel.hidden = true;
    keyInput.value = '';
    keepOpenCheckbox.checked = false;
    keyWrap.hidden = true;
    feedback.className = 'angelshield-muted';
    feedback.textContent = '';
    closeDropdown(true);
  }

  function hideAll() {
    clearTriggerShowTimeout();
    trigger.hidden = true;
    hidePanel();
  }

  function schedulePanelPositionUpdate() {
    if (!panel.hidden) {
      scheduleFloatingUiUpdate();
    }
  }

  function updateFillButtonState() {
    const hasSelectedRecord = Boolean(state.selectedRecordId);
    const hasKey = keyInput.value.trim().length > 0;
    fillButton.disabled = !hasSelectedRecord || (state.locked && !hasKey);
  }

  function renderRecordDropdown() {
    recordDropdown.innerHTML = '';
    const visibleRecords = getFilteredRecords();

    if (state.records.length === 0) {
      fillButton.disabled = true;
      recordInput.disabled = false;
      feedback.className = 'angelshield-muted';
      feedback.textContent = 'Abra o cofre para cadastrar um registro.';
      closeDropdown(false);
      schedulePanelPositionUpdate();
      return;
    }

    recordInput.disabled = false;

    if (visibleRecords.length === 0) {
      state.selectedRecordId = '';
      fillButton.disabled = true;
      const emptyState = document.createElement('div');
      emptyState.className = 'angelshield-option angelshield-option-empty';
      emptyState.textContent = 'Nenhuma credencial encontrada';
      recordDropdown.appendChild(emptyState);
      recordDropdown.hidden = !state.isDropdownOpen;
      feedback.className = 'angelshield-muted';
      feedback.textContent = 'Ajuste a busca para encontrar outra credencial.';
      schedulePanelPositionUpdate();
      return;
    }

    if (!visibleRecords.some((record) => record.id === state.selectedRecordId)) {
      state.selectedRecordId = visibleRecords[0].id;
    }

    for (const record of visibleRecords) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'angelshield-option';
      option.dataset.recordId = record.id;
      option.classList.toggle('is-selected', record.id === state.selectedRecordId);
      option.innerHTML = `
        <span class="angelshield-option-title">${record.identifier}</span>
        <span class="angelshield-option-meta">${record.username || 'Sem usuário'}</span>
      `;
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        state.selectedRecordId = record.id;
        recordInput.value = formatRecordLabel(record);
        state.filterQuery = '';
        closeDropdown(false);
        recordDropdown.innerHTML = '';
        feedback.className = 'angelshield-muted';
        feedback.textContent = state.locked
          ? 'O cofre está trancado. Informe a key para usar esta senha.'
          : 'Cofre destrancado. Você já pode preencher.';
        updateFillButtonState();
      });
      recordDropdown.appendChild(option);
    }

    updateFillButtonState();
    recordDropdown.hidden = !state.isDropdownOpen;
    feedback.className = 'angelshield-muted';
    feedback.textContent = state.locked
      ? 'O cofre está trancado. Informe a key para usar esta senha.'
      : 'Cofre destrancado. Você já pode preencher.';

    schedulePanelPositionUpdate();
  }

  async function loadRecords() {
    const data = await sendMessage('GET_AUTOFILL_RECORDS', {
      url: window.location.href,
    });

    state.records = data.records || [];
    state.filterQuery = '';
    state.selectedRecordId = state.records[0]?.id || '';
    state.locked = Boolean(data.locked);
    keyWrap.hidden = !state.locked;
    feedback.className = 'angelshield-muted';
    keyInput.value = '';
    keepOpenCheckbox.checked = false;

    const selectedRecord = getSelectedRecord();
    recordInput.value = selectedRecord ? formatRecordLabel(selectedRecord) : '';
    renderRecordDropdown();
  }

  function focusPanelSearch() {
    requestAnimationFrame(() => {
      if (!panel.hidden) {
        recordInput.focus();
        recordInput.select();
      }
    });
  }

  function openPanel({ focusInput = false } = {}) {
    if (!state.activeFields) {
      syncActiveFields();
    }

    if (!state.activeFields) {
      return;
    }

    backdrop.hidden = false;
    panel.hidden = false;
    scheduleFloatingUiUpdate();
    loadRecords().catch((error) => {
      feedback.className = 'angelshield-error';
      feedback.textContent = error.message;
    }).finally(() => {
      if (focusInput) {
        focusPanelSearch();
      }
    });
  }

  function handleOpenPanelRequest() {
    syncActiveFields();

    if (!state.activeFields) {
      return {
        opened: false,
        reason: 'Nenhum formulário de login visível foi encontrado nesta página.',
      };
    }

    openPanel({ focusInput: true });
    return {
      opened: true,
    };
  }

  function isOpenAutofillPanelShortcut(event) {
    return !event.defaultPrevented
      && !event.repeat
      && event.ctrlKey
      && event.shiftKey
      && !event.altKey
      && !event.metaKey
      && event.key.toLowerCase() === 'y';
  }

  function handleOpenAutofillPanelShortcut(event) {
    if (!isOpenAutofillPanelShortcut(event)) {
      return;
    }

    const result = handleOpenPanelRequest();

    if (!result.opened) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillActiveFields(secret) {
    if (state.activeFields?.usernameInput) {
      setNativeValue(state.activeFields.usernameInput, secret.username || '');
    }

    if (state.activeFields?.passwordInput) {
      setNativeValue(state.activeFields.passwordInput, secret.password || '');
    }
  }

  function getPageTitleForRecord() {
    const normalizedTitle = (document.title || '').replace(/\s+/g, ' ').trim();
    if (normalizedTitle) {
      return normalizedTitle;
    }

    try {
      return new URL(window.location.href).hostname;
    } catch (error) {
      return window.location.href;
    }
  }

  function getInputValue(input) {
    return input instanceof HTMLInputElement ? input.value : '';
  }

  function buildNewPasswordDraft() {
    if (!state.activeFields) {
      syncActiveFields();
    }

    return {
      identifier: getPageTitleForRecord(),
      link: window.location.href,
      username: getInputValue(state.activeFields?.usernameInput),
      plainPassword: getInputValue(state.activeFields?.passwordInput),
    };
  }

  async function openNewPasswordForm() {
    await sendMessage('OPEN_MANAGER_PAGE', {
      recordPrefill: buildNewPasswordDraft(),
    });
    hidePanel();
  }

  async function fillSelectedRecord() {
    const recordId = state.selectedRecordId;
    if (!recordId) {
      feedback.className = 'angelshield-error';
      feedback.textContent = 'Escolha uma credencial para preencher.';
      return;
    }

    if (state.locked) {
      const key = keyInput.value;
      if (!key.trim()) {
        feedback.className = 'angelshield-error';
        feedback.textContent = 'Informe a key para descriptografar esta senha.';
        updateFillButtonState();
        return;
      }

      const secret = await sendMessage('GET_RECORD_SECRET', {
        id: recordId,
        key,
      });

      fillActiveFields(secret);

      if (keepOpenCheckbox.checked) {
        await sendMessage('UNLOCK_VAULT', {
          key,
        });
        state.locked = false;
      }

      focusSubmitControl(state.activeFields);
      hidePanel();
      return;
    }

    const secret = await sendMessage('GET_RECORD_SECRET', {
      id: recordId,
    });

    fillActiveFields(secret);

    focusSubmitControl(state.activeFields);
    hidePanel();
  }

  function maybeShowForTarget(target) {
    if (isExtensionElement(target)) {
      return;
    }

    const fields = detectFieldGroup(target);
    if (!fields) {
      return;
    }

    showTriggerFor(fields);
  }

  function scanExistingFields() {
    if (document.activeElement instanceof HTMLInputElement && !isExtensionElement(document.activeElement)) {
      const activeFields = detectFieldGroup(document.activeElement);
      if (activeFields && isVisibleInsideViewport(activeFields.anchorInput)) {
        return activeFields;
      }
    }

    const visiblePasswordInput = Array.from(document.querySelectorAll('input[type="password"]'))
      .filter((input) => !isExtensionElement(input))
      .find(isVisibleInsideViewport);
    if (!visiblePasswordInput) {
      return null;
    }

    return detectFieldGroup(visiblePasswordInput);
  }

  function syncActiveFields() {
    const fields = scanExistingFields();
    if (fields) {
      showTriggerFor(fields);
      return;
    }

    state.activeFields = null;
    stopObservingActiveAnchor();
    hideAll();
  }

  document.addEventListener('focusin', (event) => {
    maybeShowForTarget(event.target);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;

    if (trigger.contains(target)) {
      event.preventDefault();
      if (panel.hidden) {
        openPanel();
      } else {
        hidePanel();
      }
      return;
    }

    if (panel.contains(target)) {
      return;
    }

    if (target instanceof HTMLInputElement) {
      maybeShowForTarget(target);
      hidePanel();
      return;
    }

    hidePanel();
  });

  document.addEventListener('scroll', scheduleFloatingUiUpdate, { capture: true, passive: true });
  window.addEventListener('scroll', scheduleFloatingUiUpdate, { passive: true });
  window.addEventListener('resize', scheduleFloatingUiUpdate);
  window.addEventListener('focus', syncActiveFields);
  window.addEventListener('pageshow', syncActiveFields);
  window.visualViewport?.addEventListener('scroll', scheduleFloatingUiUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleFloatingUiUpdate);
  floatingUiMutationObserver?.observe(document.documentElement, {
    attributeFilter: ['aria-hidden', 'class', 'hidden', 'open', 'style'],
    attributes: true,
    childList: true,
    subtree: true,
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncActiveFields();
    }
  });

  fillButton.addEventListener('click', () => {
    fillSelectedRecord().catch((error) => {
      feedback.className = 'angelshield-error';
      feedback.textContent = error.message;
    });
  });

  recordInput.addEventListener('focus', () => {
    state.isDropdownOpen = true;
    state.filterQuery = '';
    const selectedRecord = getSelectedRecord();
    recordInput.value = selectedRecord ? formatRecordLabel(selectedRecord) : '';
    recordInput.select();
    renderRecordDropdown();
  });

  recordInput.addEventListener('input', (event) => {
    state.filterQuery = event.target.value || '';
    state.isDropdownOpen = true;
    renderRecordDropdown();
  });

  keyInput.addEventListener('input', () => {
    updateFillButtonState();
  });

  recordInput.addEventListener('keydown', (event) => {
    const visibleRecords = getFilteredRecords();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleRecords.length === 0) {
        return;
      }

      const currentIndex = visibleRecords.findIndex((record) => record.id === state.selectedRecordId);
      const nextRecord = visibleRecords[(currentIndex + 1 + visibleRecords.length) % visibleRecords.length];
      state.selectedRecordId = nextRecord.id;
      renderRecordDropdown();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleRecords.length === 0) {
        return;
      }

      const currentIndex = visibleRecords.findIndex((record) => record.id === state.selectedRecordId);
      const nextIndex = currentIndex <= 0 ? visibleRecords.length - 1 : currentIndex - 1;
      state.selectedRecordId = visibleRecords[nextIndex].id;
      renderRecordDropdown();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (visibleRecords.length === 0) {
        return;
      }

      const selectedRecord = visibleRecords.find((record) => record.id === state.selectedRecordId) || visibleRecords[0];
      state.selectedRecordId = selectedRecord.id;
      state.filterQuery = '';
      recordInput.value = formatRecordLabel(selectedRecord);
      closeDropdown(false);
      renderRecordDropdown();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      hidePanel();
    }
  });

  openButton.addEventListener('click', () => {
    sendMessage('OPEN_MANAGER_PAGE').catch(() => {});
  });

  newPasswordButton.addEventListener('click', () => {
    openNewPasswordForm().catch((error) => {
      feedback.className = 'angelshield-error';
      feedback.textContent = error.message;
    });
  });

  backdrop.addEventListener('click', () => {
    hidePanel();
  });

  document.addEventListener('keydown', handleOpenAutofillPanelShortcut, { capture: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      hidePanel();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== OPEN_AUTOFILL_PANEL_MESSAGE) {
      return false;
    }

    sendResponse(handleOpenPanelRequest());
    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncActiveFields, { once: true });
  } else {
    syncActiveFields();
  }
})();
