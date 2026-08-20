import QRCode from 'qrcode';
import { chunkFile, ltEncodeStream, FileMeta, EncodedSymbol } from '../lt-codes/encoder';

export class VisualSender {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private file: File;
  private encoder: Generator<EncodedSymbol> | null = null;
  private meta: FileMeta | null = null;
  
  public fps: number = 8;
  public chunkSize: number = 100;
  public gridSize: number = 2; // 2x2 = 4 QR codes per frame
  
  private isPlaying: boolean = false;
  private frameCount: number = 0;
  private timer: any = null;

  public onStatsUpdate?: (stats: { symbolsSent: number, bytesSent: number }) => void;
  private symbolsSent: number = 0;

  constructor(canvas: HTMLCanvasElement, file: File) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.file = file;
  }

  public async start() {
    if (this.isPlaying) return;
    
    // Initialize encoder
    const { blocks, meta } = await chunkFile(this.file, this.chunkSize);
    this.meta = meta;
    this.encoder = ltEncodeStream(blocks);
    this.isPlaying = true;
    this.symbolsSent = 0;
    this.frameCount = 0;

    this.loop();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async loop() {
    if (!this.isPlaying || !this.encoder || !this.meta) return;

    const startMs = performance.now();
    const totalCells = this.gridSize * this.gridSize;

    // Fill background with clean white to ensure high contrast and quiet zones
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const pad = this.gridSize > 1 ? 12 : 0;
    const gutter = this.gridSize > 1 ? 16 : 0;
    const cellWidth = Math.floor((this.canvas.width - 2 * pad - (this.gridSize - 1) * gutter) / this.gridSize);
    const cellHeight = Math.floor((this.canvas.height - 2 * pad - (this.gridSize - 1) * gutter) / this.gridSize);

    const renderPromises: Promise<void>[] = [];

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const cellIdx = row * this.gridSize + col;
        
        let buffer: Uint8Array;
        // On meta frames, emit Meta on slot 0 and Data on slots 1..(N-1)
        if (this.frameCount % 15 === 0 && cellIdx === 0) {
          const metaStr = JSON.stringify(this.meta);
          const encoder = new TextEncoder();
          const metaBytes = encoder.encode(metaStr);
          buffer = new Uint8Array(1 + metaBytes.length);
          buffer[0] = 0; // Type: Meta
          buffer.set(metaBytes, 1);
        } else {
          const { value } = this.encoder.next();
          if (!value) continue;
          this.symbolsSent++;

          buffer = new Uint8Array(1 + 4 + value.payload.length);
          buffer[0] = 1; // Type: Data
          const view = new DataView(buffer.buffer);
          view.setUint32(1, value.seed, true);
          buffer.set(value.payload, 5);
        }

        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64 = btoa(binary);
        const posX = pad + col * (cellWidth + gutter);
        const posY = pad + row * (cellHeight + gutter);

        const renderTask = (async () => {
          try {
            const qrCanvas = document.createElement('canvas');
            await QRCode.toCanvas(qrCanvas, base64, {
              errorCorrectionLevel: 'L',
              margin: 2,
              width: cellWidth
            });
            this.ctx.drawImage(qrCanvas, posX, posY, cellWidth, cellHeight);
          } catch (err) {
            console.error('[LightLink Sender] Failed to render grid cell QR:', err);
          }
        })();

        renderPromises.push(renderTask);
      }
    }

    await Promise.all(renderPromises);

    // Fire stats
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        symbolsSent: this.symbolsSent,
        bytesSent: this.symbolsSent * this.chunkSize
      });
    }

    this.frameCount++;

    // Schedule next frame
    const elapsed = performance.now() - startMs;
    const delay = Math.max(0, (1000 / this.fps) - elapsed);
    this.timer = setTimeout(() => this.loop(), delay);
  }
}
