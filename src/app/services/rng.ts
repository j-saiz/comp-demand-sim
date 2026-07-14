/**
 * Seeded mulberry32 PRNG for reproducible Monte Carlo runs.
 * Returns values in [0, 1).
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Force uint32
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
