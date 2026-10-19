(function attachVaultSync(root) {
  const { CSV_EXPORT_HEADERS, createRecordId, ensureString } = root.AngelShieldShared;

  function fail(message, code = 'SYNC_ERROR') {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  // This allowlist is also the boundary that keeps every salt out of Drive.
  function portableRecords(records) {
    return records.map((record) => Object.fromEntries(
      CSV_EXPORT_HEADERS.map((field) => [field, ensureString(record[field])]),
    )).sort((left, right) => left.id.localeCompare(right.id));
  }

  function signature(records) {
    return JSON.stringify(portableRecords(records));
  }

  function revision(number = 0) {
    if (!Number.isSafeInteger(number) || number < 0) fail('O limite de numeração de versões foi atingido.');
    return { number, id: createRecordId(), updatedAt: new Date().toISOString() };
  }

  function serializeCsv(records) {
    const cell = (value) => `"${ensureString(value).replace(/"/g, '""')}"`;
    return [
      CSV_EXPORT_HEADERS.map(cell).join(','),
      ...portableRecords(records).map((record) => CSV_EXPORT_HEADERS
        .map((field) => cell(root.AngelShieldCrypto.encodeBase64(record[field]))).join(',')),
    ].join('\n');
  }

  function parseSnapshot(csv, parseCsv, localSalt) {
    const rows = parseCsv(csv);
    const headers = rows.shift() || [];
    if (CSV_EXPORT_HEADERS.some((field) => !headers.includes(field)) || new Set(headers).size !== headers.length) {
      fail('O arquivo do Drive não tem os cabeçalhos de backup esperados.');
    }
    const ids = new Set();
    return rows.filter((row) => row.some((value) => value !== '')).map((row) => {
      if (row.length !== headers.length) fail('Há uma linha inválida no backup do Drive.');
      const record = Object.fromEntries(CSV_EXPORT_HEADERS.map((field) => [
        field, root.AngelShieldCrypto.decodeBase64(row[headers.indexOf(field)] || ''),
      ]));
      if (!record.id || !record.identifier.trim() || !record.encryptedPassword || ids.has(record.id)) {
        fail('O backup contém uma credencial inválida ou IDs repetidos.');
      }
      ids.add(record.id);
      // Remote salt columns, if present, are deliberately never read.
      return { ...record, salt: localSalt };
    });
  }

  function differences(localRecords, remoteRecords, key, localSalt) {
    const local = new Map(localRecords.map((record) => [record.id, record]));
    const remote = new Map(remoteRecords.map((record) => [record.id, record]));
    const result = [];
    const expose = (record, fromDrive) => record ? {
      id: record.id,
      identifier: record.identifier,
      username: record.username,
      link: record.link,
      hint: record.hint,
      password: root.AngelShieldCrypto.decrypt(
        record.encryptedPassword, key, fromDrive ? localSalt : record.salt || localSalt,
      ),
    } : null;
    for (const id of new Set([...local.keys(), ...remote.keys()])) {
      const left = expose(local.get(id), false);
      const right = expose(remote.get(id), true);
      const fields = ['identifier', 'username', 'link', 'hint', 'password'];
      const changedFields = fields.filter((field) => left?.[field] !== right?.[field]);
      if (left && right && !changedFields.length) continue;
      result.push({
        id, type: !left ? 'driveOnly' : !right ? 'localOnly' : 'different',
        local: left, drive: right, changedFields,
      });
    }
    return result.sort((left, right) => (left.local || left.drive).identifier
      .localeCompare((right.local || right.drive).identifier, 'pt-BR'));
  }

  root.AngelShieldVaultSync = { fail, portableRecords, signature, revision, serializeCsv, parseSnapshot, differences };
})(self);
