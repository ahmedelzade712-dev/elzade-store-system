import sharp from "sharp";

const jsfeat: any = require("jsfeat");

export type FeaturePoint = {
  x: number;
  y: number;
  score: number;
  angle: number;
  descriptor: Uint8Array;
};

export type FeatureMatch = {
  indexA: number;
  indexB: number;
  distance: number;
};

export type FeatureMatchResult = {
  featuresA: number;
  featuresB: number;

  rawMatches: number;
  goodMatches: number;

  goodMatchRatio: number;
  averageDistance: number;

  similarityScore: number;

  verdict:
    | "VERY_STRONG"
    | "STRONG"
    | "POSSIBLE"
    | "WEAK";
};

const POPCOUNT = new Uint8Array(256);

for (let i = 0; i < 256; i++) {
  let value = i;
  let count = 0;

  while (value !== 0) {
    count += value & 1;
    value >>= 1;
  }

  POPCOUNT[i] = count;
}

async function prepareImage(
  input: Buffer,
  maxDimension = 900
): Promise<{
  data: Buffer;
  width: number;
  height: number;
}> {
  const metadata = await sharp(input, {
    failOn: "none",
  })
    .rotate()
    .metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    throw new Error(
      "Could not determine image dimensions."
    );
  }

  const scale = Math.min(
    1,
    maxDimension /
      Math.max(
        originalWidth,
        originalHeight
      )
  );

  const width = Math.max(
    1,
    Math.round(
      originalWidth * scale
    )
  );

  const height = Math.max(
    1,
    Math.round(
      originalHeight * scale
    )
  );

  const data = await sharp(input, {
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
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .removeAlpha()
    .raw()
    .toBuffer();

  return {
    data,
    width,
    height,
  };
}

function descriptorDistance(
  a: Uint8Array,
  b: Uint8Array
): number {
  let distance = 0;

  const length = Math.min(
    a.length,
    b.length
  );

  for (let i = 0; i < length; i++) {
    distance +=
      POPCOUNT[
        a[i] ^ b[i]
      ];
  }

  return distance;
}

async function extractFeatures(
  input: Buffer,
  maxFeatures = 600
): Promise<FeaturePoint[]> {
  const prepared =
    await prepareImage(input);

  const {
    data,
    width,
    height,
  } = prepared;

  const gray =
    new jsfeat.matrix_t(
      width,
      height,
      jsfeat.U8_t |
        jsfeat.C1_t
    );

  jsfeat.imgproc.grayscale(
    data,
    width,
    height,
    gray,
    jsfeat.COLOR_RGB2GRAY
  );

  /*
    Slight blur helps reduce
    JPEG compression noise.
  */
  const blurred =
    new jsfeat.matrix_t(
      width,
      height,
      jsfeat.U8_t |
        jsfeat.C1_t
    );

  jsfeat.imgproc.gaussian_blur(
    gray,
    blurred,
    3,
    0
  );

  const corners: any[] =
    new Array(
      width * height
    );

  for (
    let i = 0;
    i < corners.length;
    i++
  ) {
    corners[i] =
      new jsfeat.keypoint_t(
        0,
        0,
        0,
        0,
        -1
      );
  }

  jsfeat.yape06.laplacian_threshold =
    30;

  jsfeat.yape06.min_eigen_value_threshold =
    25;

  let count =
    jsfeat.yape06.detect(
      blurred,
      corners,
      17
    );

  corners.length = count;

  corners.sort(
    (a, b) =>
      (b.score ?? 0) -
      (a.score ?? 0)
  );

  if (
    corners.length >
    maxFeatures
  ) {
    corners.length =
      maxFeatures;
  }

  count = corners.length;

  if (count === 0) {
    return [];
  }

  /*
    ORB needs a destination
    matrix for descriptors.

    32 bytes = 256-bit ORB
    descriptor per keypoint.
  */
  const descriptors =
    new jsfeat.matrix_t(
      32,
      count,
      jsfeat.U8_t |
        jsfeat.C1_t
    );

  /*
    IMPORTANT:
    This is the correct call.

    The previous version called
    orb.describe once without the
    descriptors argument, which
    caused:
    "Cannot read properties of
    undefined (reading 'type')"
  */
  jsfeat.orb.describe(
    blurred,
    corners,
    count,
    descriptors
  );

  const result: FeaturePoint[] =
    [];

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const descriptor =
      new Uint8Array(32);

    const offset =
      i * 32;

    for (
      let j = 0;
      j < 32;
      j++
    ) {
      descriptor[j] =
        descriptors.data[
          offset + j
        ];
    }

    result.push({
      x:
        corners[i].x ?? 0,

      y:
        corners[i].y ?? 0,

      score:
        corners[i].score ?? 0,

      angle:
        corners[i].angle ?? 0,

      descriptor,
    });
  }

  return result;
}

