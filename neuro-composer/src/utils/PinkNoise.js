export class PinkNoise {
  constructor() {
    this.max_key = 0x1f; this.key = 0;
    this.white_values = [Math.random(), Math.random(), Math.random(), Math.random(), Math.random()];
  }
  getNext() {
    const last = this.key; this.key++; if (this.key > this.max_key) this.key = 0;
    const diff = last ^ this.key; let sum = 0;
    for (let i = 0; i < 5; i++) { if (diff & (1 << i)) this.white_values[i] = Math.random() * 2 - 1; sum += this.white_values[i]; }
    return sum / 5;
  }
}