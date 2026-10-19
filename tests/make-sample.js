// Arayüzde denemek için sentetik kirli bir Excel dosyası üretir: node tests/make-sample.js
import * as fs from 'fs';
import * as XLSX from 'xlsx/xlsx.mjs';
import { makeDataset } from './generate.js';

XLSX.set_fs(fs);
const { headers, rows } = makeDataset(2024, { persons: 35, level: 2, twins: 0.3 });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Kayitlar');
XLSX.writeFile(wb, new URL('./data/Sentetik_Agir_Kirli.xlsx', import.meta.url).pathname);
console.log(`${rows.length} satır yazıldı`);
