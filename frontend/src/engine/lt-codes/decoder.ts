import { mulberry32, shuffleArray } from './prng';
import { RobustSoliton } from './soliton';
import { FileMeta, computeHash } from './encoder';

export class LTDecoder {
  private blockCount: number;
  private chunkSize: number;
  private blocks: (Uint8Array | null)[];
  private symbols: { indices: Set<number>, payload: Uint8Array }[];
  private meta: FileMeta;
  private soliton: RobustSoliton;
  public totalSymbolsReceived: number = 0;
  public redundantSymbols: number = 0;

  private blockConfidences: number[];

  constructor(meta: FileMeta) {
    this.meta = meta;
    this.blockCount = meta.blockCount;
    this.chunkSize = meta.chunkSize;
    this.blocks = new Array(this.blockCount).fill(null);
    this.blockConfidences = new Array(this.blockCount).fill(0);
    this.symbols = [];
    this.soliton = new RobustSoliton(this.blockCount);
  }

  public addSymbol(seed: number, payload: Uint8Array, confidence: number = 1.0): void {
    this.totalSymbolsReceived++;
    const prng = mulberry32(seed);
    const d = this.soliton.sampleDegree(prng);

    const allIndices = Array.from({ length: this.blockCount }, (_, i) => i);
    shuffleArray(prng, allIndices);
    const indicesArray = allIndices.slice(0, d);
    const indices = new Set(indicesArray);

    // Initial pass: XOR out already known blocks
    for (const idx of Array.from(indices)) {
      if (this.blocks[idx]) {
        this.xorPayload(payload, this.blocks[idx]!);
        indices.delete(idx);
      }
    }

    if (indices.size === 0) {
      this.redundantSymbols++;
      return; // Already knew everything in this symbol
    }

    if (indices.size === 1) {
      const idx = Array.from(indices)[0];
      this.resolveBlock(idx, new Uint8Array(payload), confidence);
    } else {
      // Need more information, store for peeling
      this.symbols.push({ indices, payload: new Uint8Array(payload) });
    }
  }

  private resolveBlock(idx: number, data: Uint8Array, confidence: number) {
    if (this.blocks[idx] !== null && confidence <= this.blockConfidences[idx]) {
      return;
    }

    this.blocks[idx] = data;
    this.blockConfidences[idx] = confidence;

    // Propagate to unresolved symbols (Peeling)
    let i = 0;
    while (i < this.symbols.length) {
      const sym = this.symbols[i];
      if (sym.indices.has(idx)) {
        this.xorPayload(sym.payload, data);
        sym.indices.delete(idx);

        if (sym.indices.size === 1) {
          const newIdx = Array.from(sym.indices)[0];
          // Remove from symbols list
          this.symbols[i] = this.symbols[this.symbols.length - 1];
          this.symbols.pop();
          // Recursively resolve
          this.resolveBlock(newIdx, new Uint8Array(sym.payload), confidence);
          continue; // Don't increment i because we swapped
        } else if (sym.indices.size === 0) {
          // Completely resolved and redundant
          this.symbols[i] = this.symbols[this.symbols.length - 1];
          this.symbols.pop();
          continue;
        }
      }
      i++;
    }
  }

  private xorPayload(target: Uint8Array, source: Uint8Array) {
    for (let i = 0; i < this.chunkSize; i++) {
      target[i] ^= source[i];
    }
  }

  public getProgress(): number {
    const resolved = this.blocks.filter(b => b !== null).length;
    return resolved / this.blockCount;
  }

  public isComplete(): boolean {
    return this.getProgress() === 1.0;
  }

  public async getReconstructedFile(): Promise<File> {
    if (!this.isComplete()) {
      throw new Error("File not fully decoded yet");
    }

    // Concatenate all blocks
    const compressedData = new Uint8Array(this.blockCount * this.chunkSize);
    for (let i = 0; i < this.blockCount; i++) {
      compressedData.set(this.blocks[i]!, i * this.chunkSize);
    }

    // Slice to exact compressed size
    const exactCompressedData = compressedData.slice(0, this.meta.compressedSize);

    // Decompress
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([exactCompressedData]);
    const decompressedStream = blob.stream().pipeThrough(ds);
    const decompressedResponse = new Response(decompressedStream);
    const decompressedBuffer = await decompressedResponse.arrayBuffer();

    // Verify Hash
    const hash = await computeHash(decompressedBuffer);
    if (hash !== this.meta.hash) {
      throw new Error(`Checksum mismatch! Expected ${this.meta.hash}, got ${hash}`);
    }

    return new File([decompressedBuffer], this.meta.name, { type: this.meta.type });
  }
}
