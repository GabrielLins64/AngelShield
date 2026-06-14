importScripts('../lib/shared.js', '../lib/blake2b.js', '../lib/crypto.js');

const { AngelShieldCrypto, AngelShieldShared } = self;

const {
  CSV_COMMON_HEADERS,
  CSV_EXPORT_HEADERS,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  createRecordId,
  ensureString,
  scoreRecordMatch,
} = AngelShieldShared;
const OPEN_AUTOFILL_PANEL_COMMAND = 'open-autofill-panel';
const OPEN_AUTOFILL_PANEL_MESSAGE = 'OPEN_AUTOFILL_PANEL';

async function initializeStorage() {
  const existing = await chrome.storage.local.get([STORAGE_KEYS.records, STORAGE_KEYS.settings]);
  const writes = {};

  if (!Array.isArray(existing[STORAGE_KEYS.records])) {
    writes[STORAGE_KEYS.records] = [];
  }

  if (!existing[STORAGE_KEYS.settings] || typeof existing[STORAGE_KEYS.settings] !== 'object') {
    writes[STORAGE_KEYS.settings] = DEFAULT_SETTINGS;
  } else if (!existing[STORAGE_KEYS.settings].globalSalt) {
    writes[STORAGE_KEYS.settings] = {
      ...DEFAULT_SETTINGS,
      ...existing[STORAGE_KEYS.settings],
    };
  }

  if (Object.keys(writes).length > 0) {
    await chrome.storage.local.set(writes);
  }
}

async function getRecords() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.records);
  return Array.isArray(result[STORAGE_KEYS.records]) ? result[STORAGE_KEYS.records] : [];
}

async function saveRecords(records) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.records]: records,
  });
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.settings] || {}),
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
  });
}

async function getVaultKey() {
  const result = await chrome.storage.session.get(STORAGE_KEYS.vaultKey);
  return ensureString(result[STORAGE_KEYS.vaultKey]);
}

async function setVaultKey(key) {
  await chrome.storage.session.set({
    [STORAGE_KEYS.vaultKey]: ensureString(key),
  });
}

async function lockVault() {
  await chrome.storage.session.remove(STORAGE_KEYS.vaultKey);
}

async function isLocked() {
  return !(await getVaultKey());
}

async function requireVaultKey() {
  const key = await getVaultKey();

  if (!key) {
    throw new Error('O cofre está trancado. Informe uma key para continuar.');
  }

  return key;
}

async function resolveCryptoKey(keyOverride) {
  const normalizedKey = ensureString(keyOverride);

  if (normalizedKey.trim()) {
    return normalizedKey;
  }

  return requireVaultKey();
}

function normalizeRecord(record, fallbackSalt) {
  return {
    id: ensureString(record.id) || createRecordId(),
    identifier: ensureString(record.identifier).trim(),
    username: ensureString(record.username).trim(),
    link: ensureString(record.link).trim(),
    hint: ensureString(record.hint),
    encryptedPassword: ensureString(record.encryptedPassword),
    salt: ensureString(record.salt) || ensureString(fallbackSalt),
  };
}

function summarizeRecord(record, currentUrl) {
  const matchScore = currentUrl ? scoreRecordMatch(record.link, currentUrl) : 0;

  return {
    id: record.id,
    identifier: record.identifier,
    username: record.username,
    link: record.link,
    hint: record.hint,
    salt: record.salt,
    hasPassword: Boolean(record.encryptedPassword),
    isMatch: matchScore > 0,
    matchScore,
  };
}

function sortSummaries(records) {
  return [...records].sort((left, right) => {
    if (right.matchScore !== left.matchScore) {
      return right.matchScore - left.matchScore;
    }

    return left.identifier.localeCompare(right.identifier, 'pt-BR', { sensitivity: 'base' });
  });
}

function decryptRecordPassword(record, key, settings) {
  return AngelShieldCrypto.decrypt(record.encryptedPassword, key, record.salt || settings.globalSalt);
}

function encryptRecordPassword(password, key, salt) {
  return AngelShieldCrypto.encrypt(password, key, salt);
}

