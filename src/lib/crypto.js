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

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(String(text ?? ''));
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binary);
  }

  function decodeBase64(encodedText) {
    const normalized = String(encodedText ?? '');

    if (normalized.length % 4 !== 0) {
      return normalized;
    }

    try {
      const binary = atob(normalized);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      return encodeBase64(decoded) === normalized ? decoded : normalized;
    } catch (error) {
      return normalized;
    }
  }

  root.AngelShieldCrypto = {
    decrypt,
    decodeBase64,
    encodeBase64,
    encrypt,
    getKeys,
    getUnsupportedCharacters,
    validCharacters,
  };
})(typeof self !== 'undefined' ? self : window);
