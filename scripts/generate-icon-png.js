const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const zlib = require("node:zlib");

const baseSize = 256;
const outputPngSize = 1024;
const outputIcoSize = 256;
const baseRadius = 44;
let size = outputPngSize;
let buffer = Buffer.alloc(size * size * 4, 0);
const projectRoot = path.join(__dirname, "..");
const assetsDir = path.join(projectRoot, "electron", "assets");
const sourceSvgPath = path.join(projectRoot, "public", "icon.svg");
const outputPngPath = path.join(assetsDir, "icon.png");
const outputIcoPath = path.join(assetsDir, "icon.ico");
const outputIcnsPath = path.join(assetsDir, "icon.icns");

main();

function main() {
  fs.mkdirSync(assetsDir, { recursive: true });

  const pngBuffer = tryRenderFromSvg(outputPngSize) || drawFallbackPng(outputPngSize);
  const icoPngBuffer = tryRenderFromSvg(outputIcoSize) || drawFallbackPng(outputIcoSize);
  fs.writeFileSync(outputPngPath, pngBuffer);
  fs.writeFileSync(outputIcoPath, encodeIco(icoPngBuffer, outputIcoSize, outputIcoSize));
  maybeWriteIcns(pngBuffer);

  console.log(`Wrote ${outputPngPath}`);
  console.log(`Wrote ${outputIcoPath}`);

  if (fs.existsSync(outputIcnsPath)) {
    console.log(`Wrote ${outputIcnsPath}`);
  }
}

function tryRenderFromSvg(targetSize) {
  if (!fs.existsSync(sourceSvgPath)) {
    return null;
  }

  if (process.platform !== "darwin") {
    return null;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "greenwash-icon-"));
  const tempPngPath = path.join(tempDir, "icon.png");

  try {
    execFileSync("sips", ["-z", String(targetSize), String(targetSize), "-s", "format", "png", sourceSvgPath, "--out", tempPngPath], {
      stdio: "ignore",
    });
    return fs.readFileSync(tempPngPath);
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function drawFallbackPng(targetSize) {
  size = targetSize;
  buffer = Buffer.alloc(size * size * 4, 0);
  const scale = size / baseSize;

  drawRoundedRect(0, 0, size, size, Math.round(baseRadius * scale), [23, 32, 31, 255]);
  drawRing(
    Math.round(116 * scale),
    Math.round(112 * scale),
    Math.round(62 * scale),
    Math.max(2, Math.round(14 * scale)),
    [245, 247, 248, 255],
  );
  drawLine(
    Math.round(164 * scale),
    Math.round(160 * scale),
    Math.round(214 * scale),
    Math.round(210 * scale),
    Math.max(2, Math.round(16 * scale)),
    [245, 247, 248, 255],
  );
  drawLeaf(Math.round(90 * scale), Math.round(114 * scale), scale, [31, 138, 91, 255]);
  return encodePng(size, size, buffer);
}

function maybeWriteIcns(pngBuffer) {
  if (process.platform !== "darwin") {
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "greenwash-iconset-"));
  const iconsetDir = path.join(tempDir, "icon.iconset");

  try {
    fs.mkdirSync(iconsetDir, { recursive: true });

    const iconVariants = [
      { size: 16, name: "icon_16x16.png" },
      { size: 32, name: "icon_16x16@2x.png" },
      { size: 32, name: "icon_32x32.png" },
      { size: 64, name: "icon_32x32@2x.png" },
      { size: 128, name: "icon_128x128.png" },
      { size: 256, name: "icon_128x128@2x.png" },
      { size: 256, name: "icon_256x256.png" },
      { size: 512, name: "icon_256x256@2x.png" },
      { size: 512, name: "icon_512x512.png" },
      { size: 1024, name: "icon_512x512@2x.png" },
    ];

    for (const variant of iconVariants) {
      const outputFile = path.join(iconsetDir, variant.name);
      execFileSync("sips", ["-z", String(variant.size), String(variant.size), outputPngPath, "--out", outputFile], {
        stdio: "ignore",
      });
    }

    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", outputIcnsPath], {
      stdio: "ignore",
    });
  } catch {
    // Keep packaging usable with PNG/ICO even when macOS icon tooling is unavailable.
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function drawRoundedRect(x, y, width, height, cornerRadius, color) {
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const withinX = px >= x && px < x + width;
      const withinY = py >= y && py < y + height;

      if (!withinX || !withinY) continue;

      const dx = Math.max(
        Math.max(x + cornerRadius - px, 0),
        px - (x + width - cornerRadius - 1),
      );
      const dy = Math.max(
        Math.max(y + cornerRadius - py, 0),
        py - (y + height - cornerRadius - 1),
      );

      if (dx * dx + dy * dy <= cornerRadius * cornerRadius) {
        setPixel(px, py, color);
      }
    }
  }
}

function drawRing(cx, cy, outerRadius, thickness, color) {
  const innerRadius = outerRadius - thickness;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const distance = Math.hypot(px - cx, py - cy);

      if (distance <= outerRadius && distance >= innerRadius) {
        setPixel(px, py, color);
      }
    }
  }
}

function drawLine(x1, y1, x2, y2, thickness, color) {
  const minX = Math.floor(Math.min(x1, x2) - thickness);
  const maxX = Math.ceil(Math.max(x1, x2) + thickness);
  const minY = Math.floor(Math.min(y1, y2) - thickness);
  const maxY = Math.ceil(Math.max(y1, y2) + thickness);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distance = distanceToSegment(px, py, x1, y1, x2, y2);

      if (distance <= thickness / 2) {
        setPixel(px, py, color);
      }
    }
  }
}

function drawLeaf(offsetX, offsetY, scale, color) {
  const minY = Math.round(42 * scale);
  const maxY = Math.round(118 * scale);
  const minX = Math.round(26 * scale);
  const maxX = Math.round(108 * scale);
  const centerX = Math.round(62 * scale);
  const centerY = Math.round(80 * scale);
  const radiusX = Math.max(1, 40 * scale);
  const radiusY = Math.max(1, 24 * scale);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const x = px - centerX;
      const y = py - centerY;
      const normalized = (x * x) / (radiusX * radiusX) + (y * y) / (radiusY * radiusY);

      if (normalized <= 1 && y <= (-0.45 * x) + (26 * scale)) {
        setPixel(px + offsetX, py + offsetY, color);
      }
    }
  }
}

function setPixel(x, y, color) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const index = (y * size + x) * 4;

  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return Math.hypot(px - x1, py - y1);
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = [];
  const rowSize = width * 4;
  for (let y = 0; y < height; y += 1) {
    const start = y * rowSize;
    rows.push(Buffer.concat([Buffer.from([0]), rgbaBuffer.subarray(start, start + rowSize)]));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(pngBuffer, width, height) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = width >= 256 ? 0 : width;
  entry[1] = height >= 256 ? 0 : height;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