function escapeCsvCell(value) {
  const text = ensureString(value).replace(/"/g, '""');
  return `"${text}"`;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let isInsideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (isInsideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        isInsideQuotes = !isInsideQuotes;
      }
      continue;
    }

    if (char === ',' && !isInsideQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !isInsideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(current);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

async function buildDashboardData() {
  const [records, settings, locked] = await Promise.all([getRecords(), getSettings(), isLocked()]);
  const summaries = sortSummaries(records.map((record) => summarizeRecord(record)));

  return {
    locked,
    recordCount: records.length,
    settings,
    records: summaries,
  };
}

async function handleUnlock(key) {
  const normalizedKey = ensureString(key);

  if (!normalizedKey.trim()) {
    throw new Error('Informe uma key não vazia.');
  }

  await setVaultKey(normalizedKey);
  return buildDashboardData();
}

async function handleSaveRecord(payload, keyOverride) {
  const settings = await getSettings();
  const records = await getRecords();
  const incoming = payload || {};
  const recordIndex = records.findIndex((record) => record.id === incoming.id);
  const currentRecord = recordIndex >= 0 ? records[recordIndex] : null;
  const plainPassword = incoming.plainPassword;

  const nextRecord = normalizeRecord(
    {
      ...currentRecord,
      ...incoming,
      encryptedPassword: currentRecord ? currentRecord.encryptedPassword : incoming.encryptedPassword,
      salt: currentRecord ? currentRecord.salt : incoming.salt,
    },
    settings.globalSalt,
  );

  if (!nextRecord.identifier) {
    throw new Error('Informe um identificador para o registro.');
  }

  if (plainPassword != null && plainPassword !== '') {
    const key = await resolveCryptoKey(keyOverride);
    nextRecord.salt = settings.globalSalt;
    nextRecord.encryptedPassword = encryptRecordPassword(plainPassword, key, nextRecord.salt);
  }

  if (!currentRecord && !nextRecord.encryptedPassword) {
    throw new Error('Informe uma senha para o novo registro.');
  }

  if (recordIndex >= 0) {
    records[recordIndex] = nextRecord;
  } else {
    records.push(nextRecord);
  }

  await saveRecords(records);
  return summarizeRecord(nextRecord);
}

async function handleDeleteRecord(recordId) {
  const records = await getRecords();
  const nextRecords = records.filter((record) => record.id !== recordId);
  await saveRecords(nextRecords);
  return {
    deleted: nextRecords.length !== records.length,
  };
}

async function handleGetAutofillRecords(currentUrl) {
  const [records, locked] = await Promise.all([getRecords(), isLocked()]);
  const summaries = sortSummaries(records.map((record) => summarizeRecord(record, currentUrl)));

  return {
    locked,
    records: summaries,
  };
}

async function handleGetRecordSecret(recordId, keyOverride) {
  const [records, settings, key] = await Promise.all([getRecords(), getSettings(), resolveCryptoKey(keyOverride)]);
  const record = records.find((item) => item.id === recordId);

  if (!record) {
    throw new Error('Registro não encontrado.');
  }

  return {
    id: record.id,
    identifier: record.identifier,
    username: record.username,
    password: decryptRecordPassword(record, key, settings),
  };
}

async function handleChangeGlobalSalt(newSalt, keyOverride) {
  const normalizedSalt = ensureString(newSalt);

  if (!normalizedSalt.trim()) {
    throw new Error('Informe um salt global não vazio.');
  }

  const [records, settings] = await Promise.all([getRecords(), getSettings()]);

  if (records.length === 0) {
    await saveSettings({
      ...settings,
      globalSalt: normalizedSalt,
    });

    return {
      migratedRecords: 0,
      globalSalt: normalizedSalt,
    };
  }

  const key = await resolveCryptoKey(keyOverride);
  const migratedRecords = records.map((record) => {
    const plainPassword = decryptRecordPassword(record, key, settings);
    return {
      ...record,
      salt: normalizedSalt,
      encryptedPassword: encryptRecordPassword(plainPassword, key, normalizedSalt),
    };
  });

  await saveRecords(migratedRecords);
  await saveSettings({
    ...settings,
    globalSalt: normalizedSalt,
  });

  return {
    migratedRecords: migratedRecords.length,
    globalSalt: normalizedSalt,
  };
}

async function handleExportCsv() {
  const records = await getRecords();
  const lines = [
    CSV_EXPORT_HEADERS.map(escapeCsvCell).join(','),
    ...records.map((record) =>
      CSV_EXPORT_HEADERS.map((header) => escapeCsvCell(AngelShieldCrypto.encodeBase64(record[header] || ''))).join(','),
    ),
  ];

  return {
    csv: lines.join('\n'),
  };
}

async function handleImportCsv(text, keyOverride) {
  const [settings, currentRecords] = await Promise.all([getSettings(), getRecords()]);
  const rows = parseCsv(ensureString(text));

  if (rows.length === 0) {
    throw new Error('O CSV está vazio.');
  }

  const headers = rows[0];
  const missingCommonHeaders = CSV_COMMON_HEADERS.filter((header) => !headers.includes(header));
  const hasEncryptedPasswordHeader = headers.includes('encryptedPassword');
  const hasPlainPasswordHeader = headers.includes('password');

  if (missingCommonHeaders.length > 0) {
    throw new Error(`CSV inválido. Cabeçalhos ausentes: ${missingCommonHeaders.join(', ')}`);
  }

  if (!hasEncryptedPasswordHeader && !hasPlainPasswordHeader) {
    throw new Error('CSV inválido. Informe ao menos um dos campos: encryptedPassword ou password.');
  }

  const recordMap = new Map(currentRecords.map((record) => [record.id, record]));
  let importedCount = 0;
  let importUsedPlainPassword = false;
  let cryptoKey = '';

  for (const row of rows.slice(1)) {
    if (row.every((cell) => ensureString(cell).trim() === '')) {
      continue;
    }

    const rawRecord = {};
    headers.forEach((header, index) => {
      rawRecord[header] = AngelShieldCrypto.decodeBase64(row[index] || '');
    });

    const plainPassword = ensureString(rawRecord.password);
    const encryptedPassword = ensureString(rawRecord.encryptedPassword);

    if (!rawRecord.identifier || (!plainPassword && !encryptedPassword)) {
      continue;
    }

    const normalizedRecord = normalizeRecord(
      {
        ...rawRecord,
        encryptedPassword: '',
        salt: settings.globalSalt,
      },
      settings.globalSalt,
    );

    if (plainPassword) {
      if (!cryptoKey) {
        cryptoKey = await resolveCryptoKey(keyOverride);
      }

      normalizedRecord.encryptedPassword = encryptRecordPassword(plainPassword, cryptoKey, settings.globalSalt);
      importUsedPlainPassword = true;
    } else {
      normalizedRecord.encryptedPassword = encryptedPassword;
    }

    normalizedRecord.salt = settings.globalSalt;

    recordMap.set(normalizedRecord.id, normalizedRecord);
    importedCount += 1;
  }

  await saveRecords(Array.from(recordMap.values()));
  return {
    importedCount,
    importedPlaintextPasswords: importUsedPlainPassword,
    totalRecords: recordMap.size,
  };
}

async function openManagerPage() {
  await chrome.tabs.create({
    url: chrome.runtime.getURL('src/manager/manager.html'),
  });

  return {
    opened: true,
  };
}

async function openAutofillPanelInActiveTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id) {
    return {
      opened: false,
      reason: 'Nenhuma aba ativa encontrada.',
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: OPEN_AUTOFILL_PANEL_MESSAGE,
    });

    return {
      opened: Boolean(response?.opened),
      reason: response?.reason,
    };
  } catch (error) {
    return {
      opened: false,
      reason: error?.message || 'Não foi possível abrir o autopreenchimento nesta aba.',
    };
  }
}

async function handleMessage(message) {
  switch (message?.type) {
    case 'GET_DASHBOARD_DATA':
      return buildDashboardData();
    case 'UNLOCK_VAULT':
      return handleUnlock(message.key);
    case 'LOCK_VAULT':
      await lockVault();
      return buildDashboardData();
    case 'SAVE_RECORD':
      return handleSaveRecord(message.record, message.key);
    case 'DELETE_RECORD':
      return handleDeleteRecord(message.id);
    case 'GET_AUTOFILL_RECORDS':
      return handleGetAutofillRecords(message.url);
    case 'GET_RECORD_SECRET':
      return handleGetRecordSecret(message.id, message.key);
    case 'CHANGE_GLOBAL_SALT':
      return handleChangeGlobalSalt(message.salt, message.key);
    case 'EXPORT_CSV':
      return handleExportCsv();
    case 'IMPORT_CSV':
      return handleImportCsv(message.csv, message.key);
    case 'OPEN_MANAGER_PAGE':
      return openManagerPage();
    default:
      throw new Error('Mensagem desconhecida.');
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initializeStorage();
});

chrome.runtime.onStartup.addListener(() => {
  initializeStorage();
});

chrome.action.onClicked.addListener(() => {
  openManagerPage();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === OPEN_AUTOFILL_PANEL_COMMAND) {
    openAutofillPanelInActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse({ success: false, error: error.message }));

  return true;
});

initializeStorage();
