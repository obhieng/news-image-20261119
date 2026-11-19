// news-image-20261119 — entry program.
//
// The entry is one image: entry.png, a front page summing up the world
// news of Thursday 19 November 2026. This program does not generate the
// image; it validates the shipped file and copies it to the output
// directory the grader points at with MAKEFUN_OUTPUT_DIR.
//
// Checks performed before anything is written:
//   1. entry.png exists and is a regular file in this repository.
//   2. It is at most 1 MiB.
//   3. It starts with the PNG signature (first 8 bytes).
//   4. Its IHDR chunk reports width and height, both between 1 and 1024.
// After writing, the output is read back and compared byte for byte,
// including a sha256 match, so two runs always produce identical bytes.
//
// Only the Node standard library is used. No network access.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_FILE = "entry.png";
const MAX_FILE_BYTES = 1 << 20; // 1 MiB
const MAX_SIDE_PX = 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Abort with a message the grader log can show plainly.
function refuse(reason: string): never {
  throw new Error(`refused to ship entry: ${reason}`);
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Repository root: the folder holding this script, wherever the caller
// started the process from.
function rootDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

// Where the image must land. The grader sets MAKEFUN_OUTPUT_DIR; by
// hand it falls back to ./out relative to the current directory.
function targetDir(): string {
  const env = process.env.MAKEFUN_OUTPUT_DIR;
  return env && env.trim().length > 0 ? env : "out";
}

// Read width and height out of the IHDR chunk. The layout is fixed:
// 8 magic bytes, 4 length bytes, 4 chunk-type bytes ("IHDR"), then
// 4 bytes width and 4 bytes height, big-endian.
function readPngSize(data: Buffer): { width: number; height: number } {
  const headerBytes = 8 + 4 + 4 + 13;
  if (data.length < headerBytes) {
    refuse("file is shorter than a PNG header");
  }
  if (data.subarray(12, 16).toString("latin1") !== "IHDR") {
    refuse("first PNG chunk is not IHDR");
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function run(): void {
  const source = join(rootDir(), IMAGE_FILE);

  let info;
  try {
    info = statSync(source);
  } catch {
    refuse(`${IMAGE_FILE} is missing from the repository`);
  }
  if (!info.isFile()) {
    refuse(`${IMAGE_FILE} is not a regular file`);
  }

  const bytes = readFileSync(source);

  if (bytes.length > MAX_FILE_BYTES) {
    refuse(
      `${IMAGE_FILE} is ${bytes.length} bytes, above the ${MAX_FILE_BYTES}-byte limit`,
    );
  }
  const magic = PNG_MAGIC.every((byte, i) => bytes[i] === byte);
  if (!magic) {
    refuse(`${IMAGE_FILE} does not begin with the PNG signature`);
  }

  const { width, height } = readPngSize(bytes);
  if (width < 1 || height < 1) {
    refuse(`image has an impossible size of ${width}x${height}`);
  }
  if (width > MAX_SIDE_PX || height > MAX_SIDE_PX) {
    refuse(
      `image is ${width}x${height}, larger than the ${MAX_SIDE_PX}x${MAX_SIDE_PX} limit`,
    );
  }
  // A whole PNG ends with the 12-byte IEND chunk (length 0, "IEND",
  // CRC). A file missing it was cut off mid-write, even if the header
  // and the size limit both look fine.
  const tail = bytes.subarray(bytes.length - 12);
  const endsWithIend =
    tail.readUInt32BE(0) === 0 && tail.subarray(4, 8).toString("latin1") === "IEND";
  if (!endsWithIend) {
    refuse("file does not end with the IEND chunk — it looks truncated");
  }

  const destination = resolve(targetDir(), IMAGE_FILE);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);

  // Prove the copy is exact before reporting success.
  const roundTrip = readFileSync(destination);
  if (!roundTrip.equals(bytes)) {
    refuse("output read back does not match the input bytes");
  }
  const digest = sha256Hex(bytes);
  if (sha256Hex(roundTrip) !== digest) {
    refuse("output sha256 does not match the input sha256");
  }

  console.log(`wrote ${destination}`);
  console.log(`size ${bytes.length} bytes, dimensions ${width}x${height}`);
  console.log(`sha256 ${digest}`);
}

run();
