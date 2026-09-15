import fs from "node:fs";
import path from "node:path";

import {
  createImageFingerprint,
  compareImages,
} from "./imageFingerprint";

async function main() {
  const image1Path = path.join(
    process.cwd(),
    "public",
    "test1.JPEG"
  );

  const image2Path = path.join(
    process.cwd(),
    "public",
    "test2.jpg"
  );

  const image1 =
    fs.readFileSync(image1Path);

  const image2 =
    fs.readFileSync(image2Path);

  const fp1 =
    await createImageFingerprint(image1);

  const fp2 =
    await createImageFingerprint(image2);

  const comparison =
    await compareImages(
      image1,
      image2
    );

  console.log("");
  console.log("===== IMAGE 1 =====");
  console.log(fp1);

  console.log("");
  console.log("===== IMAGE 2 =====");
  console.log(fp2);

  console.log("");
  console.log("===== COMPARISON =====");
  console.log(comparison);

  console.log("");

  if (comparison.exactMatch) {
    console.log(
      "RESULT: EXACT FILE MATCH"
    );
  } else if (
    comparison.finalSimilarity >= 0.98
  ) {
    console.log(
      "RESULT: EXTREMELY STRONG SAME-IMAGE MATCH"
    );
  } else if (
    comparison.finalSimilarity >= 0.95
  ) {
    console.log(
      "RESULT: VERY STRONG MATCH"
    );
  } else if (
    comparison.finalSimilarity >= 0.90
  ) {
    console.log(
      "RESULT: STRONG MATCH - VERIFY DESIGN"
    );
  } else {
    console.log(
      "RESULT: NOT SAFE TO CONFIRM"
    );
  }
}

main().catch((error) => {
  console.error(
    "Image comparison test failed:"
  );

  console.error(error);

  process.exit(1);
});