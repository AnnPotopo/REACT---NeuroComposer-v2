import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Download, Save, Trash2, Music4, Infinity as InfinityIcon, Clock, FolderOpen, FileMusic, Activity } from 'lucide-react';

// --- IMPORTACIONES DE MÓDULOS ---
import { MidiParser } from './utils/MidiParser';
// Importamos la Inteligencia Artificial real
import { NeuralCore } from './core/NeuralCore';

export default function App() {
  // --- STATE ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEvolving, setIsEvolving] = useState(false);
  const [isLoopMode, setIsLoopMode] = useState(false);
  const [generation, setGeneration] = useState(0);
  // 'temperature' reemplaza a fitness para mostrar creatividad
  const [temperature, setTemperature] = useState(1.1);
  const [currentMelody, setCurrentMelody] = useState([]);
  const [feedback, setFeedback] = useState("Inicializando IA...");
  const [logs, setLogs] = useState(["NeuroComposer v3.0 Neural"]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [metaData, setMetaData] = useState({
    bpm: 120,
    root: 'C4',
    fileName: null
  });

  // --- REFS ---
  const engineRef = useRef(null);
  // Referencia al Cerebro de Google Magenta
  const neuralRef = useRef(new NeuralCore());
  const seqRef = useRef(null);
  const abortRef = useRef(false);
  const loopTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // Memoria para guardar patrones MIDI cargados
  const memoryRef = useRef({
    midiPatterns: null,
    lastSeed: null
  });

  // --- INICIALIZACIÓN ---
  useEffect(() => {
    // Cargar el modelo neuronal al iniciar
    neuralRef.current.initialize().then(() => {
      setFeedback("IA Lista para Componer");
      addLog("🧠 Red Neuronal (MusicRNN) Cargada");
    }).catch(e => {
      setFeedback("Error de IA");
      addLog("❌ Error cargando Magenta: " + e.message);
    });
  }, []);

  // --- AUDIO ENGINE ---
  const initAudio = async () => {
    if (Tone.context.state !== 'running') { await Tone.start(); await Tone.context.resume(); }
    if (engineRef.current) return;

    const reverb = new Tone.Reverb({ decay: 5, preDelay: 0.2, wet: 0.4 }).toDestination();
    await reverb.generate();
    const delay = new Tone.FeedbackDelay("8n.", 0.25).connect(reverb);
    const comp = new Tone.Compressor({ threshold: -20, ratio: 4 }).connect(delay);

    // Synth Principal (Melodía Neuronal) - Sonido futurista
    const melSynth = new Tone.PolySynth(Tone.Synth, {
      volume: -4,
      oscillator: { type: "fatsawtooth", count: 3, spread: 20 },
      envelope: { attack: 0.04, decay: 0.2, sustain: 0.4, release: 1.5 }
    }).connect(comp);

    // Synth Secundario (Ambiente/Bajo)
    const bassSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -8,
      harmonicity: 2,
      modulationIndex: 2,
      oscillator: { type: "sine" },
      envelope: { attack: 0.2, decay: 0.5, sustain: 0.8, release: 3 }
    }).connect(comp);

    engineRef.current = { melodyPiano: melSynth, bassPiano: bassSynth };
    addLog("🔊 Motor de Audio Neural: ONLINE");
  };

  const addLog = (msg) => setLogs(p => [msg, ...p.slice(0, 4)]);

  // --- AUTO SAVE ---
  const autoSave = (notes) => {
    const saveData = {
      timestamp: Date.now(),
      generation,
      currentMelody: notes,
      meta: metaData
    };
    localStorage.setItem('neuroComposer_neural_save', JSON.stringify(saveData));
  };

  // --- CORE: GENERACIÓN NEURONAL ---
  const startGeneration = async (loop = false) => {
    if (isEvolving) return;
    try { await initAudio(); } catch (e) { }

    setIsEvolving(true);
    abortRef.current = false;
    setFeedback("La IA está soñando...");

    // Logica de Semilla (Seed)
    // Si tenemos una melodía previa o un MIDI cargado, usamos su final como semilla
    let seed = [];
    if (currentMelody.length > 0) {
      // Usar las últimas 8 notas para continuidad
      seed = currentMelody.slice(-8);
    } else if (memoryRef.current.midiPatterns) {
      // Usar inicio del MIDI cargado
      seed = memoryRef.current.midiPatterns.rawEvents.slice(0, 8).map(e => ({
        note: Tone.Frequency(e.note, "midi").toNote(),
        duration: "4n",
        velocity: e.velocity
      }));
    }

    addLog(`🤖 Generando Bloque ${generation + 1}...`);

    try {
      // LLAMADA A LA RED NEURONAL
      // Generamos 32 pasos (aprox 8 segundos) con temperatura variable para creatividad
      const creativeTemp = loop ? 1.1 + (Math.random() * 0.2) : 1.1;
      const newNotes = await neuralRef.current.generate(seed, 32, creativeTemp);

      if (!abortRef.current) {
        setCurrentMelody(newNotes);
        setGeneration(g => g + 1);
        setTemperature(creativeTemp); // Visualizar creatividad usada
        setFeedback("Reproduciendo Creación");

        // Guardar y Reproducir
        autoSave(newNotes);
        playSong(newNotes);

        // Loop Automático
        if (loop) {
          const durationMs = (newNotes.length * (60000 / (metaData.bpm * 4))) * 4;
          // Esperar a que termine + un pequeño respiro antes de generar el siguiente
          loopTimeoutRef.current = setTimeout(() => {
            if (!abortRef.current) startGeneration(true);
          }, durationMs + 500);
        }
      }
    } catch (error) {
      console.error(error);
      addLog("❌ Error Neuronal");
      setFeedback("Error en IA");
      setIsEvolving(false);
    }
  };

  // --- PLAYBACK ---
  const playSong = (notes) => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }

    const { melodyPiano, bassPiano } = engineRef.current;

    // Calcular tiempos para Tone.js
    let currentTime = Tone.now() + 0.1;
    const stepTime = (60 / metaData.bpm) / 4; // Semicorcheas (16th notes) si quantization es 4

    // Crear eventos de Tone
    const toneEvents = notes.map((n, i) => {
      // Si viene de Magenta, usa 'startStep'. Si no, usamos índice secuencial.
      const startTime = n.startStep !== undefined
        ? currentTime + (n.startStep * stepTime)
        : currentTime + (i * stepTime * 4); // Fallback a negras

      return {
        time: startTime,
        note: n.note,
        duration: n.duration || "8n",
        velocity: n.velocity,
        type: 'mel'
      };
    });

    // Calcular duración total para visualizador
    if (toneEvents.length > 0) {
      const lastEvent = toneEvents[toneEvents.length - 1];
      const totalDur = (lastEvent.time - currentTime) + Tone.Time(lastEvent.duration).toSeconds();
      setTimeLeft(Math.ceil(totalDur));
    }

    // Programar fin
    const finalTime = toneEvents.length > 0 ? toneEvents[toneEvents.length - 1].time + 2 : currentTime + 2;
    Tone.Transport.scheduleOnce(() => {
      if (!isLoopMode) {
        setIsPlaying(false);
        setIsEvolving(false);
        setFeedback("IA en Espera");
      }
    }, finalTime);

    // Parte de Tone
    const part = new Tone.Part((time, e) => {
      Tone.Draw.schedule(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, time);

      // Tocar nota
      melodyPiano.triggerAttackRelease(e.note, e.duration, time, e.velocity);

      // Generar un "eco" armónico en el bajo automáticamente (Deep Learning Style)
      if (Math.random() > 0.6) {
        const bassNote = Tone.Frequency(e.note).transpose(-24).toNote();
        bassPiano.triggerAttackRelease(bassNote, "1n", time, e.velocity * 0.5);
      }

    }, toneEvents).start(0);

    Tone.Transport.bpm.value = metaData.bpm;
    Tone.Transport.start();
    setIsPlaying(true);
    seqRef.current = part;
  };

  const stopMusic = (full = true) => {
    if (full) {
      abortRef.current = true;
      setIsLoopMode(false);
      clearTimeout(loopTimeoutRef.current);
    }
    Tone.Transport.stop();
    Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }

    if (engineRef.current) {
      engineRef.current.melodyPiano.releaseAll();
      engineRef.current.bassPiano.releaseAll();
    }
    setIsPlaying(false);
    if (full) {
      setIsEvolving(false);
      setFeedback("Detenido");
    }
  };

  // --- MANEJO DE ARCHIVOS ---
  const handleFile = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        if (file.name.endsWith('.mid')) {
          const p = new MidiParser(e.target.result);
          const d = p.parse();

          if (d.rawEvents.length > 0) {
            memoryRef.current.midiPatterns = d;

            // Previsualizar inicio del MIDI
            const preview = d.rawEvents.slice(0, 16).map(ev => ({
              note: Tone.Frequency(ev.note, "midi").toNote(),
              duration: "4n",
              velocity: ev.velocity
            }));
            setCurrentMelody(preview);

            setMetaData(prev => ({ ...prev, fileName: file.name }));
            addLog("🎹 MIDI asimilado como Semilla");
            setFeedback("Estilo Capturado");
          }
        } else if (file.name.endsWith('.json')) {
          const j = JSON.parse(e.target.result);
          setCurrentMelody(j.currentMelody || []);
          setGeneration(j.generation || 0);
          addLog(`📂 Sesión cargada (Gen ${j.generation})`);
        }
      } catch (err) {
        console.error(err);
        addLog("❌ Archivo inválido");
      }
    };

    if (file.name.endsWith('.mid')) r.readAsArrayBuffer(file);
    else r.readAsText(file);
  };

  const saveToFile = () => {
    const d = {
      type: "NEURO_COMPOSER_NEURAL",
      timestamp: Date.now(),
      generation,
      currentMelody,
      meta: metaData
    };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `Neural_Gen${generation}.json`; a.click();
  };

  const exportUnity = () => {
    if (!currentMelody.length) return;
    const d = {
      meta: { bpm: metaData.bpm, source: "NeuralNetwork" },
      melody: currentMelody.map(n => ({ n: n.note, d: n.duration, v: n.velocity }))
    };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `Unity_Neural_Track.json`; a.click();
  };

  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };

  // --- RENDER UI ---
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] p-8 flex justify-center"
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
      onDrop={onDrop}>

      <div className={`w-full max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden transition-all duration-300 ${isDragging ? 'scale-[1.02] ring-4 ring-purple-200' : ''}`}>

        {/* Header */}
        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#1d1d1f] to-purple-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Music4 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">NeuroComposer <span className="text-xs px-2 py-1 bg-purple-100 text-purple-600 rounded-full ml-2">DEEP LEARNING</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-purple-300'}`}></div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {isPlaying ? 'GENERANDO AUDIO' : 'RED NEURONAL LISTA'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Indicador de Creatividad (Temp) */}
            <div className="bg-purple-50 px-4 py-2 rounded-xl flex flex-col items-center border border-purple-100" title="Creatividad de la IA">
              <span className="text-[9px] font-bold text-purple-400 uppercase">Temp</span>
              <span className="text-sm font-black text-purple-900">{temperature.toFixed(2)}</span>
            </div>

            <div className="bg-gray-50 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px] border border-gray-100">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Gen</span>
              <span className="text-2xl font-black text-[#1d1d1f]">{generation}</span>
            </div>

            <div className="flex gap-2">
              <button onClick={saveToFile} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Guardar JSON"><Save size={20} /></button>
              <button onClick={() => fileInputRef.current.click()} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Cargar Semilla"><FolderOpen size={20} /></button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".mid,.json" onChange={e => handleFile(e.target.files[0])} />
              <button onClick={() => window.location.reload()} className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors" title="Reiniciar IA"><Trash2 size={20} /></button>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Sidebar de Control */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">

              {/* Switch Modo Infinito */}
              <div onClick={() => { setIsLoopMode(!isLoopMode); addLog(`Modo Continuo: ${!isLoopMode ? 'ON' : 'OFF'}`) }}
                className={`group cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between select-none ${isLoopMode ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-colors ${isLoopMode ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <InfinityIcon size={18} />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${isLoopMode ? 'text-purple-900' : 'text-[#1d1d1f]'}`}>Composición Infinita</h3>
                    <p className="text-xs text-gray-400">La IA continuará sus ideas</p>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 transition-colors ${isLoopMode ? 'bg-purple-500 border-purple-500' : 'bg-transparent border-gray-300'}`}></div>
              </div>

              {/* Botones Principales */}
              <div className="space-y-3">
                {!isPlaying && !isEvolving ? (
                  <button onClick={() => startGeneration(isLoopMode)} className="w-full py-4 bg-[#1d1d1f] hover:bg-black text-white rounded-2xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2">
                    <Play size={18} fill="currentColor" /> {generation === 0 ? 'INICIAR IA' : 'CONTINUAR IDEA'}
                  </button>
                ) : (
                  <button onClick={() => stopMusic(true)} className="w-full py-4 bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-2xl font-bold transition-all flex items-center justify-center gap-2">
                    <Square size={18} fill="currentColor" /> DETENER
                  </button>
                )}
              </div>

              {/* Drop Zone */}
              <div className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 transition-colors ${memoryRef.current.midiPatterns ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-gray-50/50'}`}>
                <div className={`p-3 rounded-full ${memoryRef.current.midiPatterns ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                  <FileMusic size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">{memoryRef.current.midiPatterns ? "Semilla MIDI Cargada" : "Arrastra MIDI aquí"}</p>
                  <p className="text-xs text-gray-400 mt-1">{memoryRef.current.midiPatterns ? "La IA continuará este estilo" : "Para inspirar a la Red Neuronal"}</p>
                </div>
              </div>

              <button onClick={exportUnity} disabled={!currentMelody.length} className="w-full py-3 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 hover:text-[#1d1d1f] transition-all text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Download size={14} /> EXPORTAR A UNITY
              </button>
            </div>
          </div>

          {/* Visualizer Area */}
          <div className="lg:col-span-8 space-y-6">
            <div className="h-96 bg-[#0a0a0a] rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between ring-1 ring-white/10">

              {/* Info Overlay */}
              <div className="flex justify-between items-start z-10">
                <div className="space-y-1">
                  <div className="text-white/60 text-xs font-mono flex items-center gap-2">
                    <Activity size={14} /> CEREBRO DIGITAL
                  </div>
                  <div className="text-white font-bold text-lg animate-pulse">{feedback}</div>
                </div>

                {isPlaying && (
                  <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white/90 text-xs font-mono flex items-center gap-2 border border-white/5">
                    <Clock size={14} /> {timeLeft}s restantes
                  </div>
                )}
              </div>

              {/* Barras Visuales Neurales */}
              <div className="flex items-end gap-1.5 h-48 w-full px-4">
                {currentMelody.length > 0 ? currentMelody.map((n, i) => {
                  const pitch = Tone.Frequency(n.note).toMidi();
                  let h = Math.max(10, (pitch - 45) * 3);
                  if (isNaN(h)) h = 10;
                  const opacity = 0.5 + (n.velocity * 0.5);

                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end group relative h-full">
                      <div className="w-full rounded-t-sm bg-gradient-to-t from-purple-900/80 to-cyan-400/80 transition-all duration-500 ease-out"
                        style={{
                          height: `${Math.min(100, h)}%`,
                          opacity: opacity
                        }}>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white/20 text-sm font-mono animate-pulse">Esperando input neuronal...</div>
                  </div>
                )}
              </div>
            </div>

            {/* Consola de Logs */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 h-48 overflow-y-auto font-mono text-[11px] text-gray-500 shadow-sm scrollbar-thin scrollbar-thumb-gray-200">
              {logs.map((l, i) => (
                <div key={i} className="mb-2 pl-3 border-l-2 border-purple-500/30 flex gap-2 py-0.5">
                  <span className="text-purple-500 font-bold">{'>'}</span>
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