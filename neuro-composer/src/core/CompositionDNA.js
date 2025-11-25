import * as Tone from 'tone';

export class CompositionDNA {
  constructor(len, melNotes, bassNotes, isRand = true) {
    this.melodyGenes = []; this.harmonyGenes = []; this.fitness = 0; this.feedback = "";
    if (isRand) {
      for (let i = 0; i < len; i++) {
        this.melodyGenes.push({
          note: melNotes[Math.floor(Math.random() * melNotes.length)],
          duration: Math.random() > 0.6 ? "2n" : "4n",
          velocity: 0.3 + (Math.random() * 0.4)
        });
        this.harmonyGenes.push(i % 2 === 0 ? {
          note: bassNotes[Math.floor(Math.random() * bassNotes.length)],
          type: Math.random() > 0.5 ? "chord" : "arpeggio",
          velocity: 0.2 + (Math.random() * 0.2)
        } : null);
      }
    }
  }
  crossover(p) {
    const c = new CompositionDNA(this.melodyGenes.length, [], [], false);
    const m = Math.floor(Math.random() * this.melodyGenes.length);
    for (let i = 0; i < this.melodyGenes.length; i++) {
      c.melodyGenes[i] = i > m ? this.melodyGenes[i] : p.melodyGenes[i];
      c.harmonyGenes[i] = i > m ? this.harmonyGenes[i] : p.harmonyGenes[i];
    }
    return c;
  }
  mutate(rate, mNotes, bNotes, pn) {
    for (let i = 0; i < this.melodyGenes.length; i++) {
      if (Math.random() < rate) this.melodyGenes[i].note = mNotes[Math.floor(Math.random() * mNotes.length)];
      if (Math.random() < rate) { const n = pn.getNext(); this.melodyGenes[i].velocity = Math.max(0.1, Math.min(0.9, this.melodyGenes[i].velocity + (n * 0.1))); }
      if (this.harmonyGenes[i] && Math.random() < rate) this.harmonyGenes[i].note = bNotes[Math.floor(Math.random() * bNotes.length)];
    }
  }
}