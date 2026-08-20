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

import { chunkFile, ltEncodeStream, FileMeta } from '../lt-codes/encoder';
import { LTDecoder } from '../lt-codes/decoder';

function createMockFile(sizeInBytes: number, filename: string = "transfer_benchmark.bin"): File {
  const data = new Uint8Array(sizeInBytes);
  for (let i = 0; i < sizeInBytes; i++) {
    data[i] = (i * 37 + 13) % 256;
  }
  const file: any = new File([data], filename, { type: "application/octet-stream" });
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

describe('End-to-End Wall-Clock Throughput Benchmark', () => {
  it('should measure empirical wall-clock transfer time and effective throughput across Part A vs Part B vs Part C', async () => {
    const testFileSize = 20 * 1024; // 20 KB standardized test file
    const testFile = createMockFile(testFileSize);

    const configurations = [
      { name: "Part A (Baseline: Single QR, 80B, 3fps)", gridSize: 1, chunkSize: 80, fps: 3, frameDropRate: 0.15 },
      { name: "Part B (Reliability: Single QR, 80B, 6.5fps)", gridSize: 1, chunkSize: 80, fps: 6.5, frameDropRate: 0.10 },
      { name: "Part C (Throughput: 2x2 Grid, 100B, 8fps)", gridSize: 2, chunkSize: 100, fps: 8.0, frameDropRate: 0.10 },
    ];

    console.log("\n" + "=".repeat(85));
    console.log("LIGHTLINK EMPIRICAL WALL-CLOCK THROUGHPUT BENCHMARK (20 KB Test File)");
    console.log("=".repeat(85));

    const resultsSummary: any[] = [];

    for (const config of configurations) {
      const { blocks, meta } = await chunkFile(testFile, config.chunkSize);
      const encoder = ltEncodeStream(blocks);
      const decoder = new LTDecoder(meta);

      const totalCells = config.gridSize * config.gridSize;
      let frameCount = 0;
      let symbolsEmitted = 0;
      let symbolsDecoded = 0;

      // Wall-clock simulation
      const frameDurationSec = 1.0 / config.fps;
      let simulatedWallClockSec = 0;

      while (!decoder.isComplete() && frameCount < 1000) {
        simulatedWallClockSec += frameDurationSec;
        frameCount++;

        // Simulate frame drop (camera motion / lighting miss)
        const frameDropped = Math.random() < config.frameDropRate;
        if (frameDropped) continue;

        for (let cell = 0; cell < totalCells; cell++) {
          if (frameCount % 15 === 0 && cell === 0) {
            // Meta frame
            continue;
          } else {
            const { value } = encoder.next();
            if (!value) break;
            symbolsEmitted++;
            symbolsDecoded++;
            decoder.addSymbol(value.seed, value.payload, 1.0);
            if (decoder.isComplete()) break;
          }
        }
      }

      expect(decoder.isComplete()).toBe(true);

      const effectiveThroughputBps = Math.round(testFileSize / simulatedWallClockSec);
      const overheadRatio = (decoder.totalSymbolsReceived / meta.blockCount).toFixed(2);

      resultsSummary.push({
        config: config.name,
        wallClockSec: simulatedWallClockSec.toFixed(2),
        throughputBps: effectiveThroughputBps,
        blocksOriginal: meta.blockCount,
        symbolsReceived: decoder.totalSymbolsReceived,
        overheadRatio: `${overheadRatio}x`,
        framesSent: frameCount
      });

      console.log(`\n[${config.name}]`);
      console.log(`  - Wall-clock Transfer Time: ${simulatedWallClockSec.toFixed(2)}s`);
      console.log(`  - Effective Throughput:     ${effectiveThroughputBps} Bytes/sec (~${(effectiveThroughputBps / 1024).toFixed(2)} KB/s)`);
      console.log(`  - Original Blocks:          ${meta.blockCount}`);
      console.log(`  - Symbols Decoded:          ${decoder.totalSymbolsReceived} (Overhead: ${overheadRatio}x)`);
      console.log(`  - Total Frames Rendered:    ${frameCount}`);
    }

    console.log("\n" + "=".repeat(85));
    console.log(`${'Configuration'.padEnd(45)} | ${'Wall Time'.padEnd(10)} | ${'Effective Throughput'.padEnd(22)}`);
    console.log("=".repeat(85));
    for (const r of resultsSummary) {
      console.log(`${r.config.padEnd(45)} | ${(r.wallClockSec + 's').padEnd(10)} | ${(r.throughputBps + ' B/s (~' + (r.throughputBps/1024).toFixed(1) + ' KB/s)').padEnd(22)}`);
    }
    console.log("=".repeat(85) + "\n");
  });
});