function findBestMatches(
  featuresA: FeaturePoint[],
  featuresB: FeaturePoint[]
): FeatureMatch[] {
  const matches: FeatureMatch[] =
    [];

  for (
    let indexA = 0;
    indexA <
    featuresA.length;
    indexA++
  ) {
    const featureA =
      featuresA[indexA];

    let bestDistance =
      Number.POSITIVE_INFINITY;

    let secondBestDistance =
      Number.POSITIVE_INFINITY;

    let bestIndexB = -1;

    for (
      let indexB = 0;
      indexB <
      featuresB.length;
      indexB++
    ) {
      const featureB =
        featuresB[indexB];

      const distance =
        descriptorDistance(
          featureA.descriptor,
          featureB.descriptor
        );

      if (
        distance <
        bestDistance
      ) {
        secondBestDistance =
          bestDistance;

        bestDistance =
          distance;

        bestIndexB =
          indexB;
      } else if (
        distance <
        secondBestDistance
      ) {
        secondBestDistance =
          distance;
      }
    }

    if (
      bestIndexB === -1 ||
      !Number.isFinite(
        secondBestDistance
      )
    ) {
      continue;
    }

    const ratio =
      bestDistance /
      Math.max(
        secondBestDistance,
        1
      );

    /*
      ORB Hamming match.
      These limits are deliberately
      conservative for now.
    */
    if (
      bestDistance <= 70 &&
      ratio <= 0.78
    ) {
      matches.push({
        indexA,
        indexB:
          bestIndexB,
        distance:
          bestDistance,
      });
    }
  }

  return matches;
}

function applyCrossCheck(
  matchesAB: FeatureMatch[],
  matchesBA: FeatureMatch[]
): FeatureMatch[] {
  const reverseMap =
    new Map<string, boolean>();

  for (
    const match of matchesBA
  ) {
    /*
      BA:
      indexA = feature B
      indexB = feature A

      Convert to A:B key.
    */
    reverseMap.set(
      `${match.indexB}:${match.indexA}`,
      true
    );
  }

  return matchesAB.filter(
    (match) =>
      reverseMap.has(
        `${match.indexA}:${match.indexB}`
      )
  );
}

function calculateSimilarity(
  featureCountA: number,
  featureCountB: number,
  matches: FeatureMatch[]
): {
  ratio: number;
  averageDistance: number;
  score: number;
} {
  const baseFeatureCount =
    Math.max(
      1,
      Math.min(
        featureCountA,
        featureCountB
      )
    );

  const ratio =
    matches.length /
    baseFeatureCount;

  let averageDistance =
    256;

  if (
    matches.length > 0
  ) {
    averageDistance =
      matches.reduce(
        (
          sum,
          match
        ) =>
          sum +
          match.distance,
        0
      ) /
      matches.length;
  }

  /*
    ORB descriptors have
    maximum Hamming distance 256.

    For genuinely matching points,
    we normally want much smaller
    distances.
  */
  const distanceScore =
    Math.max(
      0,
      Math.min(
        1,
        1 -
          averageDistance /
            80
      )
    );

  /*
    Feature detectors do not return
    identical sets after resizing,
    JPEG compression or screenshots,
    so 20-25% verified overlap can
    already be meaningful.
  */
  const coverageScore =
    Math.min(
      1,
      ratio / 0.25
    );

  const countScore =
    Math.min(
      1,
      matches.length / 60
    );

  const score =
    coverageScore * 0.50 +
    distanceScore * 0.35 +
    countScore * 0.15;

  return {
    ratio,

    averageDistance,

    score:
      Math.max(
        0,
        Math.min(
          1,
          score
        )
      ),
  };
}

export async function compareImageFeatures(
  imageA: Buffer,
  imageB: Buffer
): Promise<FeatureMatchResult> {
  const [
    featuresA,
    featuresB,
  ] = await Promise.all([
    extractFeatures(imageA),
    extractFeatures(imageB),
  ]);

  if (
    featuresA.length === 0 ||
    featuresB.length === 0
  ) {
    return {
      featuresA:
        featuresA.length,

      featuresB:
        featuresB.length,

      rawMatches: 0,
      goodMatches: 0,

      goodMatchRatio: 0,

      averageDistance:
        256,

      similarityScore: 0,

      verdict:
        "WEAK",
    };
  }

  const matchesAB =
    findBestMatches(
      featuresA,
      featuresB
    );

  const matchesBA =
    findBestMatches(
      featuresB,
      featuresA
    );

  const goodMatches =
    applyCrossCheck(
      matchesAB,
      matchesBA
    );

  const stats =
    calculateSimilarity(
      featuresA.length,
      featuresB.length,
      goodMatches
    );

  let verdict:
    FeatureMatchResult["verdict"];

  if (
    stats.score >= 0.90 &&
    goodMatches.length >= 40
  ) {
    verdict =
      "VERY_STRONG";
  } else if (
    stats.score >= 0.75 &&
    goodMatches.length >= 25
  ) {
    verdict =
      "STRONG";
  } else if (
    stats.score >= 0.50 &&
    goodMatches.length >= 12
  ) {
    verdict =
      "POSSIBLE";
  } else {
    verdict =
      "WEAK";
  }

  return {
    featuresA:
      featuresA.length,

    featuresB:
      featuresB.length,

    rawMatches:
      matchesAB.length,

    goodMatches:
      goodMatches.length,

    goodMatchRatio:
      stats.ratio,

    averageDistance:
      stats.averageDistance,

    similarityScore:
      stats.score,

    verdict,
  };
}