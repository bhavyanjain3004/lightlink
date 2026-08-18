import { LTDecoder } from '../lt-codes/decoder';
import { FileMeta } from '../lt-codes/encoder';

// Extend window type for BarcodeDetector (Chrome/Android native API)
declare const BarcodeDetector: any;

export class VisualReceiver {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  private stream: MediaStream | null = null;
  private isScanning: boolean = false;
  
  private decoder: LTDecoder | null = null;
  private lastPayloadStr: string = '';
  private detector: any = null;

  public onStatsUpdate?: (stats: { progress: number, received: number, redundant: number }) => void;
  public onComplete?: (file: File) => void;
  public onError?: (err: Error) => void;

  constructor(videoElement?: HTMLVideoElement) {
    this.video = videoElement || document.createElement('video');
    this.video.setAttribute('playsinline', 'true');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  public async start() {
    if (this.isScanning) return;
    
    // Initialize detector — prefer native BarcodeDetector (Chrome/Android), fall back to jsQR
    try {
      if (typeof BarcodeDetector !== 'undefined') {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.includes('qr_code')) {
          this.detector = new BarcodeDetector({ formats: ['qr_code'] });
          console.log('[LightLink] Using native BarcodeDetector ✅');
        }
      }
    } catch (e) {
      console.warn('[LightLink] BarcodeDetector not available, falling back to jsQR');
    }

    // If native not available, dynamically load jsQR
    if (!this.detector) {
      try {
        const jsQR = (await import('jsqr')).default;
        this.detector = { _jsqr: jsQR };
        console.log('[LightLink] Using jsQR fallback');
      } catch (e) {
        console.error('[LightLink] No QR decoder available!', e);
      }
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.isScanning = true;
      this.tick();
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

      try {
        let text: string | null = null;

        if (this.detector && !this.detector._jsqr) {
          // Native BarcodeDetector path
          const results = await this.detector.detect(this.video);
          if (results.length > 0) {
            text = results[0].rawValue;
          }
        } else if (this.detector && this.detector._jsqr) {
          // jsQR fallback path
          const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
          const code = this.detector._jsqr(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code) text = code.data;
        }

        if (text && text !== this.lastPayloadStr) {
          this.lastPayloadStr = text;
          try {
            const binaryStr = atob(text);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            this.handlePayload(bytes);
          } catch (e) {
            // Not a valid LightLink base64 frame, skip
          }
        }
      } catch (e) {
        // Decode error on this frame, skip
      }
    }

    // Use setTimeout instead of rAF so we don't hammer CPU at 60fps
    setTimeout(() => this.tick(), 150); // ~6.5 fps scan rate
  }

  private handlePayload(buffer: Uint8Array) {
    const type = buffer[0];
    
    if (type === 0) {
      // Meta Frame
      if (this.decoder) return;
      try {
        const jsonStr = new TextDecoder().decode(buffer.slice(1));
        const meta = JSON.parse(jsonStr) as FileMeta;
        this.decoder = new LTDecoder(meta);
        console.log('[LightLink] Meta frame received! File:', meta.name, 'Chunks:', meta.k);
      } catch (e) {
        console.warn('[LightLink] Failed to parse Meta frame', e);
      }
    } else if (type === 1) {
      // Data Frame
      if (!this.decoder) {
        console.log('[LightLink] Data frame received but no meta yet — waiting for meta frame');
        return;
      }
      
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const seed = view.getUint32(1, true);
      const payload = buffer.slice(5);
      
      this.decoder.addSymbol(seed, payload);
      
      const stats = {
        progress: this.decoder.getProgress(),
        received: this.decoder.totalSymbolsReceived,
        redundant: this.decoder.redundantSymbols
      };
      console.log('[LightLink] Data frame! Progress:', (stats.progress * 100).toFixed(1) + '%');

      if (this.onStatsUpdate) {
        this.onStatsUpdate(stats);
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
      console.log('[LightLink] ✅ File reconstructed:', file.name, file.size, 'bytes');
      if (this.onComplete) {
        this.onComplete(file);
      }
    } catch (e: any) {
      console.error('[LightLink] Reconstruction failed:', e);
      if (this.onError) this.onError(e);
    }
  }
}
