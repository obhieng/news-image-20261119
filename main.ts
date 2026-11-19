// main.ts — news-image-20261119 entry
//
// This program is the whole entry: it writes the one image that sums up
// the world news of Thursday 19 November 2026 to the output directory.
//
// The image itself lives in this repository as entry.png (a front page
// drawn for the day: the Trump–Xi–Putin trilateral summit in Shenzhen,
// the Gulf war widening to Kuwait, Jeffries' nomination as the first
// Black Speaker of the U.S. House, the GTA VI launch, Cyclone Akvan,
// and the rest of the day's stories across six continents). This program
// does not draw anything and does not use the network; it only checks
// the image and copies it.
//
// What it guarantees:
//   - the file it ships is a real PNG (its first 8 bytes are the PNG
//     signature), so a truncated or mistyped file is refused loudly
//   - the file is at most 1 MiB (1048576 bytes), the competition's cap
//   - the picture is at most 1024 by 1024 pixels, read from its IHDR
//     chunk, the competition's other cap
//   - the output is byte-for-byte the input, so running the program
//     twice writes the same bytes twice (the competition runs it twice
//     and both runs must write the same bytes)
//
// The output directory comes from MAKEFUN_OUTPUT_DIR and defaults to
// ./out. The program only uses the Node standard library.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The image this entry ships, at the root of this repository.
const ENTRY_NAME = "entry.png";

// The competition's limits for the image file.
const MAX_BYTES = 1048576; // 1 MiB
const MAX_DIMENSION = 1024; // pixels on either side

// The eight bytes every PNG file starts with.
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// Stop with a clear message instead of writing a bad entry.
function fail(message: string): never {
  throw new Error(`entry refused: ${message}`);
}

// The directory this file lives in is the repository root, whatever the
// working directory the program is started from.
function repoRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

// The directory the image goes to. The grader sets MAKEFUN_OUTPUT_DIR;
// running by hand without it writes to ./out next to the repository.
function outputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return "out";
}

// Read the IHDR chunk (the first chunk of a PNG) and return the picture's
// width and height in pixels. A PNG shorter than the IHDR is not whole.
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  // 8 signature bytes + 4 length + 4 chunk type + 13 IHDR data bytes.
  const minimumLength = 8 + 4 + 4 + 13;
  if (bytes.length < minimumLength) {
    fail("file is too short to hold a PNG header");
  }
  const chunkType = bytes.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    fail("first chunk is not IHDR, so this is not a whole PNG");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

function main(): void {
  const root = repoRoot();
  const inputPath = join(root, ENTRY_NAME);

  if (!existsSync(inputPath)) {
    fail(`${ENTRY_NAME} is missing from the repository`);
  }
  if (!statSync(inputPath).isFile()) {
    fail(`${ENTRY_NAME} is not a regular file`);
  }

  const bytes = readFileSync(inputPath);

  if (bytes.length > MAX_BYTES) {
    fail(`${ENTRY_NAME} is ${bytes.length} bytes, over the ${MAX_BYTES} cap`);
  }
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${ENTRY_NAME} does not start with the PNG signature`);
  }

  const { width, height } = pngDimensions(bytes);
  if (width === 0 || height === 0) {
    fail(`picture has a zero dimension (${width}x${height})`);
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    fail(`picture is ${width}x${height}, over the ${MAX_DIMENSION} cap`);
  }

  const dir = outputDir();
  mkdirSync(dir, { recursive: true });
  const outputPath = join(dir, ENTRY_NAME);
  writeFileSync(outputPath, bytes);

  // Read the file back and prove the copy is exact: the bytes written
  // must be the bytes read, and the two sha256 hashes must agree. This
  // is what the competition checks when it runs the program twice.
  const written = readFileSync(outputPath);
  if (!written.equals(bytes)) {
    fail("bytes read back differ from the bytes copied in");
  }
  const hash = (data: Buffer): string =>
    createHash("sha256").update(data).digest("hex");
  if (hash(written) !== hash(bytes)) {
    fail("sha256 of the output differs from sha256 of the input");
  }

  console.log(`wrote ${outputPath}: ${bytes.length} bytes, ${width}x${height}`);
  console.log(`sha256 ${hash(bytes)}`);
}

main();
