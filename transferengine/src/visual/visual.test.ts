import QRCode from 'qrcode';
import jsQR from 'jsqr';

// Helper to create a synthetic 2x2 grid of QR codes on a mock canvas
async function render2x2Grid(payloads: string[], width: number = 400, height: number = 400): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  // We can render 4 QR codes using QRCode.create and stitch pixels into a buffer
  const pad = 12;
  const gutter = 16;
  const cellWidth = Math.floor((width - 2 * pad - gutter) / 2);
  const cellHeight = Math.floor((height - 2 * pad - gutter) / 2);

  // Create RGBA image buffer (filled with white 255)
  const buffer = new Uint8ClampedArray(width * height * 4);
  buffer.fill(255);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const idx = row * 2 + col;
      const text = payloads[idx];
      const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
      const moduleCount = qr.modules.size;
      const margin = 2;
      const totalModules = moduleCount + 2 * margin;
      const scale = cellWidth / totalModules;

      const posX = pad + col * (cellWidth + gutter);
      const posY = pad + row * (cellHeight + gutter);

      // Draw QR modules into buffer
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.modules.get(r, c)) {
            const startX = Math.floor(posX + (c + margin) * scale);
            const startY = Math.floor(posY + (r + margin) * scale);
            const endX = Math.floor(posX + (c + margin + 1) * scale);
            const endY = Math.floor(posY + (r + margin + 1) * scale);

            for (let y = startY; y < endY && y < height; y++) {
              for (let x = startX; x < endX && x < width; x++) {
                const p = (y * width + x) * 4;
                buffer[p] = 0;     // R
                buffer[p + 1] = 0; // G
                buffer[p + 2] = 0; // B
                buffer[p + 3] = 255;
              }
            }
          }
        }
      }
    }
  }

  return { data: buffer, width, height };
}

// Slice function matching VisualReceiver quadrant logic
function sliceAndDecodeJsQR(fullImage: { data: Uint8ClampedArray; width: number; height: number }): string[] {
  const W = fullImage.width;
  const H = fullImage.height;
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const delta = Math.floor(Math.min(W, H) * 0.08); // 8% overlap margin

  const slices = [
    { x: 0, y: 0, w: Math.min(W, cx + delta), h: Math.min(H, cy + delta) }, // Top-Left
    { x: Math.max(0, cx - delta), y: 0, w: W - Math.max(0, cx - delta), h: Math.min(H, cy + delta) }, // Top-Right
    { x: 0, y: Math.max(0, cy - delta), w: Math.min(W, cx + delta), h: H - Math.max(0, cy - delta) }, // Bottom-Left
    { x: Math.max(0, cx - delta), y: Math.max(0, cy - delta), w: W - Math.max(0, cx - delta), h: H - Math.max(0, cy - delta) } // Bottom-Right
  ];

  const results: string[] = [];

  for (const slice of slices) {
    // Extract slice sub-buffer
    const sliceBuf = new Uint8ClampedArray(slice.w * slice.h * 4);
    for (let row = 0; row < slice.h; row++) {
      const srcY = slice.y + row;
      const srcOffset = (srcY * W + slice.x) * 4;
      const dstOffset = row * slice.w * 4;
      sliceBuf.set(fullImage.data.subarray(srcOffset, srcOffset + slice.w * 4), dstOffset);
    }

    const code = jsQR(sliceBuf, slice.w, slice.h, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      results.push(code.data);
    }
  }

  return results;
}

describe('Visual Multi-Code Grid & jsQR Quadrant Fallback Test', () => {
  it('should successfully decode all 4 QR codes from a 2x2 grid using overlapping quadrant slicing', async () => {
    const expectedPayloads = [
      'LIGHTLINK_CHUNK_0_TL',
      'LIGHTLINK_CHUNK_1_TR',
      'LIGHTLINK_CHUNK_2_BL',
      'LIGHTLINK_CHUNK_3_BR'
    ];

    const gridImage = await render2x2Grid(expectedPayloads, 400, 400);
    const decoded = sliceAndDecodeJsQR(gridImage);

    expect(decoded.length).toBe(4);
    expect(decoded).toContain('LIGHTLINK_CHUNK_0_TL');
    expect(decoded).toContain('LIGHTLINK_CHUNK_1_TR');
    expect(decoded).toContain('LIGHTLINK_CHUNK_2_BL');
    expect(decoded).toContain('LIGHTLINK_CHUNK_3_BR');
  });
});
