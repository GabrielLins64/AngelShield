(function attachDriveSync(root) {
  const tools = root.AngelShieldVaultSync;
  const drive = root.AngelShieldGoogleDrive;
  const REVISION = 'angelshield.vaultRevision';
  const SYNC = 'angelshield.driveSync';
  const PENDING = 'angelshield.drivePendingUpload';
  const CONTEXT_TTL = 15 * 60 * 1000;

  function create(dependencies) {
    const { getRecords, getSettings, getRevision, resolveCryptoKey, requireVaultKey, isLocked, parseCsv } = dependencies;
    const contexts = new Map();

    const invalidate = () => contexts.clear();
    async function state() {
      const pending = (await chrome.storage.local.get(PENDING))[PENDING];
      return {
        ...(await drive.publicState()), revision: await getRevision(),
        pendingUpload: pending ? { number: pending.revision.number, fileId: pending.fileId } : null,
      };
    }

    function metadata(file) {
      const properties = file.appProperties || {};
      const number = Number(properties.number);
      const id = properties.revisionId;
      if (!Number.isSafeInteger(number) || number < 0 || !/^[\w-]{8,80}$/.test(id || '')
        || !properties.updatedAt || !Number.isFinite(Date.parse(properties.updatedAt))) {
        tools.fail(`O arquivo “${file.name || file.id}” tem metadados de versão inválidos.`);
      }
      const parents = Object.entries(properties).filter(([key]) => /^parent\d+$/.test(key))
        .flatMap(([, value]) => String(value).split(',')).sort();
      return {
        fileId: file.id, name: file.name, revision: { id, number, updatedAt: properties.updatedAt },
        parents, checksum: file.md5Checksum || '', fileVersion: file.version || '',
      };
    }

    function inventory(files) {
      const versions = files.map(metadata).sort((left, right) => right.revision.number - left.revision.number
        || right.revision.updatedAt.localeCompare(left.revision.updatedAt) || left.fileId.localeCompare(right.fileId));
      const ancestors = new Set(versions.flatMap((item) => item.parents));
      const heads = versions.filter((item) => !ancestors.has(item.revision.id));
      if (versions.length && !heads.length) tools.fail('O histórico do Drive contém relações de versões inválidas.');
      const signature = JSON.stringify([...versions].sort((a, b) => a.fileId.localeCompare(b.fileId)));
      return { versions, heads, signature };
    }

    async function remote(createFolder = false) {
      const folder = await drive.folder(createFolder);
      if (!folder) return { folder: null, versions: [], heads: [], signature: '[]', binding: '' };
      return { folder, binding: await drive.binding(folder.id), ...inventory(await drive.snapshots(folder.id)) };
    }

    function remoteVersion(result) {
      return {
        latest: result.heads[0]?.revision || null,
        heads: result.heads.map((item) => item.revision),
      };
    }

    async function list() {
      const result = await remote();
      return {
        state: await state(), folder: result.folder, remoteVersion: remoteVersion(result),
        versions: result.versions.map((item) => ({ ...item, head: result.heads.includes(item) })),
        branched: result.heads.length > 1,
      };
    }

    function context(id) {
      const value = contexts.get(id);
      if (!value || value.expiresAt <= Date.now()) {
        contexts.delete(id);
        tools.fail('A revisão desta operação expirou. Consulte as versões e inicie novamente.', 'CONTEXT_EXPIRED');
      }
      return value;
    }

    async function validate(value) {
      if (contexts.get(value.id) !== value || value.expiresAt <= Date.now()) {
        tools.fail('Esta revisão foi encerrada. Inicie novamente a operação.', 'CONTEXT_EXPIRED');
      }
      const localRevision = await getRevision();
      const settings = await getSettings();
      if (localRevision.id !== value.localRevision.id || settings.globalSalt !== value.localSalt) {
        invalidate();
        tools.fail('O cofre local mudou. Inicie novamente a revisão das versões.', 'CONTEXT_EXPIRED');
      }
      const current = await remote();
      if (contexts.get(value.id) !== value) tools.fail('O cofre foi trancado durante a operação. Inicie novamente.', 'CONTEXT_EXPIRED');
      if (current.binding !== value.binding || current.signature !== value.remote.signature) {
        invalidate();
        tools.fail('O histórico do Drive mudou. Consulte novamente e revise as cópias antes de continuar.', 'CONTEXT_EXPIRED');
      }
      return current;
    }

    function select(value, fileId) {
      const selected = value.remote.versions.find((item) => item.fileId === (fileId || value.selectedFileId));
      if (!selected) tools.fail('Selecione uma versão da consulta atual.');
      return selected;
    }

    async function recordsFromDrive(value, fileId) {
      const selected = select(value, fileId);
      if (!value.records.has(selected.fileId)) {
        const csv = await drive.download(selected.fileId);
        value.records.set(selected.fileId, tools.parseSnapshot(csv, parseCsv, value.localSalt));
      }
      return value.records.get(selected.fileId);
    }

    async function prepare(message) {
      if (!['upload', 'download'].includes(message.action)) tools.fail('Operação do Drive inválida.');
      await resolveCryptoKey(message.key);
      const result = await remote(message.action === 'upload');
      if (!result.folder) tools.fail('Ainda não há uma pasta de backup. Envie uma versão primeiro.');
      const localRevision = await getRevision();
      const localRecords = await getRecords();
      const settings = await getSettings();
      const synchronization = (await chrome.storage.local.get(SYNC))[SYNC];
      for (const [id, value] of contexts) if (value.expiresAt <= Date.now()) contexts.delete(id);
      const value = {
        id: crypto.randomUUID(), expiresAt: Date.now() + CONTEXT_TTL,
        binding: result.binding, remote: result, localRevision, localSalt: settings.globalSalt,
        action: message.action, selectedFileId: message.fileId || result.heads[0]?.fileId || '',
        records: new Map(), status: 'conflict',
      };
      const clean = synchronization?.binding === result.binding && synchronization.baseRevisionId === localRevision.id;
      let selected = null;
      if (message.action === 'download') selected = select(value);
      else if (result.heads.length === 1) selected = result.heads[0];
      if (selected?.revision.id === localRevision.id && result.heads.length <= 1
        && tools.signature(localRecords) === tools.signature(await recordsFromDrive(value, selected.fileId))) {
        const fresh = await remote();
        if (fresh.signature !== result.signature || fresh.binding !== result.binding) {
          tools.fail('O Drive mudou durante a consulta. Consulte novamente.', 'CONTEXT_EXPIRED');
        }
        await chrome.storage.local.set({ [SYNC]: { binding: result.binding, baseRevisionId: localRevision.id } });
        return { status: 'unchanged', state: await state(), remoteVersion: remoteVersion(fresh) };
      }
      if (message.action === 'upload') {
        if (!result.versions.length || (result.heads.length === 1
          && synchronization?.binding === result.binding
          && synchronization.baseRevisionId === result.heads[0].revision.id
          && localRevision.number > result.heads[0].revision.number)) value.status = 'ready';
      } else if (result.heads.length <= 1 && (localRecords.length === 0 && localRevision.number === 0
        || clean && selected.revision.number !== localRevision.number)) {
        value.status = 'ready';
      }
      contexts.set(value.id, value);
      return {
        status: value.status, contextId: value.id, action: value.action, remoteVersion: remoteVersion(result),
        local: { revision: localRevision, count: localRecords.length },
        selectedFileId: value.selectedFileId,
        // Include the selected historical file even when it isn't a remote head.
        versions: result.versions.filter((item) => result.heads.includes(item) || item.fileId === value.selectedFileId),
        locked: await isLocked(),
      };
    }

    async function compare(message) {
      const key = await requireVaultKey();
      const value = context(message.contextId);
      await validate(value);
      const localRecords = await getRecords();
      const remoteRecords = await recordsFromDrive(value, message.fileId);
      if (contexts.get(value.id) !== value) tools.fail('O cofre foi trancado durante a comparação.', 'CONTEXT_EXPIRED');
      const differences = tools.differences(localRecords, remoteRecords, key, value.localSalt);
      await validate(value);
      // Do not keep a key or plaintext differences in the coordinator.
      return { differences, equalCount: localRecords.length + remoteRecords.length
        - new Set([...localRecords, ...remoteRecords].map((item) => item.id)).size
        - differences.filter((item) => item.type === 'different').length };
    }

    async function publish(value, records, candidateRevision) {
      const csv = tools.serializeCsv(records);
      const parents = [...new Set(value.remote.heads.map((item) => item.revision.id))].sort();
      let pending = (await chrome.storage.local.get(PENDING))[PENDING];
      if (pending) {
        if (pending.binding !== value.binding || pending.localRevisionId !== value.localRevision.id
          || pending.csv !== csv || pending.revision.number !== candidateRevision.number
          || JSON.stringify(pending.parents) !== JSON.stringify(parents)) {
          tools.fail('Há um envio pendente de confirmação. Use “Verificar envio pendente” antes de publicar outra cópia.', 'PENDING_UPLOAD');
        }
      } else {
        pending = {
          binding: value.binding, localRevisionId: value.localRevision.id, csv, parents,
          revision: candidateRevision, fileId: await drive.generateId(),
        };
        // Contains only portable encrypted CSV and revision metadata; never salt or vault key.
        await chrome.storage.local.set({ [PENDING]: pending });
      }
      try {
        await drive.upload(value.remote.folder.id, pending.fileId, pending.revision, pending.parents, pending.csv);
      } catch (error) {
        if (error.code !== 'DRIVE_EXISTS') throw error;
        const existing = metadata(await drive.file(pending.fileId));
        if (existing.revision.id !== pending.revision.id || await drive.download(pending.fileId) !== pending.csv) {
          tools.fail('O arquivo do envio pendente foi alterado. Consulte o histórico antes de continuar.');
        }
      }
      const after = await remote();
      if (contexts.get(value.id) !== value) {
        tools.fail('A cópia foi preservada no Drive, mas a revisão foi encerrada. Verifique o envio pendente antes de continuar.', 'CONTEXT_EXPIRED');
      }
      if (after.heads.length !== 1 || after.heads[0].fileId !== pending.fileId) {
        invalidate();
        tools.fail('A cópia foi preservada no Drive, mas outro dispositivo publicou durante o envio. Consulte as versões para resolver as ramificações.', 'CONTEXT_EXPIRED');
      }
      return pending.revision;
    }

    async function commit(message) {
      const value = context(message.contextId);
      const resolution = ['local', 'remote', 'merge'].includes(message.mode);
      if (value.status === 'ready' ? message.mode !== value.action : !resolution) tools.fail('Escolha uma resolução válida para esta operação.');
      const key = message.mode === 'merge' ? await requireVaultKey() : await resolveCryptoKey(message.key);
      await validate(value);
      let records = await getRecords();
      let nextRevision = value.localRevision;
      if (message.mode === 'download' || message.mode === 'remote') {
        records = await recordsFromDrive(value, message.fileId);
        nextRevision = select(value, message.fileId).revision;
      }
      if (message.mode === 'merge') {
        const incoming = await recordsFromDrive(value, message.fileId);
        const differences = tools.differences(records, incoming, key, value.localSalt);
        const choices = message.choices || {};
        if (Object.keys(choices).some((id) => !differences.some((item) => item.id === id))) tools.fail('A seleção contém uma credencial desconhecida.');
        const merged = new Map(records.map((record) => [record.id, record]));
        const incomingById = new Map(incoming.map((record) => [record.id, record]));
        for (const difference of differences) {
          const allowed = difference.type === 'different' ? ['local', 'drive']
            : difference.type === 'localOnly' ? ['local', 'remove'] : ['drive', 'remove'];
          const choice = choices[difference.id];
          if (!allowed.includes(choice)) tools.fail('Escolha o resultado de todas as diferenças antes de publicar.');
          if (choice === 'remove') merged.delete(difference.id);
          else if (choice === 'drive') merged.set(difference.id, incomingById.get(difference.id));
        }
        records = [...merged.values()];
      }
      if (resolution) nextRevision = tools.revision(value.remote.versions.reduce(
        (maximum, item) => Math.max(maximum, item.revision.number), value.localRevision.number,
      ) + 1);
      // A remote file may have changed while its CSV was being downloaded.
      await validate(value);
      if (message.mode !== 'download') nextRevision = await publish(value, records, nextRevision);
      else await validate(value);
      // Only record data, revision and sync base change. Settings and masked vault key are untouched.
      await chrome.storage.local.set({
        [root.AngelShieldShared.STORAGE_KEYS.records]: records,
        [REVISION]: nextRevision,
        [SYNC]: { binding: value.binding, baseRevisionId: nextRevision.id },
      });
      if (message.mode !== 'download') await chrome.storage.local.remove(PENDING);
      invalidate();
      return { state: await state(), count: records.length, revision: nextRevision };
    }

    async function recoverPending() {
      const pending = (await chrome.storage.local.get(PENDING))[PENDING];
      if (!pending) return { found: false, state: await state() };
      const current = await remote();
      if (current.binding !== pending.binding) tools.fail('Use a conta Google e o Nome da pasta do envio pendente para verificá-lo.');
      let found = false;
      try {
        const file = await drive.file(pending.fileId);
        if (!file.trashed) {
          if (metadata(file).revision.id !== pending.revision.id || await drive.download(pending.fileId) !== pending.csv) {
            tools.fail('O arquivo pendente foi alterado. Verifique-o diretamente no Drive.');
          }
          found = true;
        }
      } catch (error) {
        if (error.code !== 'DRIVE_NOT_FOUND') throw error;
      }
      await chrome.storage.local.remove(PENDING);
      return { found, state: await state() };
    }

    async function handle(message) {
      switch (message.type) {
        case 'DRIVE_GET_STATE': return state();
        case 'DRIVE_VALIDATE_CONNECTION': return { ...(await drive.validateConnection()), revision: await getRevision() };
        case 'DRIVE_GET_REMOTE_VERSION': return { remoteVersion: remoteVersion(await remote()) };
        case 'DRIVE_SAVE_CONFIG': invalidate(); return { ...(await drive.saveConfig(message.config || {})), revision: await getRevision() };
        case 'DRIVE_CONNECT': invalidate(); await drive.connect(); return state();
        case 'DRIVE_DISCONNECT': invalidate(); return { ...(await drive.disconnect()), revision: await getRevision() };
        case 'DRIVE_LIST_VERSIONS': return list();
        case 'DRIVE_PREPARE': return prepare(message);
        case 'DRIVE_COMPARE': return compare(message);
        case 'DRIVE_COMMIT': return commit(message);
        case 'DRIVE_RECOVER_PENDING': return recoverPending();
        case 'DRIVE_DISCARD_CONTEXT': contexts.delete(message.contextId); return { discarded: true };
        default: tools.fail('Operação do Drive desconhecida.');
      }
    }
    return { handle, invalidate };
  }

  root.AngelShieldDriveSync = { create };
})(self);
