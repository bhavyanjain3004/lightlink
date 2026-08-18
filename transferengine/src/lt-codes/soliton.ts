export class RobustSoliton {
  private distribution: number[];
  private k: number;

  constructor(k: number, c: number = 0.1, delta: number = 0.05) {
    this.k = k;
    this.distribution = this.generateDistribution(k, c, delta);
  }

  private generateDistribution(k: number, c: number, delta: number): number[] {
    const rho = new Array(k + 1).fill(0);
    rho[1] = 1 / k;
    for (let d = 2; d <= k; d++) {
      rho[d] = 1 / (d * (d - 1));
    }

    const tau = new Array(k + 1).fill(0);
    const R = c * Math.log(k / delta) * Math.sqrt(k);
    const pivot = Math.floor(k / R);

    for (let d = 1; d <= pivot - 1; d++) {
      tau[d] = R / (k * d);
    }
    if (pivot >= 1 && pivot <= k) {
      tau[pivot] = (R * Math.log(R / delta)) / k;
    }

    let Z = 0;
    const mu = new Array(k + 1).fill(0);
    for (let d = 1; d <= k; d++) {
      mu[d] = rho[d] + tau[d];
      Z += mu[d];
    }

    // Normalize and create cumulative distribution
    const cumulative = new Array(k + 1).fill(0);
    let sum = 0;
    for (let d = 1; d <= k; d++) {
      sum += mu[d] / Z;
      cumulative[d] = sum;
    }

    // Fix precision issues
    cumulative[k] = 1.0;
    return cumulative;
  }

  public sampleDegree(prng: () => number): number {
    const r = prng();
    for (let d = 1; d <= this.k; d++) {
      if (r < this.distribution[d]) {
        return d;
      }
    }
    return this.k;
  }
}
