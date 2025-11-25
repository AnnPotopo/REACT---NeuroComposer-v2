import * as Tone from 'tone';

export const THEORY = {
  scales: { lydian: [0, 2, 4, 6, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10] },
  getMelodyNotes: (root, s) => {
    const r = Tone.Frequency(root).toMidi();
    const int = THEORY.scales[s] || THEORY.scales.ionian;
    let n = []; for (let o = 1; o < 3; o++) int.forEach(i => n.push(Tone.Frequency(r + i + (o * 12), "midi").toNote()));
    return n;
  },
  getBassNotes: (root, s) => {
    const r = Tone.Frequency(root).toMidi() - 12;
    const int = THEORY.scales[s] || THEORY.scales.ionian;
    let n = []; for (let o = 0; o < 1; o++) int.forEach(i => n.push(Tone.Frequency(r + i + (o * 12), "midi").toNote()));
    return n;
  }
};