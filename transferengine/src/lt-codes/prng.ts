export function mulberry32(a: number): () => number {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper to get random integer between min and max (exclusive)
export function getRandomInt(prng: () => number, min: number, max: number): number {
  return Math.floor(prng() * (max - min)) + min;
}

// Helper to shuffle an array using Fisher-Yates
export function shuffleArray<T>(prng: () => number, array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
