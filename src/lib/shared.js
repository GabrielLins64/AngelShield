(function attachAngelShieldShared(root) {
  const STORAGE_KEYS = {
    records: 'angelshield.records',
    settings: 'angelshield.settings',
    vaultKey: 'angelshield.vaultKey',
  };

  const DEFAULT_SETTINGS = {
    globalSalt: 'angelshield-default-salt',
  };

  const CSV_EXPORT_HEADERS = [
    'id',
    'identifier',
    'username',
    'link',
    'encryptedPassword',
    'hint',
  ];

  const CSV_COMMON_HEADERS = [
    'id',
    'identifier',
    'username',
    'link',
    'hint',
  ];

  function ensureString(value) {
    return value == null ? '' : String(value);
  }

  function createRecordId() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }

    return `record_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function extractHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch (error) {
      return '';
    }
  }

  function scoreRecordMatch(recordLink, currentUrl) {
    const recordHost = extractHostname(recordLink);
    const currentHost = extractHostname(currentUrl);

    if (!recordHost || !currentHost) {
      return 0;
    }

    if (recordHost === currentHost) {
      return 3;
    }

    if (currentHost.endsWith(`.${recordHost}`) || recordHost.endsWith(`.${currentHost}`)) {
      return 2;
    }

    if (currentHost.includes(recordHost) || recordHost.includes(currentHost)) {
      return 1;
    }

    return 0;
  }

  root.AngelShieldShared = {
    CSV_COMMON_HEADERS,
    CSV_EXPORT_HEADERS,
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    createRecordId,
    ensureString,
    extractHostname,
    scoreRecordMatch,
  };
})(typeof self !== 'undefined' ? self : window);
