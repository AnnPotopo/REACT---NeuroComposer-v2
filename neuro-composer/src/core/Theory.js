import * as Tone from 'tone';

export const THEORY = {
  // Escalas completas
  scales: {
    lydian: [0, 2, 4, 6, 7, 9, 11],
    ionian: [0, 2, 4, 5, 7, 9, 11],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10]
  },

  // Progresiones de Acordes Emocionales (Grados de la escala)
  // I=0, ii=1, iii=2, IV=3, V=4, vi=5, vii=6
  progressions: [
    [0, 3, 4, 0], // Clásica I-IV-V-I (Alegre/Heroica)
    [0, 5, 3, 4], // Pop I-vi-IV-V (Nostálgica)
    [5, 3, 0, 4], // Épica vi-IV-I-V (Hans Zimmer style)
    [1, 4, 0, 5]  // Jazz ii-V-I-vi
  ],

  // Obtener notas válidas para un acorde específico en la escala
  getChordNotes: (root, scaleName, degree) => {
    const rootMidi = Tone.Frequency(root).toMidi();
    const intervals = THEORY.scales[scaleName] || THEORY.scales.ionian;

    // Construir tríada (Tónica, Tercera, Quinta) sobre el grado
    // Esto asegura que el acorde siempre esté "dentro" de la escala (diatónico)
    const chordIndices = [degree, (degree + 2) % 7, (degree + 4) % 7];

    return chordIndices.map(i => {
      // Calcular semitonos desde la tónica
      const semitones = intervals[i];
      // Ajustar octava si damos la vuelta al array
      const octaveOffset = i < degree ? 12 : 0;
      return Tone.Frequency(rootMidi + semitones + octaveOffset, "midi").toNote();
    });
  },

  // Verificar si una nota "choca" mal con el bajo (Disonancia)
  isConsonant: (melodyNote, bassNote) => {
    const m = Tone.Frequency(melodyNote).toMidi();
    const b = Tone.Frequency(bassNote).toMidi();
    const interval = Math.abs(m - b) % 12;
    // Intervalos "buenos": 0 (unísono), 3/4 (terceras), 5 (cuarta), 7 (quinta), 8/9 (sextas)
    // Intervalos "malos" (a evitar en tiempos fuertes): 1 (segunda menor), 6 (tritono), 11 (séptima mayor)
    return [0, 3, 4, 5, 7, 8, 9, 12].includes(interval);
  }
};