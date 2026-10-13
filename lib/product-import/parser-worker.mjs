// Fixed local worker: never receives credentials, URLs or executable input.
import { parentPort, workerData } from 'node:worker_threads';
import { inflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import * as codepages from 'xlsx/dist/cpexcel';
const MAX_EXPANDED = 16 * 1024 * 1024, MAX_ENTRY = 8 * 1024 * 1024;
function invalid() { throw new Error('El archivo está corrupto o su contenido no coincide con el formato.'); }
function budget() { throw new Error('El Excel supera los límites de descompresión o dimensiones. Dividilo en archivos más pequeños.'); }
function inspectZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) invalid();
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  if (count !== bytes.readUInt16LE(end + 8) || offset + size !== end) invalid();
  if (!count || count > 256) budget();
  let cursor = offset, total = 0; const names = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42), next = cursor + 46 + nameLength + extra + comment;
    if (next > end || !nameLength || flags & 1 || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34)) invalid();
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name.includes('..') || name.includes('\\') || name.startsWith('/') || names.has(name)) invalid();
    names.add(name);
    if (expanded > MAX_ENTRY || total + expanded > MAX_EXPANDED) budget();
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) invalid();
    const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const start = local + 30 + localNameLength + localExtra;
    if (start + compressed > offset || bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name) invalid();
    const part = bytes.subarray(start, start + compressed);
    const unpacked = method === 8 ? inflateRawSync(part, { maxOutputLength: Math.min(MAX_ENTRY, MAX_EXPANDED - total) }) : part;
    if (unpacked.length !== expanded) invalid();
    total += unpacked.length; cursor = next;
  }
  if (cursor !== end || !names.has('[Content_Types].xml')) invalid();
}
try {
  const bytes = Buffer.from(workerData.bytes), ext = workerData.extension;
  const zip = bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  const ole = bytes.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';
  if (ext === 'xlsx') { if (!zip) invalid(); inspectZip(bytes); }
  if (ext === 'csv' && (zip || ole)) invalid();
  if (ext === 'xls' && !ole && ![0x0009, 0x0209, 0x0409, 0x0809].includes(bytes.length >= 2 ? bytes.readUInt16LE(0) : 0)) invalid();
  XLSX.set_cptable(codepages);
  let input = bytes;
  if (ext === 'csv') {
    const bom = bytes.length >= 2 ? bytes.readUInt16LE(0) : 0;
    if (bom === 0xfeff || bom === 0xfffe) input = new TextDecoder(bom === 0xfeff ? 'utf-16le' : 'utf-16be').decode(bytes);
    else { try { input = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { input = new TextDecoder('windows-1252').decode(bytes); } }
  }
  const book = XLSX.read(input, { type: typeof input === 'string' ? 'string' : 'buffer', cellDates: false, raw: true, cellNF: true });
  // CSV has a single implicit sheet; the administrator's selected schema applies.
  const sheetName = ext === 'csv' ? book.SheetNames[0] : workerData.sheetName;
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error('El archivo no contiene la hoja seleccionada.');
  if (book.SheetNames.length > 32) budget();
  for (const current of Object.values(book.Sheets)) {
    if (current['!ref']) {
      const range = XLSX.utils.decode_range(current['!ref']);
      if (range.e.r >= 2001 || range.e.c >= 64 || (range.e.r + 1) * (range.e.c + 1) > 100000) budget();
    }
  }
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) sheet[address] = { ...cell, z: undefined };
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (rows.length > 2000 || Buffer.byteLength(JSON.stringify(rows), 'utf8') > 1024 * 1024) budget();
  parentPort.postMessage({ rows });
} catch (error) {
  const message = error instanceof Error && /^El (archivo|Excel)|^El archivo no contiene/.test(error.message) ? error.message : 'El archivo está corrupto o supera los recursos permitidos.';
  parentPort.postMessage({ error: message });
}
