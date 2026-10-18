(function attachAngelShieldCrypto(root) {
  const printable = Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join('');
  const extended = 'çáéíóúàèìòùâêîôûãõñäëïöüÿÇÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÑÄËÏÖÜŸ\n\t';
  const validCharacters = `${printable}${extended}`;
  const characterList = Array.from(validCharacters);
  const charToInt = new Map(characterList.map((char, index) => [char, index]));
  const intToChar = new Map(characterList.map((char, index) => [index, char]));
  const characterCount = characterList.length;

  function splitSpaces(key) {
    return String(key ?? '').trim().split(' ');
  }

  function addSalt(keys, salt) {
    return keys.map((keyPart) => `${keyPart}${salt}`);
  }

  function hashKeys(keys) {
    return keys.map((keyPart) => root.AngelShieldBlake2b.blake2bHex(keyPart));
  }

  function getKeys(key, salt, reverse = false) {
    const splitKey = splitSpaces(key);
    const orderedKeys = reverse ? [...splitKey].reverse() : splitKey;
    return hashKeys(addSalt(orderedKeys, salt));
  }

  function getUnsupportedCharacters(text) {
    const uniqueUnsupported = new Set();

    for (const char of Array.from(String(text ?? ''))) {
      if (!charToInt.has(char)) {
        uniqueUnsupported.add(char);
      }
    }

    return Array.from(uniqueUnsupported);
  }

  function assertSupportedText(text) {
    const unsupported = getUnsupportedCharacters(text);

    if (unsupported.length > 0) {
      throw new Error(`A senha contém caracteres não suportados pela cifra: ${unsupported.join(' ')}`);
    }
  }

  function transform(password, keys, direction) {
    let transformed = String(password ?? '');

    for (const key of keys) {
      let keyIndex = 0;
      let partial = '';
      const keyLength = key.length;

      for (const char of Array.from(transformed)) {
        const charIndex = charToInt.get(char);
        const keyCharIndex = charToInt.get(key[keyIndex]);

        if (charIndex == null || keyCharIndex == null) {
          throw new Error('Texto incompatível com o alfabeto configurado.');
        }

        const nextIndex =
          direction === 'encrypt'
            ? (charIndex + keyCharIndex) % characterCount
            : (charIndex - keyCharIndex + characterCount) % characterCount;

        partial += intToChar.get(nextIndex);
        keyIndex = (keyIndex + 1) % keyLength;
      }

      transformed = partial;
    }

    return transformed;
  }

  function encrypt(password, key, salt) {
    assertSupportedText(password);
    return transform(password, getKeys(key, salt, false), 'encrypt');
  }

  function decrypt(password, key, salt) {
    return transform(password, getKeys(key, salt, true), 'decrypt');
  }

  function bytesToBase64(bytes) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binary);
  }

  function base64ToBytes(encodedText) {
    return Uint8Array.from(atob(encodedText), (char) => char.charCodeAt(0));
  }

  function encodeBase64(text) {
    return bytesToBase64(new TextEncoder().encode(String(text ?? '')));
  }

  function decodeBase64(encodedText) {
    const normalized = String(encodedText ?? '');

    if (normalized.length % 4 !== 0) {
      return normalized;
    }

    try {
      const bytes = base64ToBytes(normalized);
      const decoded = new TextDecoder().decode(bytes);
      return encodeBase64(decoded) === normalized ? decoded : normalized;
    } catch (error) {
      return normalized;
    }
  }

  async function deriveSessionMaskKey(salt) {
    // O salt não é secreto: esta camada apenas mascara a key no storage da sessão.
    const material = new TextEncoder().encode(`angelshield:vault-key:v1:${salt}`);
    const digest = await root.crypto.subtle.digest('SHA-256', material);
    return root.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function maskVaultKey(key, salt) {
    const normalizedSalt = String(salt ?? '');
    const maskKey = await deriveSessionMaskKey(normalizedSalt);
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(String(key ?? '')));
    const ciphertext = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, maskKey, plaintext);

    return {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  }

  async function unmaskVaultKey(maskedKey, salt) {
    if (
      maskedKey?.version !== 1 ||
      typeof maskedKey.iv !== 'string' ||
      typeof maskedKey.ciphertext !== 'string'
    ) {
      throw new Error('Formato inválido da key de sessão.');
    }

    const iv = base64ToBytes(maskedKey.iv);
    if (iv.length !== 12) {
      throw new Error('IV inválido da key de sessão.');
    }

    const maskKey = await deriveSessionMaskKey(String(salt ?? ''));
    const plaintext = await root.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      maskKey,
      base64ToBytes(maskedKey.ciphertext),
    );
    const key = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));

    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('Key de sessão inválida.');
    }

    return key;
  }

  root.AngelShieldCrypto = {
    decrypt,
    decodeBase64,
    encodeBase64,
    encrypt,
    getKeys,
    getUnsupportedCharacters,
    maskVaultKey,
    unmaskVaultKey,
    validCharacters,
  };
})(typeof self !== 'undefined' ? self : window);
