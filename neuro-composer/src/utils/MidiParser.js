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