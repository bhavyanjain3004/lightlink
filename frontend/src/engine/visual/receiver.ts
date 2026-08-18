import { readBarcodes } from 'zxing-wasm/reader';
import { LTDecoder } from '../lt-codes/decoder';
import { FileMeta } from '../lt-codes/encoder';

export class VisualReceiver {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  private stream: MediaStream | null = null;
  private isScanning: boolean = false;
  
  private decoder: LTDecoder | null = null;
  private lastPayloadStr: string = '';

  public onStatsUpdate?: (stats: { progress: number, received: number, redundant: number }) => void;
  public onComplete?: (file: File) => void;
  public onError?: (err: Error) => void;

  constructor(videoElement?: HTMLVideoElement) {
    this.video = videoElement || document.createElement('video');
    this.video.setAttribute('playsinline', 'true'); // required for iOS Safari
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  public async start() {
    if (this.isScanning) return;
    
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      this.video.srcObject = this.stream;
      this.video.play();
      this.isScanning = true;
      requestAnimationFrame(this.tick.bind(this));
    } catch (err: any) {
      if (this.onError) this.onError(err);
    }
  }

  public stop() {
    this.isScanning = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  private async tick() {
    if (!this.isScanning) return;

    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      this.canvas.height = this.video.videoHeight;
      this.canvas.width = this.video.videoWidth;
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Use ZXing (much more robust than jsQR) to read the QR code
      try {
        const results = await readBarcodes(imageData, {
          formats: ['QRCode'],
          tryHarder: true,
        });

        if (results.length > 0 && results[0].text) {
          const text = results[0].text;
          // Deduplicate
          if (text !== this.lastPayloadStr) {
            this.lastPayloadStr = text;
            try {
              const binaryStr = atob(text);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              this.handlePayload(bytes);
            } catch (e) {
              // Not a valid base64 LightLink frame, skip
            }
          }
        }
      } catch (e) {
        // ZXing decode error — skip frame
      }
    }
    requestAnimationFrame(this.tick.bind(this));
  }

  private handlePayload(buffer: Uint8Array) {
    const type = buffer[0];
    
    if (type === 0) {
      // Meta Frame
      if (this.decoder) return; // Already initialized
      try {
        const jsonStr = new TextDecoder().decode(buffer.slice(1));
        const meta = JSON.parse(jsonStr) as FileMeta;
        this.decoder = new LTDecoder(meta);
      } catch (e) {
        console.warn("Failed to parse Meta frame");
      }
    } else if (type === 1) {
      // Data Frame
      if (!this.decoder) return; // Need meta first
      
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const seed = view.getUint32(1, true);
      const payload = buffer.slice(5);
      
      this.decoder.addSymbol(seed, payload);
      
      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          progress: this.decoder.getProgress(),
          received: this.decoder.totalSymbolsReceived,
          redundant: this.decoder.redundantSymbols
        });
      }

      if (this.decoder.isComplete()) {
        this.finish();
      }
    }
  }

  private async finish() {
    this.isScanning = false;
    try {
      const file = await this.decoder!.getReconstructedFile();
      if (this.onComplete) {
        this.onComplete(file);
      }
    } catch (e: any) {
      if (this.onError) this.onError(e);
    }
  }
}
