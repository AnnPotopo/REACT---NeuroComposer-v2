import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Download, RefreshCw, Cpu, Activity, Zap, Upload, FileJson, BarChart3, Save, Trash2, FileUp, Music4, Infinity as InfinityIcon, Clock, FolderOpen, FileMusic } from 'lucide-react';

// --- UTILS: MIDI PARSER ---
class MidiParser {
  constructor(arrayBuffer) {
    this.data = new DataView(arrayBuffer);
    this.offset = 0;
  }
  readString(len) { let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(this.data.getUint8(this.offset++)); return s; }
  readUInt32() { const v = this.data.getUint32(this.offset); this.offset += 4; return v; }
  readUInt16() { const v = this.data.getUint16(this.offset); this.offset += 2; return v; }
  readUInt8() { return this.data.getUint8(this.offset++); }
  readVarInt() { let r = 0, b; do { b = this.readUInt8(); r = (r << 7) | (b & 0x7f); } while (b & 0x80); return r; }
  parse() {
    if (this.readString(4) !== 'MThd') throw new Error("Invalid MIDI");
    this.readUInt32(); this.readUInt16();
    const numTracks = this.readUInt16(); this.readUInt16();
    let events = [];
    for (let t = 0; t < numTracks; t++) {
      if (this.readString(4) !== 'MTrk') break;
      const len = this.readUInt32(), end = this.offset + len;
      let time = 0, status = 0;
      while (this.offset < end) {
        time += this.readVarInt();
        let b = this.data.getUint8(this.offset);
        if (b < 0x80) this.offset--; else { this.offset++; status = b; }
        const cmd = status & 0xf0;
        if (cmd === 0x90) {
          const n = this.readUInt8(), v = this.readUInt8();
          if (v > 0) events.push({ note: n, velocity: v / 127, time });
        } else if (cmd === 0x80 || cmd === 0xA0 || cmd === 0xB0 || cmd === 0xE0) { this.readUInt8(); this.readUInt8(); }
        else if (cmd === 0xC0 || cmd === 0xD0) this.readUInt8();
        else if (status === 0xFF) { this.readUInt8(); this.offset += this.readVarInt(); }
      }
    }
    events.sort((a, b) => a.time - b.time);
    const unique = [...new Set(events.map(e => e.note))];
    return { rawEvents: events.slice(0, 64), stats: { uniqueNotes: unique } };
  }
}

// --- UTILS: Pink Noise ---
class PinkNoise {
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

// --- CORE: Theory ---
const THEORY = {
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

// --- AI ENGINE ---
class CompositionDNA {
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

export default function App() {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEvolving, setIsEvolving] = useState(false);
  const [isLoopMode, setIsLoopMode] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [bestFitness, setBestFitness] = useState(0);
  const [currentMelody, setCurrentMelody] = useState([]);
  const [feedback, setFeedback] = useState("Sistema Listo");
  const [logs, setLogs] = useState(["NeuroComposer v14 UI Fix"]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [metaData, setMetaData] = useState({ bpm: 60, scale: 'lydian', root: 'F3', structure: ["Intro", "Theme", "Theme", "Outro"], fileName: null });

  // Refs
  const engineRef = useRef(null);
  const pinkNoiseRef = useRef(new PinkNoise());
  const seqRef = useRef(null);
  const abortRef = useRef(false);
  const loopTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const memoryRef = useRef({ bestGenomes: [], midiPatterns: null, totalGenerations: 0 });

  // --- AUDIO INIT ---
  const initAudio = async () => {
    if (Tone.context.state !== 'running') { await Tone.start(); await Tone.context.resume(); }
    if (engineRef.current) return;

    const reverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.1, wet: 0.3 }).toDestination();
    await reverb.generate();
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3 }).connect(reverb);

    const melSynth = new Tone.PolySynth(Tone.FMSynth, {
      volume: -5, polyphony: 12, voice: Tone.FMSynth, oscillator: { type: "sine" }, harmonicity: 3, modulationIndex: 2,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 2 }
    }).connect(comp);

    const bassSynth = new Tone.PolySynth(Tone.AMSynth, {
      volume: -3, polyphony: 6, oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.4, release: 3 }
    }).connect(comp);

    engineRef.current = { melodyPiano: melSynth, bassPiano: bassSynth };
    addLog("Motor de Audio: ONLINE");
  };

  const addLog = (msg) => setLogs(p => [msg, ...p.slice(0, 3)]);

  // --- EVOLUTION ---
  const calculateFitness = (dna) => {
    let score = 0, reasons = [];
    dna.melodyGenes.forEach((g, i) => {
      if (i > 0) {
        const prev = Tone.Frequency(dna.melodyGenes[i - 1].note).toMidi();
        const curr = Tone.Frequency(g.note).toMidi();
        const diff = Math.abs(curr - prev);
        if ([3, 4, 7].includes(diff)) score += 12;
        if (diff === 0) score -= 2;
        if (diff > 12) score -= 10;
      }
    });
    if (memoryRef.current.midiPatterns) {
      const targets = memoryRef.current.midiPatterns.stats.uniqueNotes;
      let hits = 0;
      dna.melodyGenes.forEach(g => { if (targets.includes(Tone.Frequency(g.note).toMidi())) hits++; });
      score += (hits * 5);
    }
    dna.feedback = score > 200 ? "Maestro" : score > 100 ? "Inspirado" : "Aprendiendo";
    return Math.max(0, score);
  };

  const startEvolution = async (loop = false) => {
    if (isEvolving) return;
    try { await initAudio(); } catch (e) { }

    stopMusic(false); setIsEvolving(true); abortRef.current = false;
    addLog(loop ? `Ciclo Evolutivo (Gen ${generation})` : "Iniciando...");

    const mNotes = THEORY.getMelodyNotes(metaData.root, metaData.scale);
    const bNotes = THEORY.getBassNotes(metaData.root, metaData.scale);

    let pop;
    if (memoryRef.current.bestGenomes.length > 0) {
      pop = Array(30).fill().map(() => {
        const p = memoryRef.current.bestGenomes[Math.floor(Math.random() * memoryRef.current.bestGenomes.length)];
        const c = new CompositionDNA(p.melodyGenes.length, mNotes, bNotes);
        c.melodyGenes = JSON.parse(JSON.stringify(p.melodyGenes));
        c.harmonyGenes = JSON.parse(JSON.stringify(p.harmonyGenes));
        c.mutate(0.2, mNotes, bNotes, pinkNoiseRef.current);
        return c;
      });
    } else {
      pop = Array(30).fill().map(() => new CompositionDNA(16, mNotes, bNotes));
    }

    const gens = loop ? 8 : 20;
    for (let g = 0; g < gens; g++) {
      if (abortRef.current) break;
      pop.forEach(d => d.fitness = calculateFitness(d));
      pop.sort((a, b) => b.fitness - a.fitness);
      const best = pop[0];

      memoryRef.current.totalGenerations++;
      setGeneration(memoryRef.current.totalGenerations);
      setBestFitness(Math.floor(best.fitness));
      setFeedback(best.feedback);
      setCurrentMelody([...best.melodyGenes]);

      await new Promise(r => setTimeout(r, 20));

      let nextPop = [best];
      for (let i = 1; i < 30; i++) {
        const p1 = pop[Math.floor(Math.random() * 15)];
        const p2 = pop[Math.floor(Math.random() * 15)];
        const c = p1.crossover(p2);
        c.mutate(0.15, mNotes, bNotes, pinkNoiseRef.current);
        nextPop.push(c);
      }
      pop = nextPop;
    }

    if (!abortRef.current && pop[0]) {
      if (memoryRef.current.bestGenomes.length < 5 || pop[0].fitness > memoryRef.current.bestGenomes[0].fitness) {
        memoryRef.current.bestGenomes.push(pop[0]);
        memoryRef.current.bestGenomes.sort((a, b) => b.fitness - a.fitness);
        memoryRef.current.bestGenomes = memoryRef.current.bestGenomes.slice(0, 5);
      }
      playSong(pop[0]);
    }
    setIsEvolving(false);
  };

  // --- PLAYBACK ---
  const playSong = (dna) => {
    Tone.Transport.stop(); Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }

    const { melodyPiano, bassPiano } = engineRef.current;
    let evs = [], t = Tone.now() + 0.2, dur = 60 / metaData.bpm;

    metaData.structure.forEach(s => {
      const inten = s.includes("Intro") ? 0.7 : 1;
      dna.melodyGenes.forEach((g, i) => {
        const time = t + (i * dur) + (pinkNoiseRef.current.getNext() * 0.04);
        evs.push({ time, note: g.note, duration: g.duration, velocity: g.velocity * inten, type: 'mel', section: s });
        const bg = dna.harmonyGenes[i];
        if (bg) {
          if (bg.type === 'chord') {
            evs.push({ time, note: bg.note, duration: "1n", velocity: bg.velocity * inten, type: 'bass' });
            evs.push({ time: time + 0.05, note: Tone.Frequency(bg.note).transpose(7).toNote(), duration: "1n", velocity: bg.velocity * 0.8 * inten, type: 'bass' });
          } else {
            evs.push({ time, note: bg.note, duration: "2n", velocity: bg.velocity * inten, type: 'bass' });
          }
        }
      });
      t += (dna.melodyGenes.length * dur) + 1;
    });

    setTimeLeft(Math.round(t - Tone.now()));
    Tone.Transport.scheduleOnce(() => handleEnd(), t + 2);

    const part = new Tone.Part((time, e) => {
      Tone.Draw.schedule(() => {
        setFeedback(`Tocando: ${e.section || ''}`);
        setTimeLeft(p => Math.max(0, p - 1));
      }, time);
      if (e.type === 'mel') melodyPiano.triggerAttackRelease(e.note, e.duration, time, e.velocity);
      else bassPiano.triggerAttackRelease(e.note, e.duration, time, e.velocity);
    }, evs).start(0);

    Tone.Transport.bpm.value = metaData.bpm;
    Tone.Transport.start();
    setIsPlaying(true);
    seqRef.current = part;
    addLog("Reproduciendo...");
  };

  const handleEnd = () => {
    setIsPlaying(false);
    if (isLoopMode && !abortRef.current) {
      addLog("Reiniciando ciclo...");
      loopTimeoutRef.current = setTimeout(() => startEvolution(true), 1500);
    } else {
      setFeedback("En Espera");
    }
  };

  const stopMusic = (full = true) => {
    if (full) { abortRef.current = true; setIsLoopMode(false); }
    clearTimeout(loopTimeoutRef.current);
    Tone.Transport.stop(); Tone.Transport.cancel();
    if (seqRef.current) { seqRef.current.dispose(); seqRef.current = null; }
    if (engineRef.current && full) {
      engineRef.current.melodyPiano.releaseAll();
      engineRef.current.bassPiano.releaseAll();
    }
    setIsPlaying(false); setIsEvolving(false); setFeedback(full ? "Detenido" : "Pensando...");
  };

  // --- FILES ---
  const handleFile = (file) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        if (file.name.endsWith('.mid')) {
          const p = new MidiParser(e.target.result);
          const d = p.parse();
          if (d.rawEvents.length > 0) {
            memoryRef.current.midiPatterns = d;
            const newMel = d.rawEvents.slice(0, 16).map(ev => ({ note: Tone.Frequency(ev.note, "midi").toNote(), duration: "4n", velocity: ev.velocity / 127 }));
            setCurrentMelody(newMel);
            setMetaData(p => ({ ...p, fileName: file.name, bpm: 120 }));
            addLog("MIDI Aprendido");
          }
        } else {
          const j = JSON.parse(e.target.result);
          if (j.type === "NEURO_COMPOSER_SAVE") {
            setGeneration(j.generation); setBestFitness(j.bestFitness); setCurrentMelody(j.currentMelody);
            memoryRef.current = j.memoryDump;
            addLog(`Cerebro Cargado (Gen ${j.generation})`);
          }
        }
      } catch (e) { addLog("Error de archivo"); }
    };
    if (file.name.endsWith('.mid')) r.readAsArrayBuffer(file); else r.readAsText(file);
  };

  const saveProgress = () => {
    const d = { type: "NEURO_COMPOSER_SAVE", timestamp: Date.now(), generation, bestFitness, metaData, currentMelody, memoryDump: memoryRef.current };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `NeuroGen_${generation}.json`; a.click();
  };

  const exportUnity = () => {
    if (!currentMelody.length) return;
    const d = { meta: { bpm: metaData.bpm, structure: metaData.structure }, melody: currentMelody.map(n => ({ note: n.note, duration: n.duration, velocity: n.velocity })) };
    const b = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = `Unity_Song_${Date.now()}.json`; a.click();
  };

  const onDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };

  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] p-8 flex justify-center" onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={e => { e.preventDefault(); setIsDragging(false) }} onDrop={onDrop}>
      <div className={`w-full max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden transition-all duration-300 ${isDragging ? 'scale-[1.02] ring-4 ring-blue-200' : ''}`}>

        {/* Header */}
        <div className="p-8 border-b border-gray-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#1d1d1f] rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Music4 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">NeuroComposer <span className="text-sm font-medium text-gray-400 ml-2">v14 UI</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{isPlaying ? 'REPRODUCIENDO' : 'EN ESPERA'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-gray-50 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[100px]">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Gen</span>
              <span className="text-2xl font-black text-[#1d1d1f]">{generation}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={saveProgress} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Guardar"><Save size={20} /></button>
              <button onClick={() => fileInputRef.current.click()} className="p-3 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors" title="Abrir"><FolderOpen size={20} /></button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={e => handleFile(e.target.files[0])} />
              <button onClick={() => window.location.reload()} className="p-3 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors" title="Reset"><Trash2 size={20} /></button>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">

              {/* Loop Mode */}
              <div onClick={() => { setIsLoopMode(!isLoopMode); addLog(`Loop: ${!isLoopMode}`) }}
                className={`group cursor-pointer p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${isLoopMode ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${isLoopMode ? 'bg-[#1d1d1f] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <InfinityIcon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1d1d1f]">Modo Infinito</h3>
                    <p className="text-xs text-gray-400">Aprendizaje continuo</p>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full transition-colors ${isLoopMode ? 'bg-green-500' : 'bg-gray-200'}`}></div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {!isPlaying && !isEvolving ? (
                  <button onClick={() => startEvolution(isLoopMode)} className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-2xl font-bold shadow-lg shadow-red-200 transition-all transform active:scale-95 flex items-center justify-center gap-2">
                    {generation === 0 ? 'INICIAR' : 'CONTINUAR'}
                  </button>
                ) : (
                  <button onClick={() => stopMusic(true)} className="w-full py-4 bg-white border-2 border-[#ef4444] text-[#ef4444] hover:bg-red-50 rounded-2xl font-bold transition-all flex items-center justify-center gap-2">
                    <Square size={18} fill="currentColor" /> DETENER
                  </button>
                )}
              </div>

              {/* Drop Zone Visual */}
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2 bg-gray-50/50">
                <FileMusic className="text-gray-300" size={32} />
                <p className="text-xs font-medium text-gray-400">Arrastra MIDI (.mid) aquí para<br />aprender patrones</p>
              </div>

              <button onClick={exportUnity} disabled={!currentMelody.length} className="w-full py-3 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 hover:text-[#1d1d1f] transition-all text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Download size={14} /> EXPORTAR A UNITY
              </button>
            </div>
          </div>

          {/* Visualizer Area */}
          <div className="lg:col-span-8 space-y-6">
            {/* Main Screen */}
            <div className="h-80 bg-[#121212] rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between">
              <div className="flex justify-between items-start z-10">
                <div className="text-white/40 text-xs font-mono flex items-center gap-2">
                  <Activity size={14} /> Visualizador Genómico
                </div>
                {isPlaying && (
                  <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-white/90 text-xs font-mono flex items-center gap-2">
                    <Clock size={12} /> ~{timeLeft}s
                  </div>
                )}
              </div>

              {/* Bars - Fixed NaN issue with safe height */}
              <div className="flex items-end gap-1 h-40 w-full">
                {currentMelody.length > 0 ? currentMelody.map((g, i) => {
                  // Calculate height safely to avoid NaN/Black screen
                  let h = Math.max(10, (Tone.Frequency(g.note).toMidi() - 30) * 3);
                  if (isNaN(h)) h = 10; // Fallback
                  return (
                    <div key={i} className="flex-1 bg-white/10 rounded-t-sm relative group overflow-hidden">
                      <div className="absolute bottom-0 w-full bg-white transition-all duration-300"
                        style={{ height: `${Math.min(100, h)}%`, opacity: 0.3 + g.velocity }}>
                      </div>
                    </div>
                  );
                }) : <div className="w-full text-center text-white/20 text-sm font-mono self-center">Esperando datos...</div>}
              </div>
            </div>

            {/* Logs Console */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 h-40 overflow-y-auto font-mono text-xs text-gray-500 shadow-sm scrollbar-thin">
              {logs.map((l, i) => (
                <div key={i} className="mb-1.5 pl-2 border-l-2 border-blue-500/30 flex gap-2">
                  <span className="text-blue-500">{'>'}</span>
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}