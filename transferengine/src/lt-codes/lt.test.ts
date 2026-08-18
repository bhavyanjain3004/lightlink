import crypto from 'crypto';
import { TransformStream } from 'stream/web';
Object.defineProperty(global, 'crypto', { value: crypto.webcrypto });

if (!Blob.prototype.stream) {
  (Blob.prototype as any).stream = function() {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    this.arrayBuffer().then((buf: any) => {
      writer.write(new Uint8Array(buf));
      writer.close();
    });
    return stream.readable;
  };
}
Object.defineProperty(global, 'crypto', { value: crypto.webcrypto });

class MockCompressionStream {
  readable: any;
  writable: any;
  constructor() {
    const { readable, writable } = new TransformStream();
    this.readable = readable;
    this.writable = writable;
  }
}
Object.defineProperty(global, 'CompressionStream', { value: MockCompressionStream });
Object.defineProperty(global, 'DecompressionStream', { value: MockCompressionStream });

import { chunkFile, ltEncodeStream } from './encoder';
import { LTDecoder } from './decoder';

// Helper to create a fake File in node/jsdom
function createFakeFile(size: number): File {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = i % 256;
  }
  const file: any = new File([data], "test.bin", { type: "application/octet-stream" });
  file.arrayBuffer = async () => data.buffer;
  file.stream = () => {
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    writer.write(data);
    writer.close();
    return stream.readable;
  };
  return file;
}

describe('LT Codes End-to-End', () => {
  it('should encode and decode a file even with 30% packet loss', async () => {
    // 1. Setup
    const originalFile = createFakeFile(1024 * 50); // 50 KB file
    const chunkSize = 150;

    // 2. Encode
    const { blocks, meta } = await chunkFile(originalFile, chunkSize);
    expect(meta.blockCount).toBeGreaterThan(0);
    expect(blocks.length).toBe(meta.blockCount);

    const encoder = ltEncodeStream(blocks);

    // 3. Setup Decoder
    const decoder = new LTDecoder(meta);

    // 4. Transfer with Loss
    const dropRate = 0.3; // 30% packet loss
    let maxSymbols = meta.blockCount * 4; // Shouldn't take more than 4x even with loss
    let encodedCount = 0;
    
    while (!decoder.isComplete() && encodedCount < maxSymbols) {
      const { value } = encoder.next();
      if (!value) break;
      encodedCount++;

      // Simulate packet loss
      if (Math.random() > dropRate) {
        decoder.addSymbol(value.seed, value.payload);
      }
    }

    // 5. Assertions
    expect(decoder.isComplete()).toBe(true);
    
    // In JSDOM, streams/files are limited, so we check the internal blocks directly
    const decodedBlocks = (decoder as any).blocks as Uint8Array[];
    for (let i = 0; i < blocks.length; i++) {
      expect(decodedBlocks[i]).toEqual(blocks[i]);
    }
  });
});
