import * as Tone from 'tone';
import { THEORY } from './Theory';

export class CompositionDNA {
  constructor(len, scaleRoot, scaleName, isRand = true) {
    this.melodyGenes = [];
    this.harmonyGenes = [];
    this.fitness = 0;
    this.feedback = "";

    // Elegir una progresión de acordes para este "ser"
    // Cada 4 notas (aprox 1 compás) cambiamos de acorde
    const progression = THEORY.progressions[Math.floor(Math.random() * THEORY.progressions.length)];

    if (isRand) {
      for (let i = 0; i < len; i++) {
        // Determinar acorde actual según la posición (cada 4 pasos cambia acorde)
        const chordDegree = progression[Math.floor(i / 4) % progression.length];
        const chordNotes = THEORY.getChordNotes(scaleRoot, scaleName, chordDegree);

        // --- BAJO INTELIGENTE ---
        // El bajo siempre toca la tónica del acorde o su quinta
        const bassNote = i % 4 === 0 ? chordNotes[0] : (Math.random() > 0.5 ? chordNotes[2] : chordNotes[0]);
        // Bajar octavas para que sea bajo real
        const bassOctave = Tone.Frequency(bassNote).toMidi() - 24;

        this.harmonyGenes.push({
          note: Tone.Frequency(bassOctave, "midi").toNote(),
          type: i % 4 === 0 ? "chord" : "arpeggio",
          velocity: i % 4 === 0 ? 0.6 : 0.4
        });

        // --- MELODÍA INTELIGENTE ---
        // En tiempos fuertes (0, 4, 8...), preferir notas del acorde
        // En tiempos débiles, notas de paso de la escala
        const isStrongBeat = i % 2 === 0;
        let possibleNotes;

        if (isStrongBeat) {
          // Notas del acorde en octava aguda
          possibleNotes = chordNotes.map(n => Tone.Frequency(n).toMidi() + 12);
        } else {
          // Cualquier nota de la escala cercana
          const rootMidi = Tone.Frequency(scaleRoot).toMidi();
          const scaleInt = THEORY.scales[scaleName];
          possibleNotes = scaleInt.map(n => rootMidi + n + 12);
        }

        const chosenMidi = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];

        this.melodyGenes.push({
          note: Tone.Frequency(chosenMidi, "midi").toNote(),
          duration: Math.random() > 0.8 ? "2n" : "4n",
          velocity: isStrongBeat ? 0.6 : 0.4 + (Math.random() * 0.2)
        });
      }
    }
  }

  crossover(partner) {
    // Cruce por mitades para mantener coherencia de frases
    const child = new CompositionDNA(this.melodyGenes.length, 'C4', 'ionian', false);
    const split = Math.floor(this.melodyGenes.length / 2);

    child.melodyGenes = [...this.melodyGenes.slice(0, split), ...partner.melodyGenes.slice(split)];
    child.harmonyGenes = [...this.harmonyGenes.slice(0, split), ...partner.harmonyGenes.slice(split)];

    return child;
  }

  mutate(rate, pinkNoise, midiStats = null) {
    for (let i = 0; i < this.melodyGenes.length; i++) {
      // Mutación de nota: ahora verifica la armonía con el bajo
      if (Math.random() < rate) {
        const currentBass = this.harmonyGenes[i].note;
        let newNote = this.melodyGenes[i].note;
        let safety = 0;

        // Intentar hasta 5 veces encontrar una nota que no suene mal (consonante)
        do {
          // Usar lógica de Markov si existe, sino aleatorio
          if (midiStats && i > 0 && midiStats.transitions) {
            const prev = Tone.Frequency(this.melodyGenes[i - 1].note).toMidi();
            const opts = midiStats.transitions[prev];
            if (opts) {
              const n = opts[Math.floor(Math.random() * opts.length)];
              newNote = Tone.Frequency(n, "midi").toNote();
            }
          }
          safety++;
        } while (!THEORY.isConsonant(newNote, currentBass) && safety < 5);

        this.melodyGenes[i].note = newNote;
      }

      // Humanización de velocidad
      if (Math.random() < rate) {
        const noise = pinkNoise.getNext();
        this.melodyGenes[i].velocity = Math.max(0.2, Math.min(0.8, this.melodyGenes[i].velocity + (noise * 0.1)));
      }
    }
  }
}