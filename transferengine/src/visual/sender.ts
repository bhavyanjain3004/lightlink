import QRCode from 'qrcode';
import { chunkFile, ltEncodeStream, FileMeta, EncodedSymbol } from '../lt-codes/encoder';

export class VisualSender {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private file: File;
  private encoder: Generator<EncodedSymbol> | null = null;
  private meta: FileMeta | null = null;
  
  public fps: number = 10;
  public chunkSize: number = 150;
  
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

    // Decide if we send Meta or Data
    let buffer: Uint8Array;
    if (this.frameCount % 15 === 0) {
      // Send Meta
      const metaStr = JSON.stringify(this.meta);
      const encoder = new TextEncoder();
      const metaBytes = encoder.encode(metaStr);
      buffer = new Uint8Array(1 + metaBytes.length);
      buffer[0] = 0; // Type: Meta
      buffer.set(metaBytes, 1);
    } else {
      // Send Data
      const { value } = this.encoder.next();
      if (!value) return; // Should never happen with infinite generator
      this.symbolsSent++;

      buffer = new Uint8Array(1 + 4 + value.payload.length);
      buffer[0] = 1; // Type: Data
      const view = new DataView(buffer.buffer);
      view.setUint32(1, value.seed, true); // Little endian
      buffer.set(value.payload, 5);
    }

    // Render QR Code
    try {
      // QRCode natively supports byte segments
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, [{ data: buffer as unknown as Uint8ClampedArray, mode: 'byte' }], {
        errorCorrectionLevel: 'L',
        margin: 2,
        width: this.canvas.width
      });

      // Draw to main canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(qrCanvas, 0, 0, this.canvas.width, this.canvas.height);

      // Draw distinct marker to detect new frame (toggling colored dot in top right)
      this.ctx.fillStyle = this.frameCount % 2 === 0 ? '#ff5f5f' : '#2e7d6b';
      this.ctx.beginPath();
      this.ctx.arc(this.canvas.width - 15, 15, 8, 0, Math.PI * 2);
      this.ctx.fill();

      // Fire stats
      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          symbolsSent: this.symbolsSent,
          bytesSent: this.symbolsSent * this.chunkSize
        });
      }

      this.frameCount++;
    } catch (e) {
      console.error("Failed to render QR frame", e);
    }

    // Next frame
    const elapsed = performance.now() - startMs;
    const delay = Math.max(0, (1000 / this.fps) - elapsed);
    this.timer = setTimeout(() => this.loop(), delay);
  }
}
