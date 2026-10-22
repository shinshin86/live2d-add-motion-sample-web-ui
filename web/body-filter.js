// @ts-check
// Speed-adaptive low pass (Casiez, Roussel and Vogel, CHI 2012).
// Time is in milliseconds; cutoffs are Hz and beta is per input unit/second.
export class OneEuro {
  value = 0;
  previous = 0;
  velocity = 0;
  time = -Infinity;
  /** @param {number} [minimum] @param {number} [beta] */
  constructor(minimum = 0.65, beta = 0.15) { this.minimum = minimum; this.beta = beta; }
  reset() { this.time = -Infinity; this.velocity = 0; }
  /** @param {number} input @param {number} now */
  update(input, now) {
    if (!Number.isFinite(input) || !Number.isFinite(now)) return this.value;
    if (now <= this.time) return this.value;
    if (!Number.isFinite(this.time)) {
      this.value = this.previous = input; this.time = now; return input;
    }
    const dt = (now - this.time) / 1000;
    const alpha = (/** @type {number} */ cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.velocity += alpha(1) * ((input - this.previous) / dt - this.velocity);
    this.value += alpha(this.minimum + this.beta * Math.abs(this.velocity)) * (input - this.value);
    this.previous = input; this.time = now;
    return this.value;
  }
}

/** Glide across sparse pose samples, even with face smoothing at zero.
 * Default 0.35 gives 1.2 pose intervals; slider spans 0.85–1.85 intervals.
 * @param {number} smoothing @param {number} interval milliseconds */
export function bodyTimeConstant(smoothing, interval) {
  const amount = Math.max(0, Math.min(1, smoothing));
  return Math.max(amount * 0.25, interval / 1000 * (0.85 + amount));
}
