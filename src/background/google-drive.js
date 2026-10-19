(function attachGoogleDrive(root) {
  const { fail } = root.AngelShieldVaultSync;
  const CONFIG = 'angelshield.googleConfig';
  const AUTH = 'angelshield.googleAuth';
  const ACCESS = 'angelshield.googleAccess';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3/';
  const TOKEN = 'https://oauth2.googleapis.com/token';
  const MARKER = 'angelshield';
  const DEFAULT_CONFIG = { clientId: '', clientSecret: '', folderName: 'AngelShield' };
  const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

  async function config() {
    const stored = (await chrome.storage.local.get(CONFIG))[CONFIG] || {};
    const { clientId, clientSecret, folderName } = { ...DEFAULT_CONFIG, ...stored };
    const settings = { clientId, clientSecret, folderName };
    if (Object.hasOwn(stored, 'apiKey') || Object.hasOwn(stored, 'folderId')) {
      await chrome.storage.local.set({ [CONFIG]: settings });
    }
    return settings;
  }

  async function auth() {
    return (await chrome.storage.local.get(AUTH))[AUTH] || null;
  }

  function redirectUrl() {
    return chrome.identity.getRedirectURL('google');
  }

  async function publicState() {
    const settings = await config();
    const connection = await auth();
    return {
      config: {
        clientId: settings.clientId, hasClientSecret: Boolean(settings.clientSecret),
        folderName: settings.folderName,
      },
      connected: Boolean(connection?.refreshToken && connection.clientId === settings.clientId),
      account: connection?.account || null,
      redirectUrl: redirectUrl(),
    };
  }

  async function clearAuth() {
    await chrome.storage.local.remove(AUTH);
    await chrome.storage.session.remove(ACCESS);
  }

  async function saveConfig(input) {
    const previous = await config();
    const next = {
      clientId: String(input.clientId || '').trim(),
      clientSecret: String(input.clientSecret || '').trim() || previous.clientSecret,
      folderName: String(input.folderName || '').trim() || 'AngelShield',
    };
    if (next.clientId && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(next.clientId)) {
      fail('Informe um Client ID válido do Google Cloud.');
    }
    if (next.clientId !== previous.clientId || next.clientSecret !== previous.clientSecret) await clearAuth();
    await chrome.storage.local.set({ [CONFIG]: next });
    return publicState();
  }

  async function validateConnection() {
    const current = await publicState();
    if (!current.config.clientId || !current.config.hasClientSecret || !current.connected) {
      return { ...current, connectionValid: false, connectionError: '' };
    }
    try {
      const data = await request('about?fields=user(permissionId)');
      if (!data.user?.permissionId || data.user.permissionId !== current.account?.id) {
        await clearAuth();
        fail('Não foi possível confirmar a conta do Drive. Conecte sua conta Google novamente.', 'GOOGLE_RECONNECT');
      }
      return { ...(await publicState()), connectionValid: true, connectionError: '' };
    } catch (error) {
      return { ...(await publicState()), connectionValid: false, connectionError: error.message };
    }
  }

  async function fetchResponse(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      return await fetch(url, { ...options, signal: controller.signal, credentials: 'omit', redirect: 'error' });
    } catch (error) {
      fail(error.name === 'AbortError'
        ? 'O Google demorou para responder. Tente novamente manualmente.'
        : 'Não foi possível acessar o Google. Verifique a conexão e tente novamente.', 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  async function tokenRequest(parameters) {
    const response = await fetchResponse(TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      if (data.error === 'invalid_grant') {
        await clearAuth();
        fail('A autorização Google expirou ou foi revogada. Conecte sua conta novamente.', 'GOOGLE_RECONNECT');
      }
      fail('Não foi possível obter autorização. Confira Client ID, Client Secret e o redirecionamento no Google Cloud.', 'GOOGLE_AUTH');
    }
    return data;
  }

  async function storeAccess(data, clientId) {
    await chrome.storage.session.set({ [ACCESS]: {
      token: data.access_token, clientId, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    } });
  }

  const base64url = (bytes) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function connect() {
    const settings = await config();
    if (!settings.clientId || !settings.clientSecret) fail('Salve Client ID e Client Secret antes de conectar.');
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    let verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: settings.clientId, redirect_uri: redirectUrl(), response_type: 'code',
      scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256',
      access_type: 'offline', prompt: 'consent select_account',
    });
    let callback;
    try {
      callback = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
    } catch (error) {
      fail('Conexão Google cancelada ou não concluída. Confira também o redirecionamento cadastrado.', 'GOOGLE_AUTH');
    }
    const result = new URL(callback || 'https://invalid.invalid/');
    const expected = new URL(redirectUrl());
    if (result.origin !== expected.origin || result.pathname !== expected.pathname || result.searchParams.get('state') !== state) {
      fail('Resposta OAuth inválida. Inicie a conexão novamente.', 'GOOGLE_AUTH');
    }
    if (result.searchParams.has('error') || !result.searchParams.get('code')) fail('A permissão do Drive não foi concedida.', 'GOOGLE_AUTH');
    let tokens;
    try {
      tokens = await tokenRequest({
        client_id: settings.clientId, client_secret: settings.clientSecret,
        redirect_uri: redirectUrl(), grant_type: 'authorization_code',
        code: result.searchParams.get('code'), code_verifier: verifier,
      });
    } finally {
      verifier = '';
    }
    if (!tokens.refresh_token || !String(tokens.scope || '').split(' ').includes(SCOPE)) {
      fail('O Google não concedeu acesso persistente ao Drive. Reconecte e permita o acesso solicitado.', 'GOOGLE_AUTH');
    }
    await clearAuth();
    await storeAccess(tokens, settings.clientId);
    const userResponse = await fetchResponse(`${API}about?fields=user`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !userData.user?.permissionId) {
      await chrome.storage.session.remove(ACCESS);
      fail('Não foi possível identificar a conta do Drive. Conecte novamente.', 'GOOGLE_AUTH');
    }
    await chrome.storage.local.set({ [AUTH]: {
      clientId: settings.clientId, refreshToken: tokens.refresh_token,
      account: {
        id: userData.user.permissionId, email: userData.user.emailAddress || '', name: userData.user.displayName || '',
      },
    } });
    return publicState();
  }

  async function accessToken(force = false) {
    const settings = await config();
    const connection = await auth();
    if (!connection?.refreshToken || connection.clientId !== settings.clientId) {
      fail('Conecte sua conta Google para continuar.', 'GOOGLE_RECONNECT');
    }
    const cached = (await chrome.storage.session.get(ACCESS))[ACCESS];
    if (!force && cached?.clientId === settings.clientId && cached.expiresAt > Date.now() + 60000) return cached.token;
    const tokens = await tokenRequest({
      client_id: settings.clientId, client_secret: settings.clientSecret,
      refresh_token: connection.refreshToken, grant_type: 'refresh_token',
    });
    if (tokens.refresh_token) await chrome.storage.local.set({ [AUTH]: { ...connection, refreshToken: tokens.refresh_token } });
    await storeAccess(tokens, settings.clientId);
    return tokens.access_token;
  }

  async function request(path, options = {}, media = false) {
    const url = new URL(path.startsWith('https://www.googleapis.com/') ? path : `${API}${path}`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await accessToken(attempt === 1);
      const response = await fetchResponse(url.href, {
        ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const reason = data.error?.errors?.[0]?.reason;
        if (response.status === 401) {
          await clearAuth();
          fail('A autorização Google não é mais válida. Reconecte sua conta.', 'GOOGLE_RECONNECT');
        }
        if (response.status === 404) fail('O arquivo ou a pasta não está disponível para o aplicativo.', 'DRIVE_NOT_FOUND');
        if (response.status === 409) fail('Este arquivo já existe no Drive.', 'DRIVE_EXISTS');
        if (response.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
          fail('O limite de solicitações do Google foi atingido. Tente novamente mais tarde.', 'DRIVE_RATE_LIMIT');
        }
        if (response.status === 403) fail('Acesso negado. Confira a permissão do Drive e se a API está habilitada no Google Cloud.', 'DRIVE_FORBIDDEN');
        fail('O Google Drive não concluiu a operação. Tente novamente manualmente.', 'DRIVE_ERROR');
      }
      if (!media) return response.json();
      if (Number(response.headers.get('Content-Length')) > MAX_BACKUP_BYTES) fail('O backup excede o limite de 10 MiB.');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BACKUP_BYTES) {
          await reader.cancel();
          fail('O backup excede o limite de 10 MiB.');
        }
        chunks.push(value);
      }
      return new Blob(chunks).text();
    }
  }

  const escapeQuery = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function list(q, fields) {
    const files = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields: `nextPageToken,incompleteSearch,files(${fields})` });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await request(`files?${params}`);
      if (data.incompleteSearch) fail('O Drive retornou uma consulta incompleta. Tente consultar novamente.');
      files.push(...data.files);
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return files;
  }

  async function folder(create = false) {
    const settings = await config();
    const matches = await list(`trashed = false and name = '${escapeQuery(settings.folderName)}' and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='${MARKER}' and value='folder-v1' }`, 'id,name');
    if (matches.length > 1) fail('Há mais de uma pasta do AngelShield com este nome. Renomeie as pastas repetidas no Drive ou configure outro nome de pasta.');
    let selected = matches[0];
    if (!selected && create) selected = await request('files?fields=id,name', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: settings.folderName, mimeType: 'application/vnd.google-apps.folder', appProperties: { [MARKER]: 'folder-v1' } }),
    });
    return selected || null;
  }

  async function binding(folderId) {
    const settings = await config();
    const connection = await auth();
    if (!connection?.account?.id) fail('Conecte sua conta Google.', 'GOOGLE_RECONNECT');
    return `${settings.clientId}:${connection.account.id}:${folderId}`;
  }

  const FILE_FIELDS = 'id,name,appProperties,md5Checksum,version,createdTime';
  async function snapshots(folderId) {
    return list(`trashed = false and '${escapeQuery(folderId)}' in parents and appProperties has { key='${MARKER}' and value='snapshot-v1' }`, FILE_FIELDS);
  }

  async function generateId() {
    const data = await request('files/generateIds?count=1&space=drive&type=files');
    return data.ids[0];
  }

  async function upload(folderId, fileId, revision, parentIds, csv) {
    if (new TextEncoder().encode(csv).length > MAX_BACKUP_BYTES) fail('O backup excede o limite de 10 MiB.');
    const date = new Date(revision.updatedAt);
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('_');
    const appProperties = {
      [MARKER]: 'snapshot-v1', revisionId: revision.id, number: String(revision.number), updatedAt: revision.updatedAt,
    };
    // Drive permits 30 private properties per app and 124 bytes per key/value pair.
    // Pack UUIDs while keeping both limits, including the four fixed properties.
    const parentGroups = [];
    for (const id of parentIds) {
      const last = parentGroups.length - 1;
      if (last >= 0 && parentGroups[last].length + id.length + 1 <= 110) parentGroups[last] += `,${id}`;
      else parentGroups.push(id);
    }
    if (parentGroups.length > 26) fail('Há muitas ramificações para uma única publicação no Drive.');
    parentGroups.forEach((ids, index) => { appProperties[`parent${index}`] = ids; });
    const metadata = { id: fileId, name: `angelshield_v${revision.number}_${day}_${revision.id}.csv`,
      mimeType: 'text/csv', parents: [folderId], appProperties };
    const boundary = `angelshield_${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n${csv}\r\n--${boundary}--`,
    ]);
    return request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
  }

  async function disconnect() {
    const connection = await auth();
    await clearAuth();
    let revoked = true;
    if (connection?.refreshToken) {
      try {
        const response = await fetchResponse('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: connection.refreshToken }),
        });
        revoked = response.ok;
      } catch (error) { revoked = false; }
    }
    return { ...(await publicState()), revoked };
  }

  root.AngelShieldGoogleDrive = {
    publicState, saveConfig, validateConnection, connect, disconnect, folder, binding, snapshots, generateId, upload,
    download: (fileId) => request(`files/${encodeURIComponent(fileId)}?alt=media`, {}, true),
    file: (fileId) => request(`files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS},trashed`),
  };
})(self);
