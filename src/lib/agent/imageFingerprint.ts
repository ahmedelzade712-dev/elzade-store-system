import sharp from "sharp";
import crypto from "node:crypto";

export type ImageFingerprint = {
  sha256: string;
  width: number;
  height: number;
  format?: string;

  aHash: string;
  dHash: string;
};

export type ImageComparison = {
  exactMatch: boolean;

  pixelSimilarity: number;
  edgeSimilarity: number;

  aHashDistance: number;
  dHashDistance: number;

  finalSimilarity: number;
};

function bitsToHex(bits: string): string {
  return BigInt("0b" + bits)
    .toString(16)
    .padStart(Math.ceil(bits.length / 4), "0");
}

async function canonicalGray(
  input: Buffer,
  size = 256
): Promise<Buffer> {
  return sharp(input, {
    failOn: "none",
  })
    .rotate()
    .flatten({
      background: {
        r: 255,
        g: 255,
        b: 255,
      },
    })
    .resize(size, size, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .raw()
    .toBuffer();
}

async function canonicalEdges(
  input: Buffer,
  size = 256
): Promise<Buffer> {
  return sharp(input, {
    failOn: "none",
  })
    .rotate()
    .flatten({
      background: {
        r: 255,
        g: 255,
        b: 255,
      },
    })
    .resize(size, size, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [
        -1, -1, -1,
        -1,  8, -1,
        -1, -1, -1,
      ],
    })
    .raw()
    .toBuffer();
}

function bufferSimilarity(
  a: Buffer,
  b: Buffer
): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let totalDifference = 0;

  for (let i = 0; i < a.length; i++) {
    totalDifference += Math.abs(a[i] - b[i]);
  }

  const maximumDifference =
    a.length * 255;

  return 1 - totalDifference / maximumDifference;
}

async function createAHash(
  input: Buffer
): Promise<string> {
  const data = await canonicalGray(input, 8);

  let sum = 0;

  for (const value of data) {
    sum += value;
  }

  const average = sum / data.length;

  let bits = "";

  for (const value of data) {
    bits += value >= average ? "1" : "0";
  }

  return bitsToHex(bits);
}

async function createDHash(
  input: Buffer
): Promise<string> {
  const { data } = await sharp(input, {
    failOn: "none",
  })
    .rotate()
    .flatten({
      background: {
        r: 255,
        g: 255,
        b: 255,
      },
    })
    .resize(9, 8, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .grayscale()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  let bits = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left =
        data[row * 9 + col];

      const right =
        data[row * 9 + col + 1];

      bits += left > right ? "1" : "0";
    }
  }

  return bitsToHex(bits);
}

export async function createImageFingerprint(
  input: Buffer
): Promise<ImageFingerprint> {
  const metadata = await sharp(input, {
    failOn: "none",
  }).metadata();

  const sha256 = crypto
    .createHash("sha256")
    .update(input)
    .digest("hex");

  const [
    aHash,
    dHash,
  ] = await Promise.all([
    createAHash(input),
    createDHash(input),
  ]);

  return {
    sha256,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format,
    aHash,
    dHash,
  };
}

export function hammingDistance(
  hashA: string,
  hashB: string
): number {
  const a =
    BigInt("0x" + hashA);

  const b =
    BigInt("0x" + hashB);

  let x = a ^ b;
  let distance = 0;

  const ZERO = BigInt(0);
  const ONE = BigInt(1);

  while (x > ZERO) {
    distance += Number(x & ONE);
    x >>= ONE;
  }

  return distance;
}

export async function compareImages(
  imageA: Buffer,
  imageB: Buffer
): Promise<ImageComparison> {
  const [
    fingerprintA,
    fingerprintB,
    grayA,
    grayB,
    edgesA,
    edgesB,
  ] = await Promise.all([
    createImageFingerprint(imageA),
    createImageFingerprint(imageB),

    canonicalGray(imageA),
    canonicalGray(imageB),

    canonicalEdges(imageA),
    canonicalEdges(imageB),
  ]);

  const exactMatch =
    fingerprintA.sha256 ===
    fingerprintB.sha256;

  const pixelSimilarity =
    bufferSimilarity(
      grayA,
      grayB
    );

  const edgeSimilarity =
    bufferSimilarity(
      edgesA,
      edgesB
    );

  const aHashDistance =
    hammingDistance(
      fingerprintA.aHash,
      fingerprintB.aHash
    );

  const dHashDistance =
    hammingDistance(
      fingerprintA.dHash,
      fingerprintB.dHash
    );

  const aHashScore =
    1 - aHashDistance / 64;

  const dHashScore =
    1 - dHashDistance / 64;

  /*
    الوزن الأكبر للمقارنة الفعلية للصورة.
    الـHash مجرد إشارات مساعدة.
  */
  const finalSimilarity =
    pixelSimilarity * 0.50 +
    edgeSimilarity * 0.30 +
    aHashScore * 0.10 +
    dHashScore * 0.10;

  return {
    exactMatch,

    pixelSimilarity,
    edgeSimilarity,

    aHashDistance,
    dHashDistance,

    finalSimilarity,
  };
}