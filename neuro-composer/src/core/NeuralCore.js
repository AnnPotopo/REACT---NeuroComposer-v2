import * as mm from '@magenta/music';

export class NeuralCore {
  constructor() {
    // Usamos un modelo pre-entrenado llamado "Melody RNN"
    // checkpoint: modelo entrenado para melodías básicas
    this.model = new mm.MusicRNN(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn'
    );
    this.isReady = false;
  }

  async initialize() {
    if (this.isReady) return;
    console.log('🧠 Cargando Red Neuronal...');
    await this.model.initialize();
    this.isReady = true;
    console.log('🧠 Red Neuronal Lista');
  }

  // Función principal: Generar continuación
  async generate(seedNotes, totalSteps = 32, temperature = 1.1) {
    if (!this.isReady) await this.initialize();

    // 1. Convertir notas de tu formato a formato Magenta (NoteSequence)
    // Si no hay semilla (seed), usamos una nota base
    const inputSequence = seedNotes && seedNotes.length > 0 
      ? this.convertToMagenta(seedNotes) 
      : {
          notes: [{ pitch: 60, startTime: 0, endTime: 0.5 }],
          totalTime: 0.5,
          quantizationInfo: { stepsPerQuarter: 4 }
        };

    // 2. La IA "piensa" y continúa la melodía
    // rnnSteps: Cuántos pasos (16avos) va a generar
    // temperature: Creatividad (1.0 = normal, 1.5 = loco, 0.5 = conservador)
    const result = await this.model.continueSequence(
      inputSequence, 
      totalSteps, 
      temperature
    );

    // 3. Convertir respuesta de Magenta a tu formato para Tone.js
    return this.convertFromMagenta(result);
  }

  // --- UTILS DE CONVERSIÓN ---

  convertToMagenta(myNotes) {
    // Magenta necesita tiempos absolutos cuantizados
    // Asumimos 1 paso = 1 semicorchea (16th note)
    return {
      notes: myNotes.map((n, i) => ({
        pitch: Tone.Frequency(n.note).toMidi(),
        quantizedStartStep: i * 4, // Simplificación: 1 nota por negra
        quantizedEndStep: (i * 4) + 4
      })),
      quantizationInfo: { stepsPerQuarter: 4 },
      totalQuantizedSteps: myNotes.length * 4
    };
  }

  convertFromMagenta(sequence) {
    return sequence.notes.map(n => ({
      note: Tone.Frequency(n.pitch, "midi").toNote(),
      // Convertir steps de vuelta a duraciones aproximadas
      duration: "4n", // Simplificado para el demo
      velocity: 0.7 + (Math.random() * 0.2), // Humanización leve
      startStep: n.quantizedStartStep
    }));
  }
}

// Importar Tone solo para conversiones de nota
import * as Tone from 'tone';