import * as tf from '@tensorflow/tfjs';

export class MLDecoder {
  private model: tf.LayersModel | tf.GraphModel | null = null;
  private isLoaded: boolean = false;
  private canvas256: HTMLCanvasElement;
  private ctx256: CanvasRenderingContext2D;

  constructor() {
    this.canvas256 = document.createElement('canvas');
    this.canvas256.width = 256;
    this.canvas256.height = 256;
    this.ctx256 = this.canvas256.getContext('2d', { willReadFrequently: true })!;
  }

  public async loadModel(): Promise<void> {
    if (this.isLoaded) return;
    try {
      this.model = await tf.loadGraphModel('/model/model.json');
      this.isLoaded = true;
      console.log('[LightLink ML] Model loaded successfully ✅');
    } catch (e) {
      console.error('[LightLink ML] Failed to load model:', e);
      throw e;
    }
  }

  /**
   * Cleans a square crop of a frame (rescaled to 256x256) and returns the restored 256x256 ImageData.
   */
  public async processFrame(videoOrCanvas: HTMLVideoElement | HTMLCanvasElement): Promise<ImageData | null> {
    if (!this.isLoaded || !this.model) {
      return null;
    }

    try {
      let srcX = 0, srcY = 0, srcSize = 0;
      if (videoOrCanvas instanceof HTMLVideoElement) {
        const w = videoOrCanvas.videoWidth;
        const h = videoOrCanvas.videoHeight;
        srcSize = Math.min(w, h);
        srcX = (w - srcSize) / 2;
        srcY = (h - srcSize) / 2;
      } else {
        const w = videoOrCanvas.width;
        const h = videoOrCanvas.height;
        srcSize = Math.min(w, h);
        srcX = (w - srcSize) / 2;
        srcY = (h - srcSize) / 2;
      }

      this.ctx256.clearRect(0, 0, 256, 256);
      this.ctx256.drawImage(videoOrCanvas, srcX, srcY, srcSize, srcSize, 0, 0, 256, 256);

      const imgData = this.ctx256.getImageData(0, 0, 256, 256);
      
      const data = imgData.data;
      const grayData = new Float32Array(256 * 256);
      for (let i = 0; i < 256 * 256; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        grayData[i] = (r + g + b) / 3.0 / 255.0; // scale to [0, 1]
      }

      const inputTensor = tf.tensor4d(grayData, [1, 256, 256, 1]);
      const outputTensor = this.model.predict(inputTensor) as tf.Tensor;
      const outputData = await outputTensor.data();
      
      inputTensor.dispose();
      outputTensor.dispose();

      const outImgData = new ImageData(256, 256);
      const outPixels = outImgData.data;
      for (let i = 0; i < 256 * 256; i++) {
        const val = outputData[i] > 0.5 ? 255 : 0;
        outPixels[i * 4] = val;     // R
        outPixels[i * 4 + 1] = val; // G
        outPixels[i * 4 + 2] = val; // B
        outPixels[i * 4 + 3] = 255; // A
      }

      return outImgData;
    } catch (e) {
      console.error('[LightLink ML] Error during frame processing:', e);
      return null;
    }
  }
}
