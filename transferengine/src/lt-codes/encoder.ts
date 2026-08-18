import { mulberry32, shuffleArray } from './prng';
import { RobustSoliton } from './soliton';

export interface FileMeta {
  name: string;
  type: string;
  size: number; // original size
  compressedSize: number;
  chunkSize: number;
  blockCount: number;
  hash: string; // SHA-256 of original file
}

export interface EncodedSymbol {
  seed: number;
  payload: Uint8Array;
}

export async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function chunkFile(file: File, chunkSize: number): Promise<{ blocks: Uint8Array[], meta: FileMeta }> {
  // Compute original hash
  const originalBuffer = await file.arrayBuffer();
  const hash = await computeHash(originalBuffer);

  // Compress using CompressionStream
  const ds = new CompressionStream('gzip');
  const compressedStream = file.stream().pipeThrough(ds);
  const compressedResponse = new Response(compressedStream);
  const compressedBuffer = await compressedResponse.arrayBuffer();
  const compressedArray = new Uint8Array(compressedBuffer);

  const blockCount = Math.ceil(compressedArray.length / chunkSize);
  const blocks: Uint8Array[] = [];

  for (let i = 0; i < blockCount; i++) {
    const block = new Uint8Array(chunkSize);
    const slice = compressedArray.slice(i * chunkSize, (i + 1) * chunkSize);
    block.set(slice); // Pads with 0s if slice is smaller
    blocks.push(block);
  }

  const meta: FileMeta = {
    name: file.name,
    type: file.type,
    size: file.size,
    compressedSize: compressedArray.length,
    chunkSize,
    blockCount,
    hash
  };

  return { blocks, meta };
}

export function* ltEncodeStream(blocks: Uint8Array[]): Generator<EncodedSymbol> {
  const k = blocks.length;
  const chunkSize = blocks[0].length;
  const soliton = new RobustSoliton(k);

  while (true) {
    const seed = Math.floor(Math.random() * 0xffffffff);
    const prng = mulberry32(seed);
    const d = soliton.sampleDegree(prng);

    // Pick d unique indices
    const indices = Array.from({ length: k }, (_, i) => i);
    shuffleArray(prng, indices);
    const selectedIndices = indices.slice(0, d);

    // XOR blocks
    const payload = new Uint8Array(chunkSize);
    for (const idx of selectedIndices) {
      const block = blocks[idx];
      for (let i = 0; i < chunkSize; i++) {
        payload[i] ^= block[i];
      }
    }

    yield { seed, payload };
  }
}
