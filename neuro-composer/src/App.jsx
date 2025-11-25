import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Square, Download, Save, Trash2, Music4, Infinity as InfinityIcon, Clock, FolderOpen, FileMusic, Activity } from 'lucide-react';

// Importaciones modulares
import { MidiParser } from './utils/MidiParser';
import { PinkNoise } from './utils/PinkNoise';
import { THEORY } from './core/Theory';
import { CompositionDNA } from './core/CompositionDNA';

export default function App() {
  // --- STATE ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEvolving, setIsEvolving] = useState(false);
  const [isLoopMode, setIsLoopMode] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [currentMelody, setCurrentMelody] = useState([]);
  const [feedback, setFeedback] = useState("Sistema Listo");
  const [logs, setLogs] = useState(["NeuroComposer v2.0 Pro"]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Metadata extendida para soportar duración
  const [metaData, setMetaData] = useState({
    bpm: 120,
    scale: 'lydian',
    root: 'C4',
    structure: ["Theme A", "Theme B", "Bridge", "Theme A"],
    totalTicks: 0
  });

  // --- REFS (MEMORIA PERSISTENTE) ---
  const engineRef = useRef(null);
  const pinkNoiseRef = useRef(new PinkNoise());
  const seqRef = useRef(null);
  const abortRef = useRef(false);
  const loopTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // Memoria Evolutiva (Población persistente entre ciclos)
  const memoryRef = useRef({
    population: [], // Guardamos la población entera para no empezar de cero
    bestGenomes: [],
    midiPatterns: null,
    totalGenerations: 0
  });

  // --- AUDIO ENGINE ---
  const initAudio = async () => {
    if (Tone.context.state !== 'running') { await Tone.start(); await Tone.context.resume(); }
    if (engineRef.current) return;

    const reverb = new Tone.Reverb({ decay: 4, preDelay: 0.2, wet: 0.4 }).toDestination();
    await reverb.generate();
    const delay = new Tone.FeedbackDelay("8n.", 0.3).connect(reverb);
    const comp = new Tone.Compressor({ threshold: -24, ratio: 4 }).connect(delay);

    // Synth Melodía: Sonido más "Lead"
    const melSynth = new Tone.PolySynth(Tone.Synth, {
      volume: -6,
      oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
    }).connect(comp);

    // Synth Bajo: Más profundo
    const bassSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -4,
      harmonicity: 1,
      modulationIndex: 3,
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.6, release: 2 }
    }).connect(comp);

    engineRef.current = { melodyPiano: melSynth, bassPiano: bassSynth };
    addLog("Motor de Audio Pro: ONLINE");
  };

  const addLog = (msg) => setLogs(p => [msg, ...p.slice(0, 4)]);

  // --- AUTO SAVE SYSTEM ---
  const autoSave = () => {
    const saveData = {
      timestamp: Date.now(),
      generation,
      memory: {
        bestGenomes: memoryRef.current.bestGenomes.slice(0, 5), // Solo guardar los mejores para no llenar memoria
        midiPatterns: memoryRef.current.midiPatterns,
        totalGenerations: memoryRef.current.totalGenerations
      }
    };
    localStorage.setItem('neuroComposer_autosave', JSON.stringify(saveData));
    addLog("💾 Auto-Guardado completado");
  };

  // --- FITNESS PRO (El Crítico) ---
  const calculateFitness = (dna) => {
    let score = 0;
    const stats = memoryRef.current.midiPatterns?.stats;

    dna.melodyGenes.forEach((g, i) => {
      // 1. Coherencia interna (Regla básica)
      if (i > 0) {
        const prev = Tone.Frequency(dna.melodyGenes[i - 1].note).toMidi();
        const curr = Tone.Frequency(g.note).toMidi();
        const interval = curr - prev;

        // 2. Imitación de Estilo (Markov Check)
        if (stats) {
          // Si este intervalo es común en el MIDI original, gran premio
          if (stats.intervals[interval]) {
            score += (stats.intervals[interval] * 2);
          }
          // Si esta transición de nota específica existe en el MIDI
          if (stats.transitions[prev] && stats.transitions[prev].includes(curr)) {
            score += 15; // Gran premio por copiar el estilo
          }
        } else {
          // Reglas genéricas si no hay MIDI
          if (Math.abs(interval) <= 7) score += 5; // Pasos suaves
          if (Math.abs(interval) > 12) score -= 5; // Saltos muy grandes penalizados
        }
      }
    });

    dna.feedback = score > 500 ? "Virtuoso" : score > 200 ? "Creativo" : "Estudiante";
    return Math.max(0, score);
  };

  // --- CORE EVOLUTION LOOP ---
  const startEvolution = async (loop = false) => {
    if (isEvolving) return;
    try { await initAudio(); } catch (e) { }

    stopMusic(false);
    setIsEvolving(true);
    abortRef.current = false;

    addLog(loop ? `♻️ Ciclo Continuo (Gen ${generation})` : "🚀 Iniciando Evolución...");

    const mNotes = THEORY.getMelodyNotes(metaData.root, metaData.scale);
    const bNotes = THEORY.getBassNotes(metaData.root, metaData.scale);

    // 1. GESTIÓN DE POBLACIÓN (Persistencia)
    let pop = memoryRef.current.population;

    // Si está vacío o es el inicio, crear desde cero o desde 'bestGenomes'
    if (!pop || pop.length === 0) {
      if (memoryRef.current.bestGenomes.length > 0) {
        // Sembrar con los mejores anteriores (elitismo)
        pop = Array(40).fill().map((_, i) => {
          const parent = memoryRef.current.bestGenomes[i % memoryRef.current.bestGenomes.length];
          const c = new CompositionDNA(16, mNotes, bNotes, false);
          c.melodyGenes = JSON.parse(JSON.stringify(parent.melodyGenes));
          c.harmonyGenes = JSON.parse(JSON.stringify(parent.harmonyGenes));
          // Mutar ligeramente para variedad
          c.mutate(0.3, mNotes, bNotes, pinkNoiseRef.current, memoryRef.current.midiPatterns?.stats);
          return c;
        });
      } else {
        // Totalmente nuevo
        pop = Array(40).fill().map(() => new CompositionDNA(16, mNotes, bNotes));
      }
    }

    // 2. EVOLUCIÓN RÁPIDA (Processing)
    // Hacemos menos generaciones por ciclo (ej. 10) para que la música cambie más fluido
    const generationsPerCycle = 10;

    for (let g = 0; g < generationsPerCycle; g++) {
      if (abortRef.current) break;

      // Calificar
      pop.forEach(d => d.fitness = calculateFitness(d));
      pop.sort((a, b) => b.fitness - a.fitness);

      // Guardar datos globales
      memoryRef.current.totalGenerations++;
      setGeneration(memoryRef.current.totalGenerations);
      setBestFitness(Math.floor(pop[0].fitness));
      setFeedback(pop[0].feedback);

      // Solo actualizar visualmente cada 5 gens para rendimiento
      if (g % 5 === 0) {
        setCurrentMelody([...pop[0].melodyGenes]);
        await new Promise(r => setTimeout(r, 5)); // Breve pausa para no congelar UI
      }

      // Selección y Cruce (Torneo + Elitismo)
      let nextPop = pop.slice(0, 4); // Elitismo: Guardar los 4 mejores tal cual

      while (nextPop.length < 40) {
        // Torneo simple
        const p1 = pop[Math.floor(Math.random() * 20)]; // Elegir de la mitad superior
        const p2 = pop[Math.floor(Math.random() * 20)];

        const child = p1.crossover(p2);
        // Mutación inteligente
        child.mutate(0.15, mNotes, bNotes, pinkNoiseRef.current, memoryRef.current.midiPatterns?.stats);
        nextPop.push(child);
      }
      pop = nextPop;
    }

    // 3. FINALIZAR CICLO
    if (!abortRef.current) {
      memoryRef.current.population = pop; // Guardar estado actual para el siguiente ciclo

      // Actualizar Mejores Históricos
      const best = pop[0];
      if (memoryRef.current.bestGenomes.length < 5 || best.fitness > memoryRef.current.bestGenomes[memoryRef.current.bestGenomes.length - 1].fitness) {
        memoryRef.current.bestGenomes.push(best);
        memoryRef.current.bestGenomes.sort((a, b) => b.fitness - a.fitness);
        memoryRef.current.bestGenomes = memoryRef.current.bestGenomes.slice(0, 5);
      }

      // Auto-Save cada 50 generaciones
      if (memoryRef.current.totalGenerations % 50 === 0) autoSave();

      playSong(best);
    }
    setIsEvolving(false);
  };

  // --- PLAYBACK ---
  const playSong = (dna) => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }

    const { melodyPiano, bassPiano } = engineRef.current;

    // Calcular duración basada en BPM
    const beatTime = 60 / metaData.bpm;
    let songDuration = 0;

    // Construir eventos
    let evs = [];
    let currentTime = Tone.now() + 0.1;

    // Si tenemos MIDI original, intentamos respetar su duración repitiendo la estructura
    // Si no, usamos la estructura por defecto
    const targetDuration = memoryRef.current.midiPatterns?.stats?.totalDuration
      ? (memoryRef.current.midiPatterns.stats.totalDuration * beatTime) // Aproximación
      : 15; // 15 segundos por defecto si no hay MIDI

    // Repetir el patrón generado hasta llenar el tiempo
    let loops = 0;
    while (songDuration < targetDuration && loops < 8) { // Límite de seguridad 8 loops
      dna.melodyGenes.forEach((g, i) => {
        const time = currentTime + (i * beatTime);
        // Melodía
        evs.push({
          time,
          note: g.note,
          duration: g.duration,
          velocity: g.velocity,
          type: 'mel'
        });

        // Acompañamiento (si existe)
        if (dna.harmonyGenes[i]) {
          evs.push({
            time,
            note: dna.harmonyGenes[i].note,
            duration: "2n",
            velocity: dna.harmonyGenes[i].velocity * 0.7,
            type: 'bass'
          });
        }
      });

      const loopDuration = dna.melodyGenes.length * beatTime;
      currentTime += loopDuration;
      songDuration += loopDuration;
      loops++;
    }

    setTimeLeft(Math.round(songDuration));

    // Programar el final
    Tone.Transport.scheduleOnce(() => handleEnd(), currentTime + 1);

    // Crear Parte de Tone.js
    const part = new Tone.Part((time, e) => {
      Tone.Draw.schedule(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, time);

      if (e.type === 'mel') melodyPiano.triggerAttackRelease(e.note, e.duration, time, e.velocity);
      else bassPiano.triggerAttackRelease(e.note, e.duration, time, e.velocity);
    }, evs).start(0);

    Tone.Transport.bpm.value = metaData.bpm;
    Tone.Transport.start();

    setIsPlaying(true);
    seqRef.current = part;
    addLog(`🎵 Reproduciendo (${loops} loops)`);
  };

  const handleEnd = () => {
    setIsPlaying(false);
    if (isLoopMode && !abortRef.current) {
      // MODO CONTINUO: Reinicia automáticamente
      addLog("🔄 Auto-Evolución en 2s...");
      loopTimeoutRef.current = setTimeout(() => startEvolution(true), 2000);
    } else {
      setFeedback("Finalizado");
    }
  };

  const stopMusic = (full = true) => {
    if (full) { abortRef.current = true; setIsLoopMode(false); }
    clearTimeout(loopTimeoutRef.current);
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }

    if (engineRef.current && full) {
      engineRef.current.melodyPiano.releaseAll();
      engineRef.current.bassPiano.releaseAll();
    }
    setIsPlaying(false);
    setIsEvolving(false);
    setFeedback(full ? "Detenido" : "Procesando...");
  };

  // --- MANEJO DE ARCHIVOS ---
  const handleFile = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        if (file.name.endsWith('.mid')) {
          const p = new MidiParser(e.target.result);
          const d = p.parse(); // Ahora devuelve stats avanzados

          if (d.rawEvents.length > 0) {
            memoryRef.current.midiPatterns = d;
            // Resetear población para adaptarse al nuevo estilo
            memoryRef.current.population = [];

            // Cargar previsualización
            const newMel = d.rawEvents.slice(0, 16).map(ev => ({
              note: Tone.Frequency(ev.note, "midi").toNote(),
              duration: "4n",
              velocity: ev.velocity
            }));
            setCurrentMelody(newMel);

            setMetaData(prev => ({
              ...prev,
              fileName: file.name,
              // Intentar estimar BPM o usar default
              bpm: 120
            }));
            addLog("🧠 Estilo MIDI asimilado");
          }
        } else if (file.name.endsWith('.json')) {
          // Carga de Saves
          const j = JSON.parse(e.target.result);
          setGeneration(j.generation || 0);
          memoryRef.current = j.memory || j.memoryDump;
          addLog(`📂 Backup cargado (Gen ${j.generation})`);
        }
      } catch (err) {
        console.error(err);
        addLog("❌ Error al leer archivo");
      }
    };

    if (file.name.endsWith('.mid')) r.readAsArrayBuffer(file);
    else r.readAsText(file);
  };

  // --- UTILS VISUALES ---
  const saveProgress = () => {
    autoSave(); // Guardar en local
    // Exportar archivo
    const d = {
      type: "NEURO_COMPOSER_SAVE",
      timestamp: Date.now(),
      generation,
      metaData,
      memory: memoryRef.current
    };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `Neuro_Gen${generation}.json`; a.click();
  };

  const exportUnity = () => {
    if (!currentMelody.length) return;
    const d = {
      meta: { bpm: metaData.bpm },
      melody: currentMelody.map(n => ({ n: n.note, d: n.duration, v: n.velocity }))
    };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `Unity_Track_${Date.now()}.json`; a.click();
  };

  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] p-8 flex justify-center"
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
      onDrop={onDrop}>

      <div className={`w-full max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden transition-all duration-300 ${isDragging ? 'scale-[1.02] ring-4 ring-blue-200' : ''}`}>

        {/* Header */}
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#1d1d1f] rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Music4 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">NeuroComposer <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-full ml-2">PRO AI</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {isPlaying ? 'GENERANDO' : 'ESPERANDO'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-gray-50 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px] border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Gen</span>
              <span className="text-2xl font-black text-[#1d1d1f]">{generation}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={saveProgress} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Guardar JSON"><Save size={20} /></button>
              <button onClick={() => fileInputRef.current.click()} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Cargar MIDI/JSON"><FolderOpen size={20} /></button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".mid,.json" onChange={e => handleFile(e.target.files[0])} />
              <button onClick={() => window.location.reload()} className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors" title="Reiniciar Todo"><Trash2 size={20} /></button>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Sidebar de Control */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">

              {/* Switch Modo Infinito */}
              <div onClick={() => { setIsLoopMode(!isLoopMode); addLog(`Modo Automático: ${!isLoopMode ? 'ON' : 'OFF'}`) }}
                className={`group cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between select-none ${isLoopMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-colors ${isLoopMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <InfinityIcon size={18} />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${isLoopMode ? 'text-blue-900' : 'text-[#1d1d1f]'}`}>Modo Automático</h3>
                    <p className="text-xs text-gray-400">Evolución continua y Auto-Save</p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 transition-colors ${isLoopMode ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-gray-300'}`}></div>
              </div>

              {/* Botones Principales */}
              <div className="space-y-3">
                {!isPlaying && !isEvolving ? (
                  <button onClick={() => startEvolution(isLoopMode)} className="w-full py-4 bg-[#1d1d1f] hover:bg-black text-white rounded-2xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2">
                    <Play size={18} fill="currentColor" /> {generation === 0 ? 'INICIAR IA' : 'CONTINUAR'}
                  </button>
                ) : (
                  <button onClick={() => stopMusic(true)} className="w-full py-4 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-2xl font-bold transition-all flex items-center justify-center gap-2">
                    <Square size={18} fill="currentColor" /> DETENER
                  </button>
                )}
              </div>

              {/* Drop Zone */}
              <div className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-colors ${memoryRef.current.midiPatterns ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-gray-50/50'}`}>
                <div className={`p-3 rounded-full ${memoryRef.current.midiPatterns ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  <FileMusic size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">{memoryRef.current.midiPatterns ? "MIDI Cargado" : "Arrastra tu MIDI aquí"}</p>
                  <p className="text-xs text-gray-400 mt-1">{memoryRef.current.midiPatterns ? "La IA imitará este estilo" : "Para aprender patrones profesionales"}</p>
                </div>
              </div>

              <button onClick={exportUnity} disabled={!currentMelody.length} className="w-full py-3 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 hover:text-[#1d1d1f] transition-all text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Download size={14} /> EXPORTAR DATOS
              </button>
            </div>
          </div>

          {/* Visualizer Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="h-96 bg-[#121212] rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between ring-1 ring-white/10">

              {/* Info Overlay */}
              <div className="flex justify-between items-start z-10">
                <div className="space-y-1">
                  <div className="text-white/60 text-xs font-mono flex items-center gap-2">
                    <Activity size={14} /> ESTADO DEL NÚCLEO
                  </div>
                  <div className="text-white font-bold text-lg">{feedback}</div>
                </div>

                {isPlaying && (
                  <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white/90 text-xs font-mono flex items-center gap-2 border border-white/5">
                    <Clock size={14} /> {timeLeft}s restantes
                  </div>
                )}
              </div>

              {/* Barras Visuales Mejoradas */}
              <div className="flex items-end gap-1.5 h-48 w-full px-4">
                {currentMelody.length > 0 ? currentMelody.map((g, i) => {
                  const pitch = Tone.Frequency(g.note).toMidi();
                  let h = Math.max(10, (pitch - 40) * 2.5);
                  if (isNaN(h)) h = 10;

                  // Color dinámico basado en la velocidad (intensidad)
                  const opacity = 0.4 + (g.velocity * 0.6);

                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end group relative h-full">
                      {/* Tooltip Note Name */}
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white/0 group-hover:text-white/100 transition-all duration-300 font-mono bg-black/50 px-1 rounded">
                        {g.note}
                      </div>
                      {/* Bar */}
                      <div className="w-full rounded-t-md bg-gradient-to-t from-blue-900/80 to-blue-400/80 transition-all duration-500 ease-out"
                        style={{
                          height: `${Math.min(100, h)}%`,
                          opacity: opacity
                        }}>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white/20 text-sm font-mono animate-pulse">Esperando secuencia genética...</div>
                  </div>
                )}
              </div>
            </div>

            {/* Consola de Logs */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 h-48 overflow-y-auto font-mono text-[11px] text-gray-500 shadow-sm scrollbar-thin scrollbar-thumb-gray-200">
              {logs.map((l, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-blue-500/30 flex gap-2 py-0.5">
                  <span className="text-blue-500 font-bold">{'>'}</span>
                  <span className="opacity-90">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}