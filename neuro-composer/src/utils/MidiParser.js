import * as Tone from 'tone';

export class MidiParser {
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
        } else if (cmd >= 0x80 && cmd <= 0xE0) { this.readUInt8(); if (cmd !== 0xC0 && cmd !== 0xD0) this.readUInt8(); }
        else if (status === 0xFF) { this.readUInt8(); this.offset += this.readVarInt(); }
      }
    }
    events.sort((a, b) => a.time - b.time);

    // --- ANÁLISIS PROFESIONAL (Markov & Stats) ---
    const stats = {
      uniqueNotes: [...new Set(events.map(e => e.note))],
      transitions: {}, // Mapa de probabilidad: Nota A -> [Posibles Notas B]
      intervals: {},   // Mapa de saltos comunes
      totalDuration: events.length > 0 ? events[events.length - 1].time : 0,
      averageVelocity: events.reduce((acc, e) => acc + e.velocity, 0) / events.length || 0.5
    };

    // Construir Cadena de Markov
    for (let i = 0; i < events.length - 1; i++) {
      const curr = events[i].note;
      const next = events[i + 1].note;

      // Registrar transición
      if (!stats.transitions[curr]) stats.transitions[curr] = [];
      stats.transitions[curr].push(next);

      // Registrar intervalo (salto)
      const interval = next - curr;
      if (!stats.intervals[interval]) stats.intervals[interval] = 0;
      stats.intervals[interval]++;
    }

    return { rawEvents: events, stats };
  }
}