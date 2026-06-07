(function attachAngelShieldBlake2b(root) {
  function normalizeInput(input) {
    if (input instanceof Uint8Array) {
      return input;
    }

    if (typeof input === 'string') {
      return new TextEncoder().encode(input);
    }

    throw new Error('Input must be a string or Uint8Array');
  }

  function toHex(bytes) {
    return Array.prototype.map
      .call(bytes, (value) => (value < 16 ? '0' : '') + value.toString(16))
      .join('');
  }

  function ADD64AA(vector, a, b) {
    const low = vector[a] + vector[b];
    let high = vector[a + 1] + vector[b + 1];
    if (low >= 0x100000000) {
      high += 1;
    }
    vector[a] = low;
    vector[a + 1] = high;
  }

  function ADD64AC(vector, a, lowBits, highBits) {
    let low = vector[a] + lowBits;
    if (lowBits < 0) {
      low += 0x100000000;
    }

    let high = vector[a + 1] + highBits;
    if (low >= 0x100000000) {
      high += 1;
    }

    vector[a] = low;
    vector[a + 1] = high;
  }

  function GET32(array, index) {
    return array[index] ^ (array[index + 1] << 8) ^ (array[index + 2] << 16) ^ (array[index + 3] << 24);
  }

  const BLAKE2B_IV32 = new Uint32Array([
    0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372,
    0x5f1d36f1, 0xa54ff53a, 0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c,
    0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
  ]);

  const SIGMA8 = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13,
    6, 1, 12, 0, 2, 11, 7, 5, 3, 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1,
    9, 4, 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8, 9, 0, 5, 7, 2, 4,
    10, 15, 14, 1, 11, 12, 6, 8, 3, 13, 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5,
    15, 14, 1, 9, 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11, 13, 11, 7,
    14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10, 6, 15, 14, 9, 11, 3, 0, 8, 12, 2,
    13, 7, 1, 4, 10, 5, 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0, 0,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 10, 4, 8, 9, 15, 13, 6,
    1, 12, 0, 2, 11, 7, 5, 3,
  ];

  const SIGMA82 = new Uint8Array(
    SIGMA8.map((value) => value * 2),
  );

  const vector = new Uint32Array(32);
  const message = new Uint32Array(32);
  const parameterBlock = new Uint8Array(64);

  function G(a, b, c, d, ix, iy) {
    const x0 = message[ix];
    const x1 = message[ix + 1];
    const y0 = message[iy];
    const y1 = message[iy + 1];

    ADD64AA(vector, a, b);
    ADD64AC(vector, a, x0, x1);

    let xor0 = vector[d] ^ vector[a];
    let xor1 = vector[d + 1] ^ vector[a + 1];
    vector[d] = xor1;
    vector[d + 1] = xor0;

    ADD64AA(vector, c, d);

    xor0 = vector[b] ^ vector[c];
    xor1 = vector[b + 1] ^ vector[c + 1];
    vector[b] = (xor0 >>> 24) ^ (xor1 << 8);
    vector[b + 1] = (xor1 >>> 24) ^ (xor0 << 8);

    ADD64AA(vector, a, b);
    ADD64AC(vector, a, y0, y1);

    xor0 = vector[d] ^ vector[a];
    xor1 = vector[d + 1] ^ vector[a + 1];
    vector[d] = (xor0 >>> 16) ^ (xor1 << 16);
    vector[d + 1] = (xor1 >>> 16) ^ (xor0 << 16);

    ADD64AA(vector, c, d);

    xor0 = vector[b] ^ vector[c];
    xor1 = vector[b + 1] ^ vector[c + 1];
    vector[b] = (xor1 >>> 31) ^ (xor0 << 1);
    vector[b + 1] = (xor0 >>> 31) ^ (xor1 << 1);
  }

  function compress(context, last) {
    for (let index = 0; index < 16; index += 1) {
      vector[index] = context.h[index];
      vector[index + 16] = BLAKE2B_IV32[index];
    }

    vector[24] ^= context.t;
    vector[25] ^= context.t / 0x100000000;

    if (last) {
      vector[28] = ~vector[28];
      vector[29] = ~vector[29];
    }

    for (let index = 0; index < 32; index += 1) {
      message[index] = GET32(context.b, 4 * index);
    }

    for (let round = 0; round < 12; round += 1) {
      G(0, 8, 16, 24, SIGMA82[round * 16 + 0], SIGMA82[round * 16 + 1]);
      G(2, 10, 18, 26, SIGMA82[round * 16 + 2], SIGMA82[round * 16 + 3]);
      G(4, 12, 20, 28, SIGMA82[round * 16 + 4], SIGMA82[round * 16 + 5]);
      G(6, 14, 22, 30, SIGMA82[round * 16 + 6], SIGMA82[round * 16 + 7]);
      G(0, 10, 20, 30, SIGMA82[round * 16 + 8], SIGMA82[round * 16 + 9]);
      G(2, 12, 22, 24, SIGMA82[round * 16 + 10], SIGMA82[round * 16 + 11]);
      G(4, 14, 16, 26, SIGMA82[round * 16 + 12], SIGMA82[round * 16 + 13]);
      G(6, 8, 18, 28, SIGMA82[round * 16 + 14], SIGMA82[round * 16 + 15]);
    }

    for (let index = 0; index < 16; index += 1) {
      context.h[index] = context.h[index] ^ vector[index] ^ vector[index + 16];
    }
  }

  function init(outLength, key) {
    if (outLength === 0 || outLength > 64) {
      throw new Error('Illegal output length, expected 0 < length <= 64');
    }

    if (key && key.length > 64) {
      throw new Error('Illegal key, expected Uint8Array with 0 < length <= 64');
    }

    const context = {
      b: new Uint8Array(128),
      h: new Uint32Array(16),
      t: 0,
      c: 0,
      outLength,
    };

    parameterBlock.fill(0);
    parameterBlock[0] = outLength;
    if (key) {
      parameterBlock[1] = key.length;
    }
    parameterBlock[2] = 1;
    parameterBlock[3] = 1;

    for (let index = 0; index < 16; index += 1) {
      context.h[index] = BLAKE2B_IV32[index] ^ GET32(parameterBlock, index * 4);
    }

    if (key) {
      update(context, key);
      context.c = 128;
    }

    return context;
  }

  function update(context, input) {
    for (let index = 0; index < input.length; index += 1) {
      if (context.c === 128) {
        context.t += context.c;
        compress(context, false);
        context.c = 0;
      }

      context.b[context.c] = input[index];
      context.c += 1;
    }
  }

  function finalize(context) {
    context.t += context.c;

    while (context.c < 128) {
      context.b[context.c] = 0;
      context.c += 1;
    }

    compress(context, true);

    const out = new Uint8Array(context.outLength);
    for (let index = 0; index < context.outLength; index += 1) {
      out[index] = context.h[index >> 2] >> (8 * (index & 3));
    }
    return out;
  }

  function blake2b(input, key, outLength) {
    const normalizedInput = normalizeInput(input);
    const normalizedKey = key ? normalizeInput(key) : null;
    const context = init(outLength || 64, normalizedKey);
    update(context, normalizedInput);
    return finalize(context);
  }

  function blake2bHex(input, key, outLength) {
    return toHex(blake2b(input, key, outLength));
  }

  root.AngelShieldBlake2b = {
    blake2bHex,
  };
})(typeof self !== 'undefined' ? self : window);
