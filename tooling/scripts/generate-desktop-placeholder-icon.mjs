import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../../apps/desktop/src-tauri/icons/icon.ico");
const width = 32;
const height = 32;
const pixelBytes = width * height * 4;
const maskStride = Math.ceil(width / 32) * 4;
const maskBytes = maskStride * height;
const bitmapBytes = 40 + pixelBytes + maskBytes;
const icon = Buffer.alloc(6 + 16 + bitmapBytes);

icon.writeUInt16LE(0, 0);
icon.writeUInt16LE(1, 2);
icon.writeUInt16LE(1, 4);
icon.writeUInt8(width, 6);
icon.writeUInt8(height, 7);
icon.writeUInt8(0, 8);
icon.writeUInt8(0, 9);
icon.writeUInt16LE(1, 10);
icon.writeUInt16LE(32, 12);
icon.writeUInt32LE(bitmapBytes, 14);
icon.writeUInt32LE(22, 18);

const bitmapOffset = 22;
icon.writeUInt32LE(40, bitmapOffset);
icon.writeInt32LE(width, bitmapOffset + 4);
icon.writeInt32LE(height * 2, bitmapOffset + 8);
icon.writeUInt16LE(1, bitmapOffset + 12);
icon.writeUInt16LE(32, bitmapOffset + 14);
icon.writeUInt32LE(0, bitmapOffset + 16);
icon.writeUInt32LE(pixelBytes, bitmapOffset + 20);

const pixelOffset = bitmapOffset + 40;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = pixelOffset + (y * width + x) * 4;
    const inset = x >= 4 && x < width - 4 && y >= 4 && y < height - 4;
    icon[offset] = inset ? 52 : 28;
    icon[offset + 1] = inset ? 96 : 34;
    icon[offset + 2] = inset ? 112 : 42;
    icon[offset + 3] = 255;
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, icon);
