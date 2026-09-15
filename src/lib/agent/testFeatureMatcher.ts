import fs from "node:fs";
import path from "node:path";

import {
  compareImageFeatures,
} from "./featureMatcher";

async function main() {
  const image1Path =
    path.join(
      process.cwd(),
      "public",
      "test1.JPEG"
    );

  const image2Path =
    path.join(
      process.cwd(),
      "public",
      "test2.jpg"
    );

  const image1 =
    fs.readFileSync(
      image1Path
    );

  const image2 =
    fs.readFileSync(
      image2Path
    );

  console.log("");
  console.log(
    "Starting feature matching..."
  );
  console.log("");

  const result =
    await compareImageFeatures(
      image1,
      image2
    );

  console.log(
    "===== FEATURE MATCH RESULT ====="
  );

  console.log(result);

  console.log("");

  console.log(
    `VERDICT: ${result.verdict}`
  );

  console.log(
    `SIMILARITY: ${(
      result.similarityScore *
      100
    ).toFixed(2)}%`
  );

  console.log(
    `GOOD MATCHES: ${result.goodMatches}`
  );

  console.log(
    `MATCH RATIO: ${(
      result.goodMatchRatio *
      100
    ).toFixed(2)}%`
  );

  console.log(
    `AVERAGE DISTANCE: ${result.averageDistance.toFixed(
      2
    )}`
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Feature matcher test failed:"
  );

  console.error(error);

  process.exit(1);
});