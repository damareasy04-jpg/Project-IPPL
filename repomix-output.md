This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
````
admin-import.test.js
admin-workflows.test.js
Admin.js
core.js
core.test.js
index.html
README.md
settings.json
style.css
user.js
````

# Files

## File: admin-import.test.js
````javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adminSource = fs.readFileSync(path.join(__dirname, 'Admin.js'), 'utf8');
const start = adminSource.indexOf('function parseCsvRecords(');
const end = adminSource.indexOf('function showImportReport(', start);
const importHelpers = adminSource.slice(start, end);
const calendarStart = adminSource.indexOf('function isAdminWorkday(');
const calendarEnd = adminSource.indexOf('function lateWorkDays(', calendarStart);
const calendarHelpers = adminSource.slice(calendarStart, calendarEnd);

function createContext() {
    const context = vm.createContext({});
    vm.runInContext(importHelpers, context, { filename: 'Admin/Admin.js import helpers' });
    return context;
}

function evaluate(context, expression) {
    return vm.runInContext(expression, context);
}

function toLocal(value) {
    return JSON.parse(JSON.stringify(value));
}

test('Admin booking overlap and duration count only non-holiday weekdays', () => {
    const context = vm.createContext({});
    vm.runInContext(`
        const db = { policy: { libur: '2026-10-23 Libur Kampus' } };
        const holidayDates = () => (db.policy.libur || '').split('\\n').map(line => line.trim().slice(0, 10));
        const localISODate = date => \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(date.getDate()).padStart(2, '0')}\`;
        const addCalendarDays = (date, days) => {
            const result = new Date(date);
            result.setDate(result.getDate() + days);
            return localISODate(result);
        };
    `, context);
    vm.runInContext(calendarHelpers, context, { filename: 'Admin/Admin.js booking helpers' });

    assert.equal(evaluate(context, `bookingDateRangesOverlap(
        { tglMulai: '2026-10-24', tglSelesai: '2026-10-24' },
        { tglMulai: '2026-10-24', tglSelesai: '2026-10-24' }
    )`), false);
    assert.equal(evaluate(context, `bookingDateRangesOverlap(
        { tglMulai: '2026-10-23', tglSelesai: '2026-10-23' },
        { tglMulai: '2026-10-23', tglSelesai: '2026-10-23' }
    )`), false);
    assert.equal(evaluate(context, `bookingDateRangesOverlap(
        { tglMulai: '2026-10-26', tglSelesai: '2026-10-26' },
        { tglMulai: '2026-10-26', tglSelesai: '2026-10-26' }
    )`), true);
    assert.equal(evaluate(context, `adminWorkingDays('2026-10-23', '2026-10-26')`), 1);
});

test('CSV headers recognize exported NIM/NIP and case-insensitive aliases', () => {
    const context = createContext();
    const keys = evaluate(context, `['NIM/NIP', 'Nama', 'Email', 'Peran', 'Program Studi', 'STATUS'].map(csvHeaderKey)`);

    assert.deepEqual(toLocal(keys), ['nim', 'name', 'email', 'role', 'prodi', 'status']);
});

test('CSV parser preserves commas and escaped quotes inside quoted fields', () => {
    const context = createContext();
    const rows = evaluate(context, `parseCsvRecords('NIM/NIP,Nama,Email\\r\\n12345678,"Nama, ""Lab""",user@example.com\\r\\n')`);

    assert.deepEqual(toLocal(rows), [
        ['NIM/NIP', 'Nama', 'Email'],
        ['12345678', 'Nama, "Lab"', 'user@example.com']
    ]);
});

test('CSV parser rejects unmatched quotes and quote characters in unquoted fields', () => {
    const context = createContext();

    assert.throws(() => evaluate(context, `parseCsvRecords('nim,nama\\n12345678,"Nama')`), /Tanda kutip CSV tidak berpasangan/);
    assert.throws(() => evaluate(context, `parseCsvRecords('nim,nama\\n12345678,Na"ma')`), /posisi yang salah/);
});

test('CSV account validation rejects duplicate identifiers, malformed email, and unknown roles', () => {
    const context = createContext();
    const valid = { nim: '12345678', name: 'Mahasiswa Uji', email: 'uji@example.com', role: 'Mahasiswa', status: 'Aktif' };
    const duplicateNims = new Set([valid.nim]);
    const duplicateEmails = new Set([valid.email]);
    const roles = ['Mahasiswa', 'Dosen', 'Laboran', 'Admin', 'Pimpinan / Auditor'];
    const statuses = ['Menunggu Verifikasi', 'Aktif', 'Nonaktif', 'Dibekukan', 'Blacklist'];
    context.valid = valid;
    context.duplicateNims = duplicateNims;
    context.duplicateEmails = duplicateEmails;
    context.roles = roles;
    context.statuses = statuses;

    const errors = evaluate(context, `validateImportedUser(
        { ...valid, email: 'bukan-email', role: 'Peran Tidak Dikenal' },
        duplicateNims, duplicateEmails, roles, statuses
    )`);

    assert.match(toLocal(errors).join(' '), /email tidak valid/);
    assert.match(toLocal(errors).join(' '), /peran "Peran Tidak Dikenal" tidak dikenal/);
    assert.match(toLocal(errors).join(' '), /sudah terdaftar atau duplikat/);
});
````

## File: settings.json
````json
{
    "liveServer.settings.port": 5501
}
````

## File: style.css
````css
/* ===== KOMPAS Lab - gaya bersama (Admin & User) ===== */
:root {
    --navy: #131C30;
    --primary-color: #0D9488;
    --primary-dark: #0F766E;
    --bg-color: #F3F4F6;
    --text-color: #1e293b;
    --font-family: 'Inter', system-ui, sans-serif;
}

body { font-family: var(--font-family); background-color: var(--bg-color); color: var(--text-color); }
#user-portal { flex: 1 1 0%; width: 100%; min-width: 0; }

/* Navigasi sidebar */
.nav-btn { display: flex; width: 100%; align-items: center; gap: .75rem; padding: .625rem 1rem; border-radius: .75rem; font-size: .875rem; font-weight: 500; color: #d1d5db; transition: background .15s, color .15s; text-align: left; }
.nav-btn:hover, .nav-btn.active { background: #1f2937; color: #fff; }
.nav-btn.active i { color: #2dd4bf; }

/* Komponen umum */
.card { background: #fff; border: 1px solid #f3f4f6; border-radius: .75rem; box-shadow: 0 1px 2px rgba(0,0,0,.05); padding: 1.25rem; }
.lbl { display: block; font-size: .75rem; font-weight: 700; color: #374151; margin-bottom: .25rem; }
.sub { font-size: .75rem; font-weight: 400; color: #9ca3af; }
.inp { width: 100%; border: 1px solid #d1d5db; border-radius: .5rem; padding: .5rem .75rem; font-size: .875rem; background: #fff; outline: none; }
.inp:focus { box-shadow: 0 0 0 2px var(--primary-color); border-color: transparent; }
.inp[readonly] { background: #f9fafb; color: #6b7280; }

/* Tombol */
.btn { padding: .5rem 1rem; border-radius: .5rem; font-size: .75rem; font-weight: 700; color: #fff; transition: background .15s; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.btn-teal { background: #0D9488; } .btn-teal:hover { background: #0F766E; }
.btn-navy { background: var(--navy); } .btn-navy:hover { background: #1f2937; }
.btn-rose { background: #f43f5e; } .btn-rose:hover { background: #e11d48; }
.btn-gray { background: #f3f4f6; color: #374151; box-shadow: none; } .btn-gray:hover { background: #e5e7eb; }
.ib { width: 1.75rem; height: 1.75rem; border-radius: .375rem; font-size: .7rem; background: #f3f4f6; color: #4b5563; transition: background .15s; }
.ib:hover { background: #e5e7eb; }
.ib.ok { background: #dcfce7; color: #15803d; } .ib.warn { background: #fef3c7; color: #b45309; } .ib.bad { background: #ffe4e6; color: #be123c; }

/* Badge status */
.badge { display: inline-block; padding: .125rem .625rem; border-radius: 9999px; font-size: .75rem; font-weight: 700; }
.b-green { background: #dcfce7; color: #166534; } .b-yellow { background: #fef9c3; color: #854d0e; }
.b-red { background: #fee2e2; color: #991b1b; } .b-blue { background: #dbeafe; color: #1e40af; }
.b-amber { background: #fef3c7; color: #92400e; } .b-gray { background: #f3f4f6; color: #4b5563; }

/* Tabel */
.tbl { width: 100%; text-align: left; font-size: .875rem; color: #4b5563; }
.tbl thead { background: #f9fafb; color: #6b7280; font-weight: 500; border-bottom: 1px solid #f3f4f6; }
.tbl th, .tbl td { padding: .75rem 1.25rem; vertical-align: top; }
.tbl tbody tr { border-bottom: 1px solid #f3f4f6; } .tbl tbody tr:hover { background: #f9fafb; }

.chip { display: inline-flex; align-items: center; gap: .5rem; background: #f0fdfa; color: #0f766e; border: 1px solid #ccfbf1; border-radius: 9999px; padding: .25rem .75rem; font-size: .75rem; font-weight: 600; }

/* Cetak laporan */
@media print {
    aside, header, .no-print { display: none !important; }
    #app-layout, main, #content { display: block !important; height: auto !important; overflow: visible !important; }
}

/* Tambahan */
button:disabled { cursor: not-allowed; }
.ib { display: inline-flex; align-items: center; justify-content: center; }
.nav-btn { position: relative; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #0D9488; outline-offset: 2px; }
````

## File: core.js
````javascript
/* =====================================================================
   KOMPAS Lab - core.js
   Database bersama untuk index.html (mode pengguna dan admin).
   Semua aturan bisnis (stok, denda, status akun, validasi pinjam) ada di sini
   supaya Admin dan User selalu memakai aturan yang sama.
   ===================================================================== */
const DB_KEY = 'kompas_db_v2', SES_U = 'kompas_session_user', SES_A = 'kompas_session_admin';

// ---------- helper umum ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => iso(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtTgl = s => s ? parseISO(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtWaktu = t => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const selisihHari = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const readFile = (file, max = 2 * 1024 * 1024) => new Promise((ok, no) => {
    if (!file) return ok(null);
    if (!/^image\//.test(file.type)) return no('File harus berupa gambar (JPG/PNG).');
    if (file.size > max) return no('Ukuran foto maksimal 2 MB.');
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no('Gagal membaca file.'); r.readAsDataURL(file);
});

// ---------- hash kata sandi (SHA-256, sinkron) ----------
// Catatan: ini hanya agar sandi tidak tersimpan polos di localStorage.
// Di sistem sungguhan hash dilakukan di server (bcrypt/argon2) dengan salt acak.
const _sha = { K: null, H: null };
function sha256(str) {
    if (!_sha.K) {
        _sha.K = []; _sha.H = [];
        for (let c = 2, n = 0; n < 64; c++) {
            let p = true; for (let i = 2; i * i <= c; i++) if (c % i === 0) { p = false; break; }
            if (p) { if (n < 8) _sha.H[n] = (Math.pow(c, .5) * 4294967296) | 0; _sha.K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; }
        }
    }
    const K = _sha.K, H = _sha.H.slice(), msg = unescape(encodeURIComponent(str)), bytes = [];
    for (let i = 0; i < msg.length; i++) bytes.push(msg.charCodeAt(i));
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    const bl = msg.length * 8; for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < bytes.length; off += 64) {
        const w = new Array(64);
        for (let i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
        for (let i = 16; i < 64; i++) {
            const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0;
            const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, h].forEach((v, i) => H[i] = (H[i] + v) | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
const hashPw = (pw, nim) => sha256(nim + ':' + pw + ':kompas-lab');

// ---------- konstanta ----------
const ST = { MENUNGGU: 'Menunggu Persetujuan', SIAP: 'Siap Diambil', DIPINJAM: 'Dipinjam', TERLAMBAT: 'Terlambat', SELESAI: 'Selesai', DITOLAK: 'Ditolak', BATAL: 'Dibatalkan' };
const HOLD = [ST.MENUNGGU, ST.SIAP, ST.DIPINJAM, ST.TERLAMBAT];   // status yang menahan stok
const OUT = [ST.DIPINJAM, ST.TERLAMBAT];                           // alat sedang di tangan peminjam
const TAHAP = ['Dilaporkan', 'Ditinjau Admin', 'Dalam Perbaikan', 'Selesai'];
const ROLES = ['Mahasiswa', 'Admin'];
const STATUS_USER = ['Menunggu Verifikasi', 'Aktif', 'Nonaktif', 'Dibekukan', 'Blacklist'];
const TUJUAN = ['Mata Kuliah / Praktikum', 'Proyek Akhir / Skripsi', 'Penelitian Dosen'];
const JENIS_LAPOR = ['Rusak Fisik', 'Tidak Menyala / Error', 'Performa Tidak Normal', 'Komponen Kurang / Tidak Lengkap', 'Alat / Komponen Hilang', 'Lainnya'];
const JENIS_HILANG = 'Alat / Komponen Hilang';
const LAB_LABEL = { 'Lab Komputasi': 'Lab Komputasi & Server', 'Lab IoT': 'Lab IoT & Mikrokontroler' };
const labNama = l => LAB_LABEL[l] || l;
let ACTOR = () => 'Sistem';   // diganti oleh user.js / admin.js

// ---------- penyimpanan ----------
let db;   // diisi di baris paling bawah file ini
function load() {
    try { const r = JSON.parse(localStorage.getItem(DB_KEY)); if (r && r.v === 2) return r; } catch (e) { /* data rusak -> seed ulang */ }
    const s = seed(); try { localStorage.setItem(DB_KEY, JSON.stringify(s)); } catch (e) { }
    return s;
}
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { alert('Penyimpanan penuh. Hapus data lama atau foto bukti.'); } }
function resetDemo() { db = seed(); save(); }
window.addEventListener('storage', e => { if (e.key === DB_KEY) { db = load(); if (window.onDBChange) window.onDBChange(); } });
setInterval(() => { if (sync() && window.onDBChange) window.onDBChange(); }, 60000);
const nextId = (p, w = 3) => { db.seq[p] = (db.seq[p] || 0) + 1; return p + '-' + String(db.seq[p]).padStart(w, '0'); };
const log = aksi => { db.logs.unshift({ t: new Date().toISOString(), user: ACTOR(), aksi }); db.logs = db.logs.slice(0, 300); save(); };
function notify(n) {
    db.notifications.unshift({ id: Date.now() + Math.floor(Math.random() * 1e4), t: new Date().toISOString(), read: false, icon: 'fa-bell', style: 'text-sky-600 bg-sky-50', ...n });
    db.notifications = db.notifications.slice(0, 300);
}
const waktuRel = t => {
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    if (m < 1) return 'Baru saja'; if (m < 60) return m + ' menit lalu'; if (m < 1440) return Math.floor(m / 60) + ' jam lalu';
    return m < 2880 ? 'Kemarin' : Math.floor(m / 1440) + ' hari lalu';
};

// ---------- hari kerja ----------
const isLibur = s => (db.policy.libur || '').split('\n').some(l => l.trim().slice(0, 10) === s);
const isHariKerja = s => { const w = parseISO(s).getDay(); return w !== 0 && w !== 6 && !isLibur(s); };
const nextKerja = s => { while (!isHariKerja(s)) s = addDays(s, 1); return s; };
const tambahHariKerja = (s, n) => { while (n > 0) { s = addDays(s, 1); if (isHariKerja(s)) n--; } return s; };
function hariKerjaInklusif(a, b) { let n = 0; for (let c = a; c <= b; c = addDays(c, 1)) if (isHariKerja(c)) n++; return n; }
function hariTerlambat(due, sampai = todayISO()) { let n = 0; for (let c = addDays(due, 1); c <= sampai; c = addDays(c, 1)) if (isHariKerja(c)) n++; return n; }
const hitungDenda = (qty, hari) => Math.min(qty * hari * db.policy.dendaHari, db.policy.dendaMaks);

// ---------- akun ----------
const getUser = nim => db.users.find(u => u.nim === nim);
const cariAkun = id => { id = String(id).trim().toLowerCase(); return db.users.find(u => u.nim.toLowerCase() === id || u.email.toLowerCase() === id); };
const inisial = n => n.split(' ').map(x => x[0]).join('').substring(0, 2).toUpperCase();
let _gagal = 0, _kunci = 0;
function tryLogin(id, pw, mode) {
    if (Date.now() < _kunci) return { msg: 'Terlalu banyak percobaan. Coba lagi 30 detik lagi.' };
    const u = cariAkun(id);
    if (!u || u.password !== hashPw(pw, u.nim)) { if (++_gagal >= 5) { _kunci = Date.now() + 30000; _gagal = 0; } return { msg: 'Akun tidak ditemukan atau kata sandi salah!' }; }
    _gagal = 0;
    if (mode === 'admin' && u.role !== 'Admin') return { msg: 'Akun ini bukan akun admin.' };
    if (mode !== 'admin' && mode !== 'shared' && u.role === 'Admin') return { msg: 'Akun admin masuk lewat Panel Admin (index.html?mode=admin).' };
    if (u.status === 'Menunggu Verifikasi') return { msg: 'Akun Anda belum diverifikasi admin. Mohon tunggu.' };
    if (u.status === 'Nonaktif') return { msg: 'Akun Anda dinonaktifkan. Hubungi admin.' };
    if (u.status === 'Blacklist') return { msg: 'Akun Anda diblokir karena pelanggaran berat. Hubungi admin.' };
    if ((mode === 'admin' || (mode === 'shared' && u.role === 'Admin')) && u.status !== 'Aktif') return { msg: 'Akun admin tidak aktif.' };
    return { ok: true, user: u };
}
const cekSandiBaru = pw => pw.length < db.settings.minPassword ? `Kata sandi minimal ${db.settings.minPassword} karakter.` : '';

// ---------- aset & stok (stok dihitung, tidak disimpan -> tidak mungkin tidak sinkron) ----------
const getAset = id => db.assets.find(a => a.id === id);
const asetAktif = () => db.assets.filter(a => !a.dihapus);
const qtySisaItem = i => Math.max(0, i.qty - (i.returnedQty || 0));
const pengembalianMenungguCek = l => !!l && OUT.includes(l.status) && l.items.some(i =>
    qtySisaItem(i) > 0 && Number.isInteger(i.returnRequestedQty) && i.returnRequestedQty > 0);
const qtyPengembalianValid = (item, qty) => Number.isInteger(qty) && qty >= 0
    && qty <= Math.min(qtySisaItem(item), Number.isInteger(item.returnRequestedQty) ? item.returnRequestedQty : 0);
function qtyDitahan(toolId, kecuali) {
    return db.loans.filter(l => HOLD.includes(l.status) && l.id !== kecuali)
        .reduce((s, l) => s + l.items.filter(i => i.toolId === toolId).reduce((x, i) => x + qtySisaItem(i), 0), 0);
}
const qtyKeluar = toolId => db.loans.filter(l => OUT.includes(l.status)).reduce((s, l) => s + l.items.filter(i => i.toolId === toolId).reduce((x, i) => x + qtySisaItem(i), 0), 0);
const unitBaik = a => Math.max(0, a.total - (a.rusak || 0) - (a.hilang || 0));
const tersedia = (a, kecuali) => Math.max(0, unitBaik(a) - qtyDitahan(a.id, kecuali));
function statusAset(a) {
    if (a.dihapus) return 'Dihapus (Write-off)';
    if (unitBaik(a) === 0) return (a.hilang || 0) >= a.total ? 'Hilang' : 'Maintenance';
    return tersedia(a) === 0 ? 'Dipinjam' : 'Tersedia';
}
const bernilaiTinggi = a => a.harga >= db.policy.ambangTinggi;
const loanNama = l => l.items.map(i => i.nama + (i.qty > 1 ? ' x' + i.qty : '')).join(', ');
const loanQty = l => l.items.reduce((s, i) => s + i.qty, 0);
const loanQtySisa = l => l.items.reduce((s, i) => s + qtySisaItem(i), 0);
const jumlahJenisAktif = nim => new Set(db.loans.filter(l => l.nim === nim && HOLD.includes(l.status)).flatMap(l => l.items.filter(i => qtySisaItem(i) > 0).map(i => i.toolId)));

// ---------- status akun, sanksi, denda ----------
function statusAkun(nim) {
    const p = db.policy, u = getUser(nim), fines = db.fines.filter(f => f.nim === nim);
    const macet = fines.find(f => f.status === 'Berjalan' && f.hari > p.batasBeku);
    const tunggakan = fines.filter(f => ['Berjalan', 'Belum Dibayar', 'Menunggu Verifikasi'].includes(f.status));
    const menungguVerifikasi = fines.some(f => f.nim === nim && f.status === 'Menunggu Verifikasi');
    const hilang = db.laporan.filter(l => l.nim === nim && l.jenis === JENIS_HILANG && l.tahap < 3);
    const totalTunggakan = tunggakan.reduce((s, f) => s + f.nominal, 0);
    const totalBerjalan = fines.filter(f => f.status === 'Berjalan').reduce((s, f) => s + f.nominal, 0);
    let level = 'aman', judul = 'Aman', pesan = 'Tidak ada tanggungan. Tetap kembalikan alat tepat waktu agar akun tidak dibekukan.', alasan = '';
    if (macet) {
        level = 'beku'; judul = 'Akses Dibekukan';
        pesan = `${macet.alat} terlambat ${macet.hari} hari kerja (lebih dari ${p.batasBeku}). Kembalikan alat segera; akses pinjam dibekukan ${p.lamaBeku} hari sejak alat dikembalikan.`;
        alasan = 'Akses pinjam dibekukan karena keterlambatan. Lihat menu Sanksi & Denda.';
    } else if (u && u.status === 'Dibekukan') {
        level = 'beku'; judul = 'Akses Dibekukan';
        pesan = u.bekuSampai ? `Akses pinjam dibekukan sampai ${fmtTgl(u.bekuSampai)}. Anda belum dapat mengajukan peminjaman atau booking baru.` : 'Akses pinjam dibekukan oleh admin. Hubungi admin untuk informasi lebih lanjut.';
        alasan = u.bekuSampai ? `Akses pinjam dibekukan sampai ${fmtTgl(u.bekuSampai)}.` : 'Akses pinjam dibekukan oleh admin.';
    } else if (tunggakan.length || hilang.length) {
        level = 'peringatan'; judul = 'Ada Tanggungan';
        pesan = hilang.length ? 'Ada laporan kehilangan alat yang belum diselesaikan (penggantian setara / berita acara). Selesaikan bersama admin.'
            : menungguVerifikasi ? 'Pembayaran denda sedang menunggu verifikasi Admin. Pengajuan baru dapat dilakukan setelah pembayaran disetujui.'
                : 'Lunasi denda dan kembalikan alat yang terlambat agar dapat meminjam kembali.';
        alasan = hilang.length ? 'Selesaikan tanggungan kehilangan alat bersama admin terlebih dahulu.'
            : menungguVerifikasi ? 'Pembayaran denda masih menunggu verifikasi Admin.'
                : 'Lunasi denda terlebih dahulu di menu Sanksi & Denda.';
    }
    return { level, judul, pesan, alasan, boleh: level === 'aman', totalTunggakan, totalBerjalan, menungguVerifikasi, jumlahDenda: fines.length };
}

function sync() {   // deteksi keterlambatan, buat denda, pengingat H-1, lepas pembekuan otomatis
    let ch = false; const today = todayISO(), p = db.policy;
    db.users.forEach(u => {
        if (u.status === 'Dibekukan' && u.bekuSampai && u.bekuSampai < today) {
            u.status = 'Aktif'; delete u.bekuSampai; ch = true;
            notify({ untuk: u.nim, icon: 'fa-unlock', style: 'text-green-600 bg-green-50', title: 'Pembekuan akses berakhir', desc: 'Akses pinjam Anda sudah aktif kembali.', view: 'sanksi' });
        }
    });
    db.loans.forEach(l => {
        if (!OUT.includes(l.status)) return;
        const qtySisa = loanQtySisa(l);
        if (!qtySisa) return;
        const hari = hariTerlambat(l.tglKembali, today);
        if (hari > 0) {
            if (l.status !== ST.TERLAMBAT) { l.status = ST.TERLAMBAT; l.riwayat.push({ t: new Date().toISOString(), s: ST.TERLAMBAT, oleh: 'Sistem' }); ch = true; }
            let f = db.fines.find(x => x.loanId === l.id);
            if (!f) {
                f = { id: nextId('DND'), loanId: l.id, nim: l.nim, nama: l.nama, alat: loanNama(l), qty: loanQty(l), qtyAktif: qtySisa, frozenNominal: 0, jatuhTempo: l.tglKembali, hari: 0, nominal: 0, status: 'Berjalan', createdAt: today };
                db.fines.push(f); ch = true;
                notify({ untuk: l.nim, icon: 'fa-exclamation-circle', style: 'text-rose-600 bg-rose-50', title: 'Peminjaman terlambat', desc: `${loanNama(l)} (${l.id}) melewati batas kembali. Denda berjalan ${rp(p.dendaHari)} per alat per hari kerja.`, view: 'sanksi' });
                notify({ untuk: 'ADMIN', icon: 'fa-exclamation-circle', style: 'text-rose-600 bg-rose-50', title: 'Peminjaman terlambat', desc: `${l.nama}: ${l.id} melewati batas kembali.`, view: 'loans' });
            }
            if (f.status === 'Berjalan') {
                const nominal = Math.min(p.dendaMaks, (f.frozenNominal || 0) + hitungDenda(qtySisa, hari));
                if (f.hari !== hari || f.qtyAktif !== qtySisa || f.nominal !== nominal) {
                    f.hari = hari; f.qtyAktif = qtySisa; f.nominal = nominal; ch = true;
                }
            }
        } else if (!l.remind && l.tglKembali <= addDays(today, 1)) {
            l.remind = true; ch = true;
            notify({ untuk: l.nim, icon: 'fa-clock', style: 'text-amber-600 bg-amber-50', title: l.tglKembali === today ? 'Batas pengembalian hari ini' : 'Batas pengembalian besok', desc: `${loanNama(l)} (${l.id}) harus dikembalikan ${l.tglKembali === today ? 'hari ini' : 'besok'}.`, view: 'pengembalian' });
        }
    });
    if (ch) save();
    return ch;
}

function finalisasiDenda(l) {   // dipanggil admin saat menerima pengembalian
    sync();
    const f = db.fines.find(x => x.loanId === l.id && x.status === 'Berjalan'); if (!f) return null;
    const p = db.policy, today = todayISO();
    f.dikembalikan = today; f.status = 'Belum Dibayar';
    const kali = db.fines.filter(x => x.nim === l.nim && x.createdAt >= addDays(today, -182)).length;
    const u = getUser(l.nim);
    if (u && u.status === 'Aktif' && (f.hari > p.batasBeku || kali >= p.kaliTerlambat)) {
        u.status = 'Dibekukan'; u.bekuSampai = addDays(today, p.lamaBeku);
        notify({ untuk: l.nim, icon: 'fa-ban', style: 'text-rose-600 bg-rose-50', title: 'Akses pinjam dibekukan', desc: `Akses pinjam dibekukan sampai ${fmtTgl(u.bekuSampai)} akibat keterlambatan.`, view: 'sanksi' });
    }
    notify({ untuk: l.nim, icon: 'fa-file-invoice-dollar', style: 'text-amber-600 bg-amber-50', title: 'Denda siap dibayar', desc: `Denda ${f.id} sebesar ${rp(f.nominal)} untuk ${f.alat}. Silakan lakukan pembayaran.`, view: 'sanksi' });
    return f;
}

// ---------- validasi pengajuan peminjaman (dipakai User dan Admin untuk peminjaman langsung) ----------
function cekPengajuan(o, abaikanLoanId) {
    const p = db.policy, today = todayISO();
    if (o.user.role !== 'Mahasiswa') return 'Pengajuan peminjaman alat hanya dapat dilakukan oleh mahasiswa.';
    const sa = statusAkun(o.user.nim); if (!sa.boleh) return sa.alasan;
    if (!o.items.length) return 'Pilih minimal satu alat.';
    if (new Set(o.items.map(it => it.toolId)).size !== o.items.length) return 'Alat yang sama hanya boleh ditambahkan satu kali.';
    for (const it of o.items) {
        const a = getAset(it.toolId);
        if (!a || a.dihapus) return 'Alat tidak ditemukan.';
        if (!Number.isInteger(it.qty) || it.qty < 1) return 'Jumlah minimal 1 unit dan harus berupa bilangan bulat.';
        if (it.qty > tersedia(a, abaikanLoanId)) return `Stok ${a.name} tidak cukup (tersedia ${tersedia(a, abaikanLoanId)} unit).`;
    }
    if (!o.tglAmbil || !o.tglKembali || !o.jamAmbil || !o.jamKembali) return 'Lengkapi tanggal dan jam ambil / kembali.';
    if (o.walkin ? o.tglAmbil < today : o.tglAmbil <= today) return o.walkin ? 'Tanggal ambil tidak boleh sebelum hari ini.' : 'Pengajuan paling lambat H-1: tanggal ambil minimal besok.';
    const [batasJam, batasMenit] = p.batasAjuan.split(':').map(Number);
    if (!o.walkin && o.tglAmbil === addDays(today, 1)
        && (new Date().getHours() * 60 + new Date().getMinutes()) >= batasJam * 60 + batasMenit)
        return `Pengajuan untuk besok paling lambat pukul ${p.batasAjuan}. Pilih tanggal ambil mulai lusa.`;
    if (!isHariKerja(o.tglAmbil) || !isHariKerja(o.tglKembali)) return 'Tanggal ambil dan kembali harus hari kerja (Senin - Jumat, bukan hari libur).';
    if (o.tglKembali < o.tglAmbil) return 'Tanggal kembali tidak boleh sebelum tanggal ambil.';
    for (const j of [o.jamAmbil, o.jamKembali]) if (j < p.jamBuka || j > p.jamTutup) return `Jam ambil dan kembali harus dalam jam layanan (${p.jamBuka} - ${p.jamTutup}).`;
    if (o.tglAmbil === o.tglKembali && o.jamKembali <= o.jamAmbil) return 'Jam kembali harus setelah jam ambil.';
    const ta = o.tujuanJenis === 'Proyek Akhir / Skripsi', tinggi = o.items.some(i => bernilaiTinggi(getAset(i.toolId)));
    if (ta) {
        if (selisihHari(o.tglAmbil, o.tglKembali) + 1 > p.durasiTA) return `Proyek tugas akhir maksimal ${p.durasiTA} hari.`;
        if (tinggi && hariKerjaInklusif(o.tglAmbil, o.tglKembali) > p.durasiTinggi)
            return `Alat bernilai tinggi maksimal ${p.durasiTinggi} hari kerja, termasuk untuk proyek tugas akhir.`;
    }
    else {
        const mx = tinggi ? p.durasiTinggi : p.durasiUmum;
        if (hariKerjaInklusif(o.tglAmbil, o.tglKembali) > mx) return `${tinggi ? 'Alat bernilai tinggi' : 'Alat umum'} maksimal ${mx} hari kerja.`;
    }
    const jenis = jumlahJenisAktif(o.user.nim); o.items.forEach(i => jenis.add(i.toolId));
    if (jenis.size > p.maksMhs) return `Batas ${p.maksMhs} jenis alat aktif untuk mahasiswa terlampaui (termasuk pengajuan yang masih berjalan).`;
    return '';
}
function buatLoan(o, status) {
    const l = {
        id: nextId('TRX'), nim: o.user.nim, nama: o.user.name, tipe: o.tipe || 'Individu',
        items: o.items.map(i => ({ toolId: i.toolId, nama: getAset(i.toolId).name, qty: i.qty })),
        tujuanJenis: o.tujuanJenis, tujuan: o.tujuan, tglAmbil: o.tglAmbil, jamAmbil: o.jamAmbil, tglKembali: o.tglKembali, jamKembali: o.jamKembali,
        surat: o.surat || '', suratLampiran: o.suratLampiran || null, status, createdAt: new Date().toISOString(), riwayat: [{ t: new Date().toISOString(), s: status, oleh: ACTOR() }]
    };
    db.loans.unshift(l); return l;
}
const gantiStatusLoan = (l, s, catatan) => { l.status = s; l.riwayat.push({ t: new Date().toISOString(), s, oleh: ACTOR(), catatan: catatan || '' }); };

// ---------- booking ruang ----------
function bookingKonflik(ruang, tglMulai, tglSelesai, jamMulai, jamSelesai, abaikanId, statuses) {
    return db.bookings.filter(b => {
        if (b.id === abaikanId || b.ruang !== ruang || !statuses.includes(b.status)
            || jamMulai >= b.jamSelesai || b.jamMulai >= jamSelesai) return false;
        const start = tglMulai > b.tglMulai ? tglMulai : b.tglMulai;
        const end = tglSelesai < b.tglSelesai ? tglSelesai : b.tglSelesai;
        for (let date = start; date <= end; date = addDays(date, 1)) if (isHariKerja(date)) return true;
        return false;
    });
}

// ---------- laporan kendala ----------
function setTahapLapor(lp, idx, catatan) {
    const a = getAset(lp.toolId), hilang = lp.jenis === JENIS_HILANG;
    lp.tahap = idx; lp.riwayat.push({ tahap: TAHAP[idx], t: new Date().toISOString(), oleh: ACTOR(), catatan: catatan || '' });
    if (a) {
        if (!hilang) {
            if (idx >= 2 && !lp.applied) { a.rusak = Math.min(a.total - (a.hilang || 0), (a.rusak || 0) + lp.jumlah); lp.applied = true; }
            if (idx === 3 && lp.applied && !lp.released) { a.rusak = Math.max(0, (a.rusak || 0) - lp.jumlah); lp.released = true; }
        } else if (idx === 3 && !lp.applied) { a.hilang = Math.min(a.total - (a.rusak || 0), (a.hilang || 0) + lp.jumlah); lp.applied = true; }
    }
    if (lp.nim !== 'ADMIN') notify({ untuk: lp.nim, icon: idx === 3 ? 'fa-check-circle' : 'fa-screwdriver-wrench', style: idx === 3 ? 'text-green-600 bg-green-50' : 'text-indigo-600 bg-indigo-50', title: 'Laporan ' + lp.id + ': ' + TAHAP[idx], desc: `${lp.toolName} - ${catatan || 'Status laporan diperbarui admin.'}`, view: 'pelaporan' });
}

// ---------- statistik (data historis + data langsung) ----------
function trenPinjam() {
    const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], now = new Date(), out = [];
    for (let k = 5; k >= 0; k--) {
        const d = new Date(now.getFullYear(), now.getMonth() - k, 1), key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
        const live = db.loans.filter(l => l.createdAt.slice(0, 7) === key).length;
        out.push([bln[d.getMonth()], k === 0 ? live : (db.trenDasar[5 - k] || 0) + live]);
    }
    return out;
}
const hitungPinjam = a => (a.pj || 0) + db.loans.filter(l => l.items.some(i => i.toolId === a.id) && ![ST.DITOLAK, ST.BATAL].includes(l.status)).length;
const hitungRusak = a => (a.rk || 0) + db.laporan.filter(l => l.toolId === a.id && l.jenis !== JENIS_HILANG).length;
const nilaiBuku = a => {
    const th = (Date.now() - new Date(a.tglBeli)) / 31557600000;
    return Math.round(a.harga * a.total * Math.max(0, 1 - th / db.policy.penyusutan));
};

// ---------- data awal ----------
function seed() {
    const now = todayISO(), d = n => addDays(now, n);
    // isLibur memakai db.policy -> sediakan sementara
    db = { policy: { libur: '' } };
    const U = (nim, name, email, role, prodi, status, pw = 'student123', x = {}) => ({ nim, name, email, role, prodi, status, password: hashPw(pw, nim), hp: '', createdAt: now, ...x });
    const A = (id, name, kategori, lokasi, total, harga, tglBeli, sumber, garansi, servis, icon, spek, pj, rk, rusak = 0) =>
        ({ id, name, kategori, lokasi, total, harga, tglBeli, sumber, garansi, servis, icon, spek, pj, rk, rusak, hilang: 0 });
    const P = 'Pembelian', H = 'Hibah', L = ['Lab Pemrograman', 'Lab Jaringan', 'Lab Komputasi', 'Lab IoT', 'Ruang Admin'];
    const assets = [
        A('TI-KMP-001', 'PC Workstation i7 12th Gen', 'Komputer', L[0], 10, 12000000, '2023-02-10', P, '2026-12-10', 1500000, 'fa-desktop', 'Intel Core i7-12700, RAM 16 GB, SSD 512 GB', 42, 2),
        A('TI-KMP-002', 'Laptop Lenovo ThinkPad E14', 'Komputer', L[0], 8, 14500000, '2024-03-15', P, '2027-03-15', 600000, 'fa-laptop', 'Intel Core i5, RAM 16 GB, SSD 512 GB, layar 14 inci', 51, 1),
        A('TI-KMP-003', 'Monitor LG 24" Full HD', 'Komputer', L[0], 20, 1800000, '2023-02-10', P, '', 0, 'fa-tv', '24 inci Full HD IPS, port HDMI dan VGA', 18, 0),
        A('TI-KMP-004', 'Keyboard & Mouse Logitech Combo', 'Komputer', L[4], 25, 450000, '2023-02-10', P, '', 0, 'fa-keyboard', 'Keyboard dan mouse nirkabel 2,4 GHz', 22, 1),
        A('TI-KMP-005', 'Proyektor Epson EB-X06', 'Komputer', L[4], 4, 6500000, '2022-08-01', H, '', 900000, 'fa-video', '3.600 lumen, resolusi XGA, HDMI dan VGA', 30, 3),
        A('TI-KMP-006', 'Webcam Logitech C920', 'Komputer', L[4], 6, 1200000, '2024-01-20', P, '', 0, 'fa-camera', '1080p 30 fps, mikrofon ganda', 9, 0),
        A('TI-KMP-007', 'Harddisk Eksternal WD 1TB', 'Komputer', L[4], 10, 900000, '2023-09-05', P, '', 0, 'fa-hard-drive', '1 TB, USB 3.0', 14, 1),
        A('TI-KMP-008', 'PC Workstation Ryzen 7 RTX 3060', 'Komputer', L[2], 4, 18500000, '2024-08-12', P, '2027-08-12', 0, 'fa-desktop', 'Ryzen 7, RAM 32 GB, RTX 3060 12 GB', 12, 0),
        A('TI-JRG-001', 'Router Cisco Catalyst 2960', 'Jaringan', L[1], 5, 9800000, '2023-06-20', P, '2026-11-20', 0, 'fa-network-wired', '24 port 10/100, Layer 2, Cisco IOS', 24, 0),
        A('TI-JRG-002', 'Switch Mikrotik CRS326', 'Jaringan', L[1], 8, 4500000, '2023-06-20', P, '', 0, 'fa-network-wired', '24 port Gigabit, 2 port SFP+', 15, 0),
        A('TI-JRG-003', 'Access Point TP-Link EAP225', 'Jaringan', L[1], 6, 1300000, '2023-06-20', P, '', 0, 'fa-wifi', 'Wi-Fi AC1350 dual band, PoE', 11, 0),
        A('TI-JRG-004', 'Switch TP-Link TL-SG1024 24-Port', 'Jaringan', L[1], 4, 1100000, '2022-08-01', H, '', 0, 'fa-network-wired', '24 port Gigabit unmanaged', 6, 0),
        A('TI-JRG-005', 'Router Mikrotik hAP ac2', 'Jaringan', L[1], 8, 900000, '2024-02-02', P, '', 0, 'fa-network-wired', 'Dual band AC, 5 port Gigabit', 20, 1),
        A('TI-JRG-006', 'Firewall Fortinet FortiGate 60F', 'Jaringan', L[1], 2, 17000000, '2024-05-10', P, '2027-05-10', 0, 'fa-shield-halved', 'Firewall NGFW, 10 port GE', 5, 0),
        A('TI-JRG-007', 'Toolkit Crimping & LAN Tester', 'Jaringan', L[1], 10, 350000, '2023-06-20', P, '', 0, 'fa-screwdriver-wrench', 'Tang crimping, LAN tester, konektor RJ45', 16, 0),
        A('TI-JRG-008', 'Access Point Ubiquiti UniFi AC Lite', 'Jaringan', L[1], 3, 1800000, '2023-01-12', P, '', 450000, 'fa-tower-broadcast', 'Wi-Fi AC1200, PoE 802.3af', 9, 4, 3),
        A('TI-SRV-001', 'Dell PowerEdge R740 Server', 'Server', L[2], 2, 85000000, '2022-11-05', P, '2025-11-05', 4200000, 'fa-server', 'Xeon Silver, RAM 64 GB, 4x 1,2 TB SAS', 12, 1),
        A('TI-SRV-002', 'HPE ProLiant DL380 Gen10', 'Server', L[2], 2, 78000000, '2023-04-18', P, '2026-12-31', 0, 'fa-server', 'Xeon Gold, RAM 128 GB, 8 bay SFF', 8, 0),
        A('TI-SRV-003', 'Raspberry Pi 4 Cluster Kit', 'Server', L[2], 6, 3600000, '2024-09-01', P, '', 0, 'fa-microchip', 'Raspberry Pi 4 (4 unit) dengan rak dan switch mini', 13, 1),
        A('TI-SRV-004', 'NAS Synology DS220+', 'Server', L[2], 2, 5200000, '2024-11-10', P, '2027-11-10', 0, 'fa-hard-drive', '2 bay, kapasitas total 16 TB', 5, 0),
        A('TI-IOT-001', 'Kit Arduino Uno R3 Starter', 'Mikrokontroler', L[3], 15, 350000, '2024-09-01', P, '', 0, 'fa-microchip', 'Arduino Uno R3, sensor dasar, kabel jumper', 66, 5),
        A('TI-IOT-002', 'ESP32 NodeMCU Wi-Fi Module', 'Mikrokontroler', L[3], 20, 85000, '2024-09-01', P, '', 0, 'fa-wifi', 'ESP32 Wi-Fi + Bluetooth, 30 pin', 58, 9, 6),
        A('TI-IOT-003', 'Arduino Mega 2560', 'Mikrokontroler', L[3], 10, 250000, '2024-09-01', P, '', 0, 'fa-microchip', 'ATmega2560, 54 pin digital', 22, 1),
        A('TI-IOT-004', 'Raspberry Pi Pico W', 'Mikrokontroler', L[3], 12, 120000, '2024-09-01', P, '', 0, 'fa-microchip', 'RP2040 dengan Wi-Fi', 14, 0),
        A('TI-IOT-005', 'Modul LoRa SX1278 Ra-02 433MHz', 'Mikrokontroler', L[3], 15, 95000, '2024-09-01', P, '', 0, 'fa-tower-broadcast', 'LoRa 433 MHz, antena SMA', 17, 2),
        A('TI-IOT-006', 'Sensor DHT22 Suhu & Kelembapan', 'Mikrokontroler', L[3], 20, 75000, '2024-09-01', P, '', 0, 'fa-temperature-half', 'Sensor suhu dan kelembapan digital', 25, 3),
        A('TI-IOT-007', 'Modul ESP32-CAM', 'Mikrokontroler', L[3], 10, 110000, '2024-09-01', P, '', 0, 'fa-camera', 'ESP32 dengan kamera OV2640', 19, 2),
        A('TI-IOT-008', 'Breadboard & Kabel Jumper Kit', 'Mikrokontroler', L[3], 25, 90000, '2024-09-01', P, '', 0, 'fa-plug', 'Breadboard 830 titik, kabel jumper', 28, 0),
        A('TI-IOT-009', 'Multimeter Digital', 'Mikrokontroler', L[3], 8, 250000, '2023-02-10', P, '', 0, 'fa-bolt', 'Digital 6000 count, ukur AC/DC', 12, 1),
        A('TI-IOT-010', 'Osiloskop Digital Rigol DS1054Z', 'Mikrokontroler', L[3], 2, 5900000, '2021-05-18', H, '', 300000, 'fa-wave-square', '4 kanal 50 MHz, 1 GSa/s', 4, 0)
    ];
    const BUDI = '198020261001', REZA = '198020261004', TS = n => new Date(Date.now() + n * 864e5).toISOString();
    const loan = (id, nim, nama, toolId, qty, st, a, k, tujuanJenis, tujuan, extra = {}) => ({
        id, nim, nama, tipe: 'Individu', items: [{ toolId, nama: assets.find(x => x.id === toolId).name, qty }], tujuanJenis, tujuan,
        tglAmbil: d(a), jamAmbil: '09:00', tglKembali: d(k), jamKembali: '15:00', surat: '', status: st,
        createdAt: TS(a - 2), riwayat: [{ t: TS(a - 2), s: ST.MENUNGGU, oleh: nama }, { t: TS(a - 1), s: st, oleh: 'Admin KOMPAS' }], ...extra
    });
    const bk = d(5), kerja = s => { while ([0, 6].includes(parseISO(s).getDay())) s = addDays(s, 1); return s; };
    const data = {
        v: 2,
        users: [
            U('198001012005', 'Admin KOMPAS', 'admin@uir.ac.id', 'Admin', 'Unit Laboratorium', 'Aktif', 'admin123'),
            U(BUDI, 'Budi Santoso', 'budi@student.uir.ac.id', 'Mahasiswa', 'Teknik Informatika', 'Aktif', 'student123', { hp: '082258758471' }),
            U(REZA, 'Reza Pahlevi', 'reza@student.uir.ac.id', 'Mahasiswa', 'Teknik Informatika', 'Aktif'),
            U('198020261006', 'Rafi Hidayat', 'rafi@student.uir.ac.id', 'Mahasiswa', 'Sistem Informasi', 'Menunggu Verifikasi'),
            U('198020261003', 'Ahmad Dahlan', 'ahmad@student.uir.ac.id', 'Mahasiswa', 'Teknik Informatika', 'Dibekukan', 'student123', { bekuSampai: d(5) }),
            U('197503202001', 'Dr. Andi Wijaya', 'andi@uir.ac.id', 'Dosen', 'Teknik Informatika', 'Aktif')
        ],
        master: {
            'Kategori Alat': ['Komputer', 'Jaringan', 'Server', 'Mikrokontroler'],
            'Lokasi / Lab': L,
            'Merek': ['Dell', 'Lenovo', 'Cisco', 'Mikrotik', 'Logitech', 'Arduino'],
            'Satuan': ['Unit', 'Set', 'Buah', 'Pak'],
            'Vendor': ['PT Mitra Teknologi', 'CV Data Prima', 'Toko Elektro Jaya'],
            'Program Studi': ['Teknik Informatika', 'Sistem Informasi', 'Teknik Elektro'],
            'Mata Kuliah': ['Jaringan Komputer', 'Pemrograman Web', 'Sistem Tertanam', 'Keamanan Server']
        },
        policy: {
            durasiUmum: 3, durasiTinggi: 1, durasiTA: 14, maksMhs: 3, dendaHari: 5000, dendaMaks: 100000,
            batasBeku: 7, kaliTerlambat: 3, lamaBeku: 14, jamBuka: '08:00', jamTutup: '16:00', batasAjuan: '15:00', penyusutan: 4, ambangTinggi: 5000000, maksBooking: 3,
            kapasitas: { 'Lab Pemrograman': 40, 'Lab Jaringan': 30, 'Lab Komputasi': 20, 'Lab IoT': 25 },
            libur: '2026-12-25 Natal\n2027-01-01 Tahun Baru', tnc: 'Peminjam wajib menjaga alat, mengembalikan tepat waktu, dan menerima sanksi atau denda sesuai kebijakan laboratorium.'
        },
        assets,
        loans: [
            loan('TRX-001', BUDI, 'Budi Santoso', 'TI-SRV-001', 2, ST.DIPINJAM, -3, 0, TUJUAN[0], 'Praktikum Keamanan Server'),
            loan('TRX-002', BUDI, 'Budi Santoso', 'TI-IOT-002', 5, ST.DIPINJAM, -11, -4, TUJUAN[1], 'Prototipe sensor kelembapan untuk proyek akhir'),
            loan('TRX-003', BUDI, 'Budi Santoso', 'TI-IOT-001', 2, ST.MENUNGGU, 1, 6, TUJUAN[0], 'Praktikum Sistem Tertanam'),
            loan('TRX-004', BUDI, 'Budi Santoso', 'TI-KMP-001', 3, ST.SELESAI, -20, -17, TUJUAN[0], 'Praktikum Pemrograman Web', { dikembalikan: d(-17), kondisiKembali: 'Baik' }),
            loan('TRX-005', REZA, 'Reza Pahlevi', 'TI-KMP-002', 2, ST.DIPINJAM, -1, 2, TUJUAN[3], 'Persiapan lomba pemrograman'),
            loan('TRX-006', REZA, 'Reza Pahlevi', 'TI-JRG-001', 1, ST.SIAP, 0, 2, TUJUAN[0], 'Praktikum Jaringan Komputer', { kode: 'K7P2QX' })
        ],
        fines: [],
        laporan: [
            { id: 'LPR-001', nim: REZA, nama: 'Reza Pahlevi', toolId: 'TI-IOT-002', toolName: 'ESP32 NodeMCU Wi-Fi Module', jenis: 'Tidak Menyala / Error', ditemukan: 'Saat sedang digunakan', tingkat: 'Berat', tgl: d(-6), jumlah: 6, deskripsi: 'Enam modul tidak terdeteksi di port USB setelah diberi daya dari adaptor eksternal.', foto: '', tahap: 2, applied: true, riwayat: [{ tahap: TAHAP[0], t: TS(-6), oleh: 'Reza Pahlevi', catatan: '' }, { tahap: TAHAP[2], t: TS(-4), oleh: 'Admin KOMPAS', catatan: 'Dikirim ke vendor untuk diperiksa.' }] },
            { id: 'LPR-002', nim: 'ADMIN', nama: 'Admin KOMPAS', toolId: 'TI-JRG-008', toolName: 'Access Point Ubiquiti UniFi AC Lite', jenis: 'Rusak Fisik', ditemukan: 'Saat akan mengembalikan', tingkat: 'Berat', tgl: d(-15), jumlah: 3, deskripsi: 'Temuan admin saat stock opname: port PoE rusak pada seluruh unit.', foto: '', tahap: 2, applied: true, riwayat: [{ tahap: TAHAP[2], t: TS(-14), oleh: 'Admin KOMPAS', catatan: 'Menunggu suku cadang.' }] }
        ],
        bookings: [
            { id: 'BKG-001', nim: '198020261003', nama: 'Ahmad Dahlan', ruang: 'Lab Pemrograman', tglMulai: kerja(bk), tglSelesai: kerja(bk), jamMulai: '09:00', jamSelesai: '12:00', peserta: 30, pj: 'Ahmad Dahlan', kontak: '081234567890', tujuan: 'Praktikum Pemrograman Web kelas B', status: 'Disetujui', createdAt: TS(-3) },
            { id: 'BKG-002', nim: BUDI, nama: 'Budi Santoso', ruang: 'Lab Jaringan', tglMulai: kerja(d(8)), tglSelesai: kerja(d(8)), jamMulai: '13:00', jamSelesai: '15:00', peserta: 20, pj: 'Budi Santoso', kontak: '082258758471', tujuan: 'Latihan konfigurasi VLAN untuk lomba jaringan', status: 'Menunggu Persetujuan', createdAt: TS(-1) }
        ],
        procurement: [
            { id: 'PRC-001', item: 'Switch Mikrotik CRS326 (4 unit)', pengusul: 'Admin KOMPAS', estimasi: 18000000, realisasi: 0, status: 'Diusulkan' },
            { id: 'PRC-002', item: 'Laptop Lenovo ThinkPad E14 (5 unit)', pengusul: 'Admin KOMPAS', estimasi: 72500000, realisasi: 70200000, status: 'Terealisasi' }
        ],
        notifications: [], resets: [], trenDasar: [28, 35, 22, 41, 48],
        settings: { lembaga: 'Universitas Islam Riau - Lab IT', kopSurat: 'Fakultas Teknik, Jl. Kaharuddin Nasution, Pekanbaru', minPassword: 8, waAdmin: '6281200000000' },
        logs: [{ t: new Date().toISOString(), user: 'Sistem', aksi: 'Database KOMPAS Lab diinisialisasi' }],
        backups: [], jadwalBackup: 'Harian', seq: { TRX: 6, DND: 0, BKG: 2, LPR: 2, PRC: 2 }
    };
    db = data;                    // agar sync() memakai data baru
    sync();                       // buat denda TRX-002 dan pengingat
    db.notifications.push({ id: 1, t: TS(-1), read: false, untuk: BUDI, icon: 'fa-door-open', style: 'text-sky-600 bg-sky-50', title: 'Booking ruang lab diproses', desc: 'Pengajuan booking Lab Jaringan sedang menunggu persetujuan admin.', view: 'laporan' });
    return data;
}

db = load();
````

## File: core.test.js
````javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const coreSource = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
const userSource = fs.readFileSync(path.join(__dirname, 'user.js'), 'utf8');
const loginSessionStart = userSource.indexOf('function storeLoginSession(');
const loginSessionEnd = userSource.indexOf('\nfunction handleLogin(', loginSessionStart);
const loginSessionWorkflow = userSource.slice(loginSessionStart, loginSessionEnd);

function createCoreContext() {
    const store = new Map();
    const context = vm.createContext({
        console,
        localStorage: {
            getItem(key) { return store.get(key) ?? null; },
            setItem(key, value) { store.set(key, String(value)); }
        },
        window: { addEventListener() {} },
        setInterval() { return 0; }
    });
    vm.runInContext(coreSource, context, { filename: 'User/core.js' });
    return context;
}

function evaluate(context, expression) {
    return vm.runInContext(expression, context);
}

test('SHA-256 produces the standard digest for a known input', () => {
    const context = createCoreContext();
    assert.equal(evaluate(context, "sha256('abc')"), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('login accepts an active non-admin account and rejects a wrong password', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.status === 'Aktif' && user.role !== 'Admin').nim");

    assert.equal(evaluate(context, `tryLogin('${nim}', 'student123', 'user').ok`), true);
    assert.equal(evaluate(context, `tryLogin('${nim}', 'wrong-password', 'user').ok`), undefined);
});

test('shared login accepts active admin accounts and keeps role-specific admin login checks', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.role === 'Admin').nim");

    assert.equal(evaluate(context, `tryLogin('${nim}', 'admin123', 'shared').ok`), true);
    assert.equal(evaluate(context, `tryLogin('${nim}', 'admin123', 'user').ok`), undefined);
});

test('admin and user sessions can remain active in separate tabs', () => {
    const makeTab = () => {
        const values = new Map();
        const sessionStorage = {
            getItem(key) { return values.get(key) ?? null; },
            setItem(key, value) { values.set(key, String(value)); },
            removeItem(key) { values.delete(key); }
        };
        const context = vm.createContext({ SES_U: 'kompas_session_user', SES_A: 'kompas_session_admin', sessionStorage });
        vm.runInContext(loginSessionWorkflow, context);
        return { context, sessionStorage };
    };
    const adminTab = makeTab(), userTab = makeTab();

    vm.runInContext("storeLoginSession({ role: 'Admin', name: 'Admin Uji', nim: '198001012005' })", adminTab.context);
    vm.runInContext("storeLoginSession({ role: 'Mahasiswa', name: 'Budi Uji', nim: '198020261001' })", userTab.context);

    assert.deepEqual(JSON.parse(adminTab.sessionStorage.getItem('kompas_session_admin')), { name: 'Admin Uji', nim: '198001012005' });
    assert.equal(adminTab.sessionStorage.getItem('kompas_session_user'), null);
    assert.equal(userTab.sessionStorage.getItem('kompas_session_user'), '198020261001');
    assert.equal(userTab.sessionStorage.getItem('kompas_session_admin'), null);
});

test('loan validation rejects a request that exceeds available stock', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.status === 'Aktif' && user.role !== 'Admin').nim");
    evaluate(context, `db.fines = []; db.laporan = []; db.loans = db.loans.filter(loan => loan.nim !== '${nim}')`);
    const toolId = evaluate(context, "db.assets.find(asset => tersedia(asset) > 0).id");
    const available = evaluate(context, `tersedia(getAset('${toolId}'))`);

    const error = evaluate(context, `cekPengajuan({
        user: getUser('${nim}'),
        items: [{ toolId: '${toolId}', qty: ${available + 1} }]
    })`);
    assert.match(error, /^Stok .* tidak cukup/);
});

test('returned quantities stop counting against held and borrowed stock', () => {
    const context = createCoreContext();
    const assetId = evaluate(context, "db.assets.find(asset => tersedia(asset) > 0).id");
    evaluate(context, `db.loans = [{
        id: 'TEST-PARTIAL', nim: 'TEST', status: ST.DIPINJAM,
        items: [{ toolId: '${assetId}', qty: 4, returnedQty: 3 }]
    }]`);

    assert.equal(evaluate(context, `qtyDitahan('${assetId}')`), 1);
    assert.equal(evaluate(context, `qtyKeluar('${assetId}')`), 1);
    assert.equal(evaluate(context, "loanQtySisa(db.loans[0])"), 1);
    evaluate(context, "db.loans[0].items[0].returnedQty = 4");
    assert.equal(evaluate(context, `qtyDitahan('${assetId}')`), 0);
    assert.equal(evaluate(context, "jumlahJenisAktif('TEST').size"), 0);
});

test('admin can inspect only requested return quantities', () => {
    const context = createCoreContext();
    const pending = { status: 'Dipinjam', items: [{ qty: 4, returnedQty: 1, returnRequestedQty: 2 }] };
    const noRequest = { status: 'Dipinjam', items: [{ qty: 4, returnedQty: 1 }] };
    const fullyReturned = { status: 'Dipinjam', items: [{ qty: 4, returnedQty: 4, returnRequestedQty: 1 }] };

    assert.equal(evaluate(context, `pengembalianMenungguCek(${JSON.stringify(pending)})`), true);
    assert.equal(evaluate(context, `pengembalianMenungguCek(${JSON.stringify(noRequest)})`), false);
    assert.equal(evaluate(context, `pengembalianMenungguCek(${JSON.stringify(fullyReturned)})`), false);
    assert.equal(evaluate(context, `pengembalianMenungguCek({ status: 'Selesai', items: ${JSON.stringify(pending.items)} })`), false);
    assert.equal(evaluate(context, `qtyPengembalianValid(${JSON.stringify(pending.items[0])}, 2)`), true);
    assert.equal(evaluate(context, `qtyPengembalianValid(${JSON.stringify(pending.items[0])}, 3)`), false);
    assert.equal(evaluate(context, `qtyPengembalianValid(${JSON.stringify(pending.items[0])}, 0.5)`), false);
});

test('only mahasiswa can submit a loan request and multiple distinct tools are allowed', () => {
    const context = createCoreContext();
    const studentNim = evaluate(context, "db.users.find(user => user.role === 'Mahasiswa' && user.status === 'Aktif').nim");
    const lecturerNim = evaluate(context, "db.users.find(user => user.role === 'Dosen').nim");
    evaluate(context, 'db.fines = []; db.laporan = []; db.loans = []');

    const nonStudentError = evaluate(context, `cekPengajuan({ user: getUser('${lecturerNim}'), items: [] })`);
    const emptyRequestError = evaluate(context, `cekPengajuan({ user: getUser('${studentNim}'), items: [] })`);
    const multiToolResult = evaluate(context, `(() => {
        const tglAmbil = nextKerja(addDays(todayISO(), 3));
        const tglKembali = nextKerja(addDays(tglAmbil, 1));
        const request = {
            user: getUser('${studentNim}'),
            items: [{ toolId: 'TI-IOT-001', qty: 1 }, { toolId: 'TI-IOT-002', qty: 1 }],
            tujuanJenis: 'Praktikum', tujuan: 'Pengujian multi alat',
            tglAmbil, jamAmbil: '09:00', tglKembali, jamKembali: '15:00'
        };
        const error = cekPengajuan(request);
        return error || buatLoan(request, ST.MENUNGGU).items.length;
    })()`);
    const duplicateToolError = evaluate(context, `cekPengajuan({
        user: getUser('${studentNim}'),
        items: [{ toolId: 'TI-IOT-001', qty: 1 }, { toolId: 'TI-IOT-001', qty: 2 }]
    })`);

    assert.match(nonStudentError, /hanya dapat dilakukan oleh mahasiswa/);
    assert.equal(emptyRequestError, 'Pilih minimal satu alat.');
    assert.equal(multiToolResult, 2);
    assert.match(duplicateToolError, /Alat yang sama hanya boleh ditambahkan satu kali/);
});

test('booking conflict detection catches overlapping times but allows adjacent slots', () => {
    const context = createCoreContext();
    evaluate(context, `db.bookings = [{
        id: 'TEST-BKG', ruang: 'Lab Uji', tglMulai: '2026-10-20', tglSelesai: '2026-10-20',
        jamMulai: '09:00', jamSelesai: '11:00', status: 'Menunggu Persetujuan'
    }]`);

    assert.equal(evaluate(context, "bookingKonflik('Lab Uji', '2026-10-20', '2026-10-20', '10:00', '12:00', null, ['Menunggu Persetujuan']).length"), 1);
    assert.equal(evaluate(context, "bookingKonflik('Lab Uji', '2026-10-20', '2026-10-20', '11:00', '12:00', null, ['Menunggu Persetujuan']).length"), 0);
});

test('booking conflicts ignore overlapping weekend dates but still detect weekday overlaps', () => {
    const context = createCoreContext();
    evaluate(context, `db.bookings = [{
        id: 'TEST-WEEKEND', ruang: 'Lab Uji', tglMulai: '2026-10-24', tglSelesai: '2026-10-24',
        jamMulai: '09:00', jamSelesai: '11:00', status: 'Disetujui'
    }]`);

    assert.equal(evaluate(context, "bookingKonflik('Lab Uji', '2026-10-24', '2026-10-24', '10:00', '12:00', null, ['Disetujui']).length"), 0);
    evaluate(context, "db.bookings[0].tglMulai = '2026-10-26'; db.bookings[0].tglSelesai = '2026-10-26'");
    assert.equal(evaluate(context, "bookingKonflik('Lab Uji', '2026-10-23', '2026-10-26', '10:00', '12:00', null, ['Disetujui']).length"), 1);
});

test('payment pending admin verification blocks new loan requests until settled', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.role === 'Mahasiswa' && user.status === 'Aktif').nim");
    evaluate(context, `db.loans = []; db.laporan = []; db.fines = [{
        id: 'TEST-FINE', nim: '${nim}', loanId: 'TEST-LOAN', status: 'Menunggu Verifikasi', nominal: 5000
    }]`);

    const account = evaluate(context, `statusAkun('${nim}')`);
    const error = evaluate(context, `cekPengajuan({ user: getUser('${nim}'), items: [] })`);

    assert.equal(account.boleh, false);
    assert.equal(account.menungguVerifikasi, true);
    assert.match(error, /menunggu verifikasi Admin/);
});

test('high-value equipment duration cap also applies to final-project loans', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.role === 'Mahasiswa' && user.status === 'Aktif').nim");
    evaluate(context, `db.fines = []; db.laporan = []; db.loans = []; db.assets.find(asset => asset.id === 'TI-IOT-001').harga = db.policy.ambangTinggi`);
    const result = evaluate(context, `(() => {
        const tglAmbil = nextKerja(addDays(todayISO(), 4));
        const tglKembali = tambahHariKerja(tglAmbil, 1);
        return cekPengajuan({
            user: getUser('${nim}'), items: [{ toolId: 'TI-IOT-001', qty: 1 }],
            tujuanJenis: 'Proyek Akhir / Skripsi', tujuan: 'Uji durasi tugas akhir',
            tglAmbil, jamAmbil: '09:00', tglKembali, jamKembali: '15:00'
        });
    })()`);

    assert.match(result, /Alat bernilai tinggi maksimal 1 hari kerja/);
});
````

## File: index.html
````html
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOMPAS Lab - Login</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        navy: '#131C30',
                        teal: { 600: '#0D9488', 700: '#0F766E' },
                        graybg: '#F3F4F6'
                    },
                    fontFamily: { sans: ['Inter', 'sans-serif'] }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="style.css">
</head>
<body class="bg-graybg text-gray-800 font-sans min-h-screen flex">

    <div id="user-portal">
    <!-- ================= VIEW: LOGIN & REGISTER ================= -->
    <div id="view-login" class="fixed inset-0 bg-graybg z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl flex flex-col md:flex-row w-full max-w-4xl overflow-hidden min-h-[500px]">
            
            <!-- Branding Left (FUTURISTIC 3D VERSION) -->
            <div class="md:w-1/2 bg-navy p-10 flex flex-col justify-center items-center text-center relative overflow-hidden hidden md:flex">
                <!-- Background Glow FX -->
                <div class="absolute top-[-10%] right-[-10%] w-64 h-64 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                <div class="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                
                <!-- 3D Logo Container -->
                <div class="w-24 h-24 mb-6 rounded-3xl bg-gray-900 flex items-center justify-center p-3 shadow-2xl shadow-cyan-500/20 border border-gray-800 relative group z-10">
                    <div class="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-3xl opacity-30 blur-lg group-hover:opacity-50 transition-opacity"></div>
                    <svg class="w-full h-full relative z-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="mainNorth" x1="50" y1="15" x2="50" y2="50" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient>
                            <linearGradient id="mainSouth" x1="50" y1="50" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
                            <linearGradient id="mainRing" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="50%" stop-color="#818cf8"/><stop offset="100%" stop-color="#c084fc"/></linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="42" stroke="url(#mainRing)" stroke-width="3" stroke-dasharray="6 3" class="opacity-80"/>
                        <circle cx="50" cy="50" r="34" stroke="#334155" stroke-width="2"/>
                        <circle cx="50" cy="10" r="2.5" fill="#38bdf8"/>
                        <circle cx="90" cy="50" r="2.5" fill="#818cf8"/>
                        <circle cx="50" cy="90" r="2.5" fill="#334155"/>
                        <circle cx="10" cy="50" r="2.5" fill="#818cf8"/>
                        <g transform="rotate(45 50 50)">
                            <path d="M50 14 L60 50 L50 46 Z" fill="url(#mainNorth)"/>
                            <path d="M50 14 L40 50 L50 46 Z" fill="#0284c7"/>
                            <path d="M50 86 L60 50 L50 54 Z" fill="url(#mainSouth)"/>
                            <path d="M50 86 L40 50 L50 54 Z" fill="#334155"/>
                            <rect x="42" y="44" width="16" height="5" rx="1.5" fill="#06b6d4"/>
                            <rect x="42" y="51" width="16" height="5" rx="1.5" fill="#3b82f6"/>
                            <circle cx="54" cy="46.5" r="0.8" fill="#ffffff"/>
                            <circle cx="54" cy="53.5" r="0.8" fill="#ffffff"/>
                        </g>
                        <circle cx="50" cy="50" r="4" fill="#ffffff" filter="drop-shadow(0 0 4px #38bdf8)"/>
                    </svg>
                </div>

                <h1 class="text-3xl font-black text-white mb-3 relative z-10 tracking-wider">
                    KOMPAS<span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">LAB</span>
                </h1>
                <p class="text-gray-400 text-sm leading-relaxed relative z-10 px-6">
                    Sistem Informasi Manajemen Inventaris Alat Laboratorium IT.
                </p>
            </div>

            <!-- Form Area Right -->
            <div class="w-full md:w-1/2 p-8 md:p-12 relative flex flex-col justify-center overflow-y-auto">
                <!-- Alert Box -->
                <div id="auth-alert" class="hidden mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center transition-all">
                    <i id="auth-alert-icon" class="fas mr-2"></i>
                    <span id="auth-alert-msg"></span>
                </div>

                <!-- Form Login -->
                <div id="auth-form-login">
                    <div class="mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">Selamat Datang</h2>
                        <p class="text-sm text-gray-500 mt-1">Silakan masuk ke akun Anda</p>
                    </div>
                    <form onsubmit="handleLogin(event)" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">NPM / NIP / Email</label>
                            <input type="text" id="login-email" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="NPM/NIP atau Email">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Kata Sandi</label>
                            <input type="password" id="login-password" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="••••••••">
                            <div class="text-right mt-1">
                                <button type="button" onclick="toggleAuthMode('forgot')" class="text-xs text-teal-600 hover:underline font-medium">Lupa Kata Sandi?</button>
                            </div>
                        </div>
                        <button type="submit" class="w-full bg-teal-600 text-white font-bold rounded-lg py-3 hover:bg-teal-700 transition-colors shadow-md mt-2">
                            Masuk
                        </button>
                    </form>
                    <p class="text-center text-sm text-gray-600 mt-6">
                        Belum punya akun? <button onclick="toggleAuthMode('register')" class="text-teal-600 font-bold hover:underline">Daftar sekarang</button>
                    </p>
                </div>

                <!-- Form Register -->
                <div id="auth-form-register" class="hidden">
                    <div class="mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">Daftar Akun Baru</h2>
                        <p class="text-sm text-gray-500 mt-1">Akun dapat langsung digunakan setelah pendaftaran.</p>
                    </div>
                    <form onsubmit="handleRegister(event)" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Nama Lengkap</label>
                            <input type="text" id="reg-name" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="Budi Santoso">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">NPM / NIP</label>
                                <input type="text" id="reg-nim" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="198020...">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">Peran Pengguna</label>
<select id="reg-role" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600">
<option value="Mahasiswa">Mahasiswa</option>
</select>
                            </div>
                        </div>
                        <div>
<label class="block text-sm font-semibold text-gray-700 mb-1">Program Studi / Unit</label>
<select id="reg-prodi" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600"></select>
</div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                            <input type="email" id="reg-email" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="nama@student.uir.ac.id">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Kata Sandi</label>
                            <input type="password" id="reg-password" required class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="">
                        </div>
                        <button type="submit" class="w-full bg-navy text-white font-bold rounded-lg py-3 hover:bg-gray-800 transition-colors shadow-md mt-2">
                            Daftarkan Akun
                        </button>
                    </form>
                </div>

                <!-- Form Lupa Sandi -->
                <div id="auth-form-forgot" class="hidden">
                    <div class="mb-6">
                        <button onclick="toggleAuthMode('login')" class="text-gray-400 hover:text-gray-800 mb-4 inline-block"><i class="fas fa-arrow-left"></i> Kembali</button>
                        <h2 class="text-2xl font-bold text-gray-800">Lupa Kata Sandi</h2>
                        <p class="text-sm text-gray-500 mt-1">Cocokkan NPM/NIP dengan email terdaftar, lalu buat kata sandi baru. Permintaan reset tetap tercatat di menu Pengguna dan Peran.</p>
                        <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">Mode demo: kecocokan NPM/NIP dan email bukan verifikasi identitas. Jangan gunakan akun atau kata sandi nyata.</p>
                    </div>
                    <form onsubmit="handleForgotPassword(event)" class="space-y-4">
                        <div id="forgot-account-fields" class="space-y-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">NPM / NIP</label>
                                <input type="text" id="forgot-nim" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="NPM/NIP terdaftar">
                            </div>
                            <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">Email Kampus Terdaftar</label>
                                <input type="email" id="forgot-email" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" placeholder="nama@student.uir.ac.id">
                            </div>
                        </div>
                        <div id="forgot-new-password-fields" class="hidden space-y-4">
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">Kata Sandi Baru</label>
                                <input type="password" id="forgot-new-password" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" autocomplete="new-password">
                            </div>
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 mb-1">Konfirmasi Kata Sandi Baru</label>
                                <input type="password" id="forgot-confirm-password" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-600" autocomplete="new-password">
                            </div>
                        </div>
                        <button id="forgot-submit-button" type="submit" class="w-full bg-teal-600 text-white font-bold rounded-lg py-3 hover:bg-teal-700 transition-colors shadow-md mt-2">
                            Lanjutkan
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
<!-- ===== MAIN LAYOUT (SIDEBAR & CONTENT) ================= -->
    <div id="app-layout" class="flex w-full h-screen overflow-hidden hidden">
        <!-- Sidebar Navigation -->
        <div id="sidebar-overlay" class="hidden fixed inset-0 bg-black/50 z-30 lg:hidden" onclick="toggleSidebar()"></div>
        <aside id="sidebar" class="fixed lg:static inset-y-0 left-0 z-40 -translate-x-full lg:translate-x-0 transition-transform w-64 bg-navy text-gray-300 flex flex-col justify-between p-4 flex-shrink-0 h-screen overflow-y-auto">
            <div>
                <!-- LOGO BRAND KOMPAS LAB (FUTURISTIC 3D VERSION - SIDEBAR) -->
                <div class="flex items-center gap-3 px-3 py-4 mb-4 border-b border-gray-800">
                    <!-- Container Logo -->
                    <div class="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center p-1 shadow-lg shadow-cyan-500/10 border border-gray-700 relative group shrink-0">
                        <div class="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-xl opacity-20 blur-sm group-hover:opacity-40 transition-opacity"></div>
                        <svg class="w-full h-full relative z-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="sideNorth" x1="50" y1="15" x2="50" y2="50" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient>
                                <linearGradient id="sideSouth" x1="50" y1="50" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient>
                                <linearGradient id="sideRing" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="50%" stop-color="#818cf8"/><stop offset="100%" stop-color="#c084fc"/></linearGradient>
                            </defs>
                            <circle cx="50" cy="50" r="42" stroke="url(#sideRing)" stroke-width="3" stroke-dasharray="6 3" class="opacity-80"/>
                            <circle cx="50" cy="50" r="34" stroke="#334155" stroke-width="2"/>
                            <circle cx="50" cy="10" r="2.5" fill="#38bdf8"/>
                            <circle cx="90" cy="50" r="2.5" fill="#818cf8"/>
                            <circle cx="50" cy="90" r="2.5" fill="#334155"/>
                            <circle cx="10" cy="50" r="2.5" fill="#818cf8"/>
                            <g transform="rotate(45 50 50)">
                                <path d="M50 14 L60 50 L50 46 Z" fill="url(#sideNorth)"/>
                                <path d="M50 14 L40 50 L50 46 Z" fill="#0284c7"/>
                                <path d="M50 86 L60 50 L50 54 Z" fill="url(#sideSouth)"/>
                                <path d="M50 86 L40 50 L50 54 Z" fill="#334155"/>
                                <rect x="42" y="44" width="16" height="5" rx="1.5" fill="#06b6d4"/>
                                <rect x="42" y="51" width="16" height="5" rx="1.5" fill="#3b82f6"/>
                                <circle cx="54" cy="46.5" r="0.8" fill="#ffffff"/>
                                <circle cx="54" cy="53.5" r="0.8" fill="#ffffff"/>
                            </g>
                            <circle cx="50" cy="50" r="4" fill="#ffffff" filter="drop-shadow(0 0 4px #38bdf8)"/>
                        </svg>
                    </div>
                    <!-- Teks Brand Baru -->
                    <div class="flex flex-col">
                        <span class="font-black text-lg tracking-wide text-white leading-none mt-1">
                            KOMPAS<span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">LAB</span>
                        </span>
                        <span class="text-[9px] text-gray-400 font-medium tracking-wider uppercase mt-1">Sistem Inventaris</span>
                    </div>
                </div>

                <nav class="space-y-1">
                    <button id="nav-dashboard" onclick="switchView('dashboard')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white active">
                        <i class="fas fa-home w-5"></i> Beranda
                    </button>
                    <button id="nav-catalog" onclick="switchView('catalog')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-desktop w-5"></i> Katalog Alat
                    </button>
                    <button id="nav-peminjaman" onclick="switchView('peminjaman')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-hand-holding w-5"></i> Peminjaman Alat
                    </button>
                    <button id="nav-booking" onclick="switchView('booking')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-door-open w-5"></i> Booking Ruang Lab
                    </button>
                    <button id="nav-pengembalian" onclick="switchView('pengembalian')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-clipboard-list w-5"></i> Peminjaman Saya
                    </button>
                    <button id="nav-laporan" onclick="switchView('laporan')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-history w-5"></i> Riwayat
                    </button>
                    
                    <div class="pt-4 mt-2 border-t border-gray-800"></div>
                    <span class="px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Layanan Lain</span>
                    
                    <button id="nav-pelaporan" onclick="switchView('pelaporan')" class="w-full mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-exclamation-triangle w-5 text-amber-500"></i> Lapor Kendala
                    </button>
                    <button id="nav-aturan" onclick="switchView('aturan')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-book w-5 text-sky-400"></i> Aturan Peminjaman
                    </button>
                    <button id="nav-sanksi" onclick="switchView('sanksi')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-file-invoice-dollar w-5 text-rose-500"></i> Sanksi & Denda
                    </button>
                    <button id="nav-bantuan" onclick="switchView('bantuan')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-question-circle w-5"></i> Bantuan & FAQ
                    </button>
                    <button id="nav-profil" onclick="switchView('profil')" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                        <i class="fas fa-user-cog w-5"></i> Profil & Akun
                    </button>
                </nav>
            </div>

            <!-- User Info & Logout Button -->
            <div class="pt-4 mt-4 border-t border-gray-800">
                <div class="flex items-center justify-between mb-3 px-2">
                    <div class="flex items-center gap-3">
                        <div id="user-avatar" class="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center font-bold text-white text-sm">MS</div>
                        <div>
                            <p id="user-display-name" class="text-sm font-semibold text-white truncate max-w-[110px]">Mahasiswa TI</p>
                            <p class="text-xs text-gray-500" id="user-status">Mahasiswa</p>
                        </div>
                    </div>
                </div>
                <button onclick="handleLogout()" class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg text-xs font-semibold transition-colors">
                    <i class="fas fa-sign-out-alt"></i> Keluar
                </button>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 flex flex-col min-w-0 h-screen">
            <!-- Header Bar -->
            <!-- ================= HEADER BAR ================= -->
        <header class="bg-white border-b border-gray-100 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
            <div class="flex items-center gap-3"><button onclick="toggleSidebar()" class="lg:hidden text-gray-500" aria-label="Menu"><i class="fas fa-bars text-lg"></i></button><h1 id="page-title" class="text-lg md:text-xl font-bold text-gray-800">Beranda</h1></div>
            <div class="flex items-center gap-4">
                <div class="relative hidden md:block">
<input type="text" id="global-search" oninput="onGlobalSearch(this.value)" placeholder="Cari alat di katalog..." class="bg-gray-100 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 w-64">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
                <!-- Notifikasi -->
            <div class="relative" id="notif-wrapper">
                <button onclick="toggleNotifPanel(event)" class="relative p-2 text-gray-400 hover:text-teal-600 transition-colors" title="Notifikasi">
                    <i class="fas fa-bell text-lg"></i>
                    <span id="notif-badge" class="hidden absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">0</span>
                </button>

                <div id="notif-panel" class="hidden absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <h4 class="text-sm font-bold text-gray-800">Notifikasi</h4>
                        <button onclick="markAllNotifRead()" class="text-xs text-teal-600 hover:underline font-semibold">Tandai semua dibaca</button>
                    </div>
                    <div id="notif-list" class="max-h-80 overflow-y-auto divide-y divide-gray-100"></div>
                </div>
            </div>
            </div>
        </header>

                    <!-- Dynamic Views Container -->
            <div class="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto relative">
                
                <!-- Notifikasi Toast (Global) -->
                <div id="global-toast" class="hidden fixed top-20 right-4 md:right-8 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 transition-opacity">
                    <i id="toast-icon" class="fas fa-check-circle text-green-400"></i>
                    <span id="toast-msg" class="text-sm font-medium">Tindakan berhasil!</span>
                </div>

                <!-- VIEW: DASHBOARD -->
                <section id="view-dashboard" class="space-y-6">
<div id="dash-alert" class="hidden"></div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div class="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <p class="text-xs text-gray-400 uppercase font-semibold mb-1">Total Aset</p>
                            <h3 id="stat-total" class="text-2xl font-bold text-gray-800">0</h3>
                        </div>
                        <div class="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <p class="text-xs text-gray-400 uppercase font-semibold mb-1">Tersedia</p>
                            <h3 id="stat-available" class="text-2xl font-bold text-teal-600">0</h3>
                        </div>
                        <div class="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <p class="text-xs text-gray-400 uppercase font-semibold mb-1">Sedang Dipinjam</p>
                            <h3 id="stat-borrowed" class="text-2xl font-bold text-amber-500">0</h3>
                        </div>
                        <div class="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <p class="text-xs text-gray-400 uppercase font-semibold mb-1">Perbaikan</p>
                            <h3 id="stat-repair" class="text-2xl font-bold text-rose-500">0</h3>
                        </div>
                    </div>
                    <!-- Hero Banner & Informasi Lab (Pengganti Grafik) -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        <!-- Banner Hero / Slogan & Quick Actions -->
                        <div class="lg:col-span-2 bg-gradient-to-r from-teal-600 to-slate-900 p-6 rounded-2xl text-white shadow-md flex flex-col justify-between relative overflow-hidden">
                            <div class="relative z-10 max-w-lg">
                                <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold tracking-wide uppercase text-teal-100 mb-3 inline-block">
                                    <i class="fas fa-microchip mr-1"></i> Sistem Inventaris & Fasilitas Lab TI
                                </span>
                                <h2 class="text-2xl font-bold mb-2">Pinjam Alat & Booking Ruang Lab Tanpa Ribet!</h2>
                                <p class="text-teal-100 text-sm mb-5 leading-relaxed">
                                    Akses kebutuhan praktikum, riset, dan kegiatan komputasi kamu dalam satu pintu. Cepat, transparan, dan terintegrasi secara digital.
                                </p>
                                <div class="flex flex-wrap gap-3">
                                    <button onclick="switchView('catalog')" class="px-4 py-2.5 bg-white text-teal-800 rounded-xl font-bold text-xs hover:bg-teal-50 transition shadow-sm flex items-center gap-2">
                                        <i class="fas fa-boxes"></i> Jelajahi Katalog Alat
                                    </button>
                                    <button onclick="switchView('booking')" class="px-4 py-2.5 bg-teal-500/30 border border-white/30 text-white rounded-xl font-bold text-xs hover:bg-white/10 transition flex items-center gap-2">
                                        <i class="fas fa-door-open"></i> Booking Ruang Lab
                                    </button>
                                </div>
                            </div>
                            <!-- Ornamen Dekoratid Icon Background -->
                            <div class="absolute -right-6 -bottom-6 text-white/10 text-9xl pointer-events-none select-none">
                                <i class="fas fa-laptop-code"></i>
                            </div>
                        </div>

                        <!-- Info Operasional & Tata Tertib Singkat -->
                        <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="flex items-center justify-between mb-3">
                                    <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
                                        <i class="fas fa-bullhorn text-teal-600"></i> Informasi & Jam Layanan
                                    </h3>
                                    <span class="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" title="Status Lab Operasional"></span>
                                </div>
                                <div class="space-y-3 text-xs">
                                    <div class="p-3 bg-teal-50/60 rounded-xl border border-teal-100 text-teal-900">
                                        <p class="font-semibold text-teal-800 mb-0.5"><i class="far fa-clock mr-1"></i> Jam Operasional Lab</p>
                                        <p id="info-jam" class="text-gray-600">Senin - Jumat: 08.00 - 16.00 WIB</p>
                                    </div>
                                    <div class="p-3 bg-amber-50/60 rounded-xl border border-amber-100 text-amber-900">
                                        <p class="font-semibold text-amber-800 mb-0.5"><i class="fas fa-exclamation-triangle mr-1"></i> Aturan Pengembalian</p>
                                        <p class="text-gray-600">Serahkan alat langsung ke Admin dan tunjukkan bukti peminjaman saat mengembalikan unit.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                        <h3 class="font-bold text-gray-800 mb-4 text-sm">Transaksi Terbaru Anda</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm">
                                <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th class="py-3 px-4">Nama Alat</th>
                                        <th class="py-3 px-4">Tanggal Pengajuan</th>
                                        <th class="py-3 px-4">Status Pengajuan</th>
                                    </tr>
                                </thead>
                                <tbody id="recent-transactions-table" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- VIEW: KATALOG ALAT -->
                <section id="view-catalog" class="hidden space-y-6">
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div id="cat-filters" class="flex flex-wrap gap-2"></div>
                <input type="text" id="cat-search" oninput="onCatSearch(this.value)" placeholder="Cari nama, kode, atau lokasi..." class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-600 w-full md:w-72">
            </div>
            <div id="catalog-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6"></div>
            <div id="empty-state" class="hidden text-center py-12 text-gray-400">Alat tidak ditemukan.</div>
        </section>

                <!-- VIEW: DETAIL ALAT -->
                <section id="view-detail" class="hidden bg-white rounded-xl border border-gray-100 p-4 md:p-8 shadow-sm">
            <button onclick="switchView('catalog')" class="text-sm text-teal-600 font-semibold hover:underline flex items-center gap-2 mb-6"><i class="fas fa-arrow-left"></i> Kembali ke Katalog</button>
            <div class="flex flex-col md:flex-row gap-8">
                <div class="w-full md:w-1/3 bg-gray-50 rounded-2xl p-8 flex flex-col items-center justify-center border border-gray-100">
                    <i id="detail-icon" class="fas fa-desktop text-8xl text-teal-600"></i>
                </div>
                <div class="flex-1 space-y-5">
                    <div class="flex justify-between items-start gap-3">
                        <div><h2 id="detail-title" class="text-2xl md:text-3xl font-bold text-gray-800">Nama Alat</h2><p id="detail-id" class="text-sm text-gray-400 font-mono mt-1">ID-ALAT</p></div>
                        <span id="detail-status" class="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">TERSEDIA</span>
                    </div>
                    <p class="text-sm text-gray-600 leading-relaxed"><strong>Spesifikasi:</strong> <span id="detail-spek">-</span></p>
                    <p id="detail-rules" class="text-sm text-gray-600 leading-relaxed border-y border-gray-100 py-4"></p>
                    <div class="grid grid-cols-2 gap-4 py-2 text-sm">
                        <div><p class="text-gray-400">Kategori</p><p id="detail-category" class="font-semibold text-gray-700">-</p></div>
                        <div><p class="text-gray-400">Lokasi Lab</p><p id="detail-location" class="font-semibold text-gray-700">-</p></div>
                        <div><p class="text-gray-400">Kondisi Unit</p><p id="detail-kondisi" class="font-semibold text-gray-700">-</p></div>
                        <div><p class="text-gray-400">Stok Tersedia</p><p id="detail-available" class="font-bold text-teal-600 text-lg">-</p></div>
                    </div>
                    <div class="pt-2 flex gap-3">
                        <button id="btn-pinjam-detail" class="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"><i class="fas fa-clipboard-list"></i> Ajukan Peminjaman</button>
                    </div>
                </div>
            </div>
        </section>

                <!-- VIEW: PEMINJAMAN ALAT -->
                <section id="view-peminjaman" class="hidden bg-white p-4 md:p-8 rounded-xl border border-gray-100 shadow-sm max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-gray-800 mb-2">Formulir Pengajuan Peminjaman</h2>
            <p class="text-sm text-gray-500 mb-4">Peminjaman hanya untuk mahasiswa. Pilih satu atau beberapa jenis alat dari katalog, tentukan jumlah tiap alat dan jadwal, lalu kirim satu pengajuan untuk ditinjau Admin. Baca <button type="button" onclick="switchView('aturan')" class="text-teal-600 font-semibold hover:underline">aturan peminjaman</button> sebelum mengajukan.</p>
            <form id="form-peminjaman" onsubmit="handlePeminjamanSubmit(event)" class="space-y-5">
                <div class="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                        <label class="block text-xs font-bold text-gray-700">Alat yang Dipinjam</label>
                        <button type="button" onclick="switchView('catalog')" class="text-xs font-semibold text-teal-700 hover:underline">Kembali ke Katalog</button>
                    </div>
                    <div id="pinjam-items" class="space-y-2"></div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1">Tipe Peminjaman</label>
                    <select id="pinjam-tipe" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 bg-gray-50">
                        <option value="Individu">Individu</option>
                        <option value="Kelompok / Kelas (1 Penanggung Jawab)">Kelompok / Kelas (1 Penanggung Jawab)</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <p class="col-span-2 text-xs font-bold text-gray-700">2. Atur jadwal ambil, jadwal kembali, dan tujuan peminjaman</p>
                    <div><label class="block text-xs font-bold text-gray-700 mb-1">Tanggal Ambil</label><input type="date" id="pinjam-tgl-pinjam" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></div>
                    <div><label class="block text-xs font-bold text-gray-700 mb-1">Jam Ambil</label><input type="time" id="pinjam-jam-pinjam" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></div>
                    <div><label class="block text-xs font-bold text-gray-700 mb-1">Tanggal Kembali</label><input type="date" id="pinjam-tgl-kembali" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></div>
                    <div><label class="block text-xs font-bold text-gray-700 mb-1">Jam Kembali</label><input type="time" id="pinjam-jam-kembali" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1">Tujuan Peminjaman</label>
                    <select id="pinjam-tujuan-jenis" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 mb-2"></select>
                    <textarea id="pinjam-tujuan" rows="2" required placeholder="Detail tujuan..." class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></textarea>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1">Surat Pengantar (wajib untuk proyek tugas akhir)</label>
                    <input type="file" id="pinjam-surat" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" class="w-full border rounded-lg px-3 py-2 text-sm outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100">
                    <p class="mt-1 text-[11px] text-gray-400">PDF, DOC, DOCX, JPG, PNG, GIF, atau WEBP; ukuran maksimal 1 MB. Admin dapat mengunduh lampiran pada pengajuan.</p>
                </div>
                <div class="flex items-start gap-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                    <input type="checkbox" id="syarat" required class="mt-1">
                    <label for="syarat" class="text-xs text-yellow-800 leading-tight"><span class="font-bold">3. Periksa dan kirim:</span> <span id="syarat-teks"></span> Ringkasan pengajuan akan ditampilkan sebelum dikirim.</label>
                </div>
                <button type="submit" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg text-sm transition-colors shadow-md">Tinjau &amp; Kirim Pengajuan</button>
            </form>
        </section>

                <!-- VIEW: PENGEMBALIAN ALAT -->
                <section id="view-pengembalian" class="hidden space-y-4">
            <div class="bg-white p-4 md:p-6 rounded-xl border border-gray-100 shadow-sm">
                <h3 class="font-bold text-gray-800 mb-4 text-sm">Peminjaman Aktif dan Pengembalian</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100"><tr><th class="py-3 px-4">Alat</th><th class="py-3 px-4">Jatuh Tempo</th><th class="py-3 px-4">Status</th><th class="py-3 px-4">Aksi</th></tr></thead>
                        <tbody id="pengembalian-table" class="divide-y divide-gray-100"></tbody>
                    </table>
                </div>
            </div>
        </section>

                <!-- VIEW: LAPORAN / RIWAYAT -->
                <section id="view-laporan" class="hidden space-y-6">
                    <!-- Riwayat Peminjaman Alat -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-boxes text-teal-600 mr-2"></i>Riwayat Peminjaman Alat Anda</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th class="px-6 py-4">ID Transaksi</th>
                                        <th class="px-6 py-4">Nama Alat</th>
                                        <th class="px-6 py-4">Tujuan</th>
                                        <th class="px-6 py-4">Tgl Pinjam</th>
                                        <th class="px-6 py-4">Tgl Kembali</th>
                                        <th class="px-6 py-4">Status Pengajuan</th>
                                    </tr>
                                </thead>
                                <tbody id="laporan-table" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Riwayat Booking Ruang Lab -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-door-open text-teal-600 mr-2"></i>Riwayat Booking Ruang Lab</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th class="px-6 py-4">ID Booking</th>
                                        <th class="px-6 py-4">Ruang Lab</th>
                                        <th class="px-6 py-4">Tujuan</th>
                                        <th class="px-6 py-4">Tanggal Praktikum/Kegiatan</th>
                                        <th class="px-6 py-4">Jam</th>
                                        <th class="px-6 py-4">Status</th>
                                        <th class="px-6 py-4">Catatan</th>
                                    </tr>
                                </thead>
                                <tbody id="booking-history-table" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                                <!-- VIEW: BOOKING RUANG LAB -->
                                <section id="view-booking" class="hidden max-w-6xl mx-auto">
                                                    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        <!-- Form Booking -->
                        <div class="lg:col-span-3 bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                            <h2 class="text-xl font-bold text-gray-800 mb-2">Booking Ruang Laboratorium</h2>
                            <p class="text-sm text-gray-500 mb-6">Cek jadwal terisi pada kalender, lalu ajukan pemakaian ruang lab untuk kegiatan perkuliahan, lomba, atau penelitian. Baca <button type="button" onclick="switchView('aturan')" class="text-teal-600 font-semibold hover:underline">aturan booking</button> sebelum mengajukan.</p>

                            <form id="form-booking" onsubmit="handleBookingSubmit(event)" class="space-y-5">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Pilih Ruang Lab</label>
                                    <select id="booking-ruang" onchange="onRuangBookingChange()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 bg-white"><option value="">-- Pilih Ruang --</option></select>
                                    <p id="booking-kapasitas-info" class="text-[11px] text-gray-400 mt-1"></p>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Tanggal Mulai</label>
                                        <input type="date" id="booking-tgl-mulai" onchange="onTglMulaiBooking()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Tanggal Selesai</label>
                                        <input type="date" id="booking-tgl-selesai" onchange="cekBentrokLive()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                </div>

                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Jam Mulai</label>
                                        <input type="time" id="booking-jam-mulai" min="08:00" max="16:00" onchange="cekBentrokLive()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Jam Selesai</label>
                                        <input type="time" id="booking-jam-selesai" min="08:00" max="16:00" onchange="cekBentrokLive()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                </div>
                                <p id="bk-hint" class="text-[11px] text-gray-400 -mt-3"></p>

                                <!-- Status bentrok (diisi JS) -->
                                <div id="booking-info" class="hidden"></div>

                                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Jumlah Peserta</label>
                                        <input type="number" id="booking-peserta" min="1" required placeholder="Contoh: 20" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Penanggung Jawab</label>
                                        <input type="text" id="booking-pj" required placeholder="Nama lengkap" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                    <div>
                                        <label class="block text-xs font-bold text-gray-700 mb-1">Kontak PJ (HP/WA)</label>
                                        <input type="tel" id="booking-pj-kontak" required placeholder="08xxxxxxxxxx" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Tujuan Penggunaan (Mata Kuliah / Acara)</label>
                                    <textarea id="booking-tujuan" rows="3" required placeholder="Jelaskan secara singkat tujuan pemakaian ruang..." class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"></textarea>
                                </div>

                                <button type="submit" class="w-full bg-navy hover:bg-gray-800 text-white font-bold py-3 rounded-lg text-sm transition-colors shadow-md">
                                    Ajukan Jadwal Booking
                                </button>
                            </form>
                        </div>

                        <!-- Kalender Jadwal Ruang -->
                        <div class="lg:col-span-2 space-y-4">
                            <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                <div class="flex items-center justify-between mb-4">
                                    <h3 class="font-bold text-gray-800 text-sm"><i class="far fa-calendar-alt text-teal-600 mr-2"></i>Kalender Jadwal Ruang</h3>
                                    <div class="flex items-center gap-1">
                                        <button type="button" onclick="geserKalenderBooking(-1)" class="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500"><i class="fas fa-chevron-left text-xs"></i></button>
                                        <span id="booking-kalender-judul" class="text-xs font-bold text-gray-700 w-28 text-center">-</span>
                                        <button type="button" onclick="geserKalenderBooking(1)" class="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500"><i class="fas fa-chevron-right text-xs"></i></button>
                                    </div>
                                </div>
                                <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                                    <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span class="text-gray-300">Sab</span><span class="text-gray-300">Min</span>
                                </div>
                                <div id="booking-kalender-grid" class="grid grid-cols-7 gap-1"></div>
                                <div class="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                                    <span><span class="inline-block w-2.5 h-2.5 rounded bg-rose-200 mr-1"></span>Terisi (disetujui)</span>
                                    <span><span class="inline-block w-2.5 h-2.5 rounded bg-amber-200 mr-1"></span>Menunggu persetujuan</span>
                                </div>
                            </div>

                            <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                                <h3 id="booking-jadwal-judul" class="font-bold text-gray-800 text-sm mb-3">Jadwal ruang</h3>
                                <div id="booking-jadwal-list" class="space-y-2"></div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                        <div class="border-b border-gray-100 bg-gray-50 p-4">
                            <h3 class="text-sm font-bold text-gray-800"><i class="fas fa-clipboard-list mr-2 text-teal-600"></i>Booking Saya</h3>
                            <p class="mt-1 text-xs text-gray-500">Halaman utama untuk memantau booking dan melakukan pembatalan sebelum tanggal mulai. Riwayat hanya menampilkan ringkasan tanpa tindakan.</p>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="border-b border-gray-100 bg-gray-50 font-medium text-gray-500"><tr><th class="px-4 py-3">Booking</th><th class="px-4 py-3">Jadwal</th><th class="px-4 py-3">Status / Tindakan</th></tr></thead>
                                <tbody id="booking-my-table" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- VIEW: PELAPORAN KENDALA -->
                <section id="view-pelaporan" class="hidden space-y-6 max-w-4xl mx-auto">

                    <!-- Judul & alur singkat -->
                    <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <h2 class="text-xl font-bold text-gray-800 mb-1">Lapor Kerusakan / Kendala Alat</h2>
                        <p class="text-sm text-gray-500 mb-5">Gunakan form ini jika alat rusak, hilang, atau bermasalah. Jangan membongkar atau memperbaiki alat sendiri.</p>
                        <ol class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                            <li class="flex items-start gap-2"><span class="w-6 h-6 shrink-0 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center">1</span><span><b class="text-gray-800">Isi laporan</b><br><span class="text-gray-500">Pilih alat, jelaskan masalah, unggah foto.</span></span></li>
                            <li class="flex items-start gap-2"><span class="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">2</span><span><b class="text-gray-800">Ditinjau admin</b><br><span class="text-gray-500">Admin memeriksa laporan Anda.</span></span></li>
                            <li class="flex items-start gap-2"><span class="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center">3</span><span><b class="text-gray-800">Perbaikan</b><br><span class="text-gray-500">Alat diperbaiki atau diganti.</span></span></li>
                            <li class="flex items-start gap-2"><span class="w-6 h-6 shrink-0 rounded-full bg-green-600 text-white font-bold flex items-center justify-center">4</span><span><b class="text-gray-800">Selesai</b><br><span class="text-gray-500">Anda dapat notifikasi di lonceng.</span></span></li>
                        </ol>
                    </div>

                    <!-- Panel sukses (diisi JS setelah laporan terkirim) -->
                    <div id="lapor-sukses" class="hidden bg-green-50 border border-green-200 rounded-xl p-5"></div>

                    <!-- Form laporan -->
                    <div class="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <h3 class="font-bold text-gray-800 text-sm mb-5 border-b pb-2">Form Laporan Baru</h3>
                        <form id="form-lapor" onsubmit="handleLaporSubmit(event)" class="space-y-5">

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Alat yang Bermasalah <span class="text-rose-500">*</span></label>
                                <select id="lapor-alat" onchange="updateLaporForm()" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 bg-white">
                                    <option value="">-- Pilih Alat --</option>
                                </select>
                                <p class="text-[11px] text-gray-400 mt-1">Alat yang sedang Anda pinjam ada di kelompok paling atas.</p>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Jenis Kendala <span class="text-rose-500">*</span></label>
                                    <select id="lapor-jenis" onchange="updateLaporForm()" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 bg-white">
                                        <option>Rusak Fisik</option>
                                        <option>Tidak Menyala / Error</option>
                                        <option>Performa Tidak Normal</option>
                                        <option>Komponen Kurang / Tidak Lengkap</option>
                                        <option>Alat / Komponen Hilang</option>
                                        <option>Lainnya</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Ditemukan Saat <span class="text-rose-500">*</span></label>
                                    <select id="lapor-ditemukan" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 bg-white">
                                        <option>Saat mengambil alat</option>
                                        <option>Saat sedang digunakan</option>
                                        <option>Saat akan mengembalikan</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Info dinamis sesuai jenis kendala -->
                            <div id="lapor-info" class="text-xs rounded-lg border px-4 py-3 leading-relaxed"></div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-2">Tingkat Keparahan <span class="text-rose-500">*</span></label>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <label class="flex items-start gap-2 border rounded-lg p-3 cursor-pointer hover:border-teal-600 text-xs">
                                        <input type="radio" name="lapor-tingkat" value="Ringan" class="mt-0.5 accent-teal-600">
                                        <span><b class="text-gray-800">Ringan</b><br><span class="text-gray-500">Alat masih bisa dipakai normal.</span></span>
                                    </label>
                                    <label class="flex items-start gap-2 border rounded-lg p-3 cursor-pointer hover:border-teal-600 text-xs">
                                        <input type="radio" name="lapor-tingkat" value="Sedang" class="mt-0.5 accent-teal-600">
                                        <span><b class="text-gray-800">Sedang</b><br><span class="text-gray-500">Fungsi terganggu, masih bisa dipakai terbatas.</span></span>
                                    </label>
                                    <label class="flex items-start gap-2 border rounded-lg p-3 cursor-pointer hover:border-teal-600 text-xs">
                                        <input type="radio" name="lapor-tingkat" value="Berat" class="mt-0.5 accent-teal-600">
                                        <span><b class="text-gray-800">Berat</b><br><span class="text-gray-500">Alat tidak bisa dipakai sama sekali.</span></span>
                                    </label>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Tanggal Kejadian <span class="text-rose-500">*</span></label>
                                    <input type="date" id="lapor-tgl" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-700 mb-1">Jumlah Unit Terdampak <span class="text-rose-500">*</span></label>
                                    <input type="number" id="lapor-jumlah" min="1" value="1" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                    <p id="lapor-jumlah-info" class="text-[11px] text-gray-400 mt-1">Pilih alat terlebih dahulu</p>
                                </div>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Deskripsi Detail <span class="text-rose-500">*</span></label>
                                <textarea id="lapor-deskripsi" rows="4" required minlength="20" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600" placeholder="Apa yang terjadi? Kapan mulai terjadi? Apa yang sedang Anda lakukan saat itu? (minimal 20 karakter)"></textarea>
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-gray-700 mb-1">Foto Bukti Kendala <span id="lapor-foto-label" class="font-normal text-gray-400">(wajib)</span></label>
                                <input type="file" id="lapor-foto" accept="image/*" onchange="previewLaporFoto(event)" class="w-full border rounded-lg px-3 py-2 text-sm outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100">
                                <p class="text-[11px] text-gray-400 mt-1">JPG / PNG, maksimal 2 MB.</p>
                                <img id="lapor-foto-preview" src="" alt="Pratinjau foto kendala" class="hidden mt-3 max-h-48 rounded-lg border object-contain">
                            </div>

                            <label class="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                                <input type="checkbox" id="lapor-setuju" required class="mt-0.5 accent-teal-600">
                                <span>Saya menyatakan informasi di atas benar. Penilaian kerusakan akibat kelalaian dilakukan oleh admin.</span>
                            </label>

                            <button type="submit" class="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-md">
                                <i class="fas fa-paper-plane mr-1"></i> Kirim Laporan
                            </button>
                        </form>
                    </div>

                    <!-- Riwayat laporan -->
                    <div id="lapor-riwayat" class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 class="font-bold text-gray-800 text-sm"><i class="fas fa-clipboard-list text-teal-600 mr-2"></i>Riwayat Laporan Saya</h3>
                            <span id="lapor-ringkasan" class="text-xs text-gray-500">Total 0 | Diproses 0 | Selesai 0</span>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th class="px-6 py-3">ID</th>
                                        <th class="px-6 py-3">Alat</th>
                                        <th class="px-6 py-3">Kendala</th>
                                        <th class="px-6 py-3">Tgl Kejadian</th>
                                        <th class="px-6 py-3">Status</th>
                                        <th class="px-6 py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody id="lapor-tabel" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                                <!-- VIEW: SANKSI & DENDA -->
                <section id="view-sanksi" class="hidden space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Status Akun (diisi JS) -->
                        <div id="akun-card" class="p-6 rounded-xl border shadow-sm bg-white border-green-200">
                            <div class="flex items-center gap-4 mb-4">
                                <div id="akun-icon" class="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-green-100 text-green-600"><i class="fas fa-check"></i></div>
                                <div>
                                    <h3 class="font-bold text-gray-800">Status Akun</h3>
                                    <p id="akun-judul" class="text-sm font-semibold text-green-600">Aman</p>
                                </div>
                            </div>
                            <p id="akun-pesan" class="text-xs text-gray-600"></p>
                            <p id="akun-counter" class="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100"></p>
                        </div>

                        <!-- Total Denda (diisi JS) -->
                        <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                            <h3 class="font-bold text-gray-800 mb-1">Total Denda Belum Dibayar</h3>
                            <p id="denda-total" class="text-3xl font-bold text-gray-800">Rp 0</p>
                            <p id="denda-keterangan" class="text-xs text-gray-500 mt-2"></p>
                            <p id="denda-tarif" class="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100"></p>
                        </div>
                    </div>

                    <!-- Riwayat Denda -->
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div class="p-4 border-b border-gray-100 bg-gray-50">
                            <h3 class="font-bold text-gray-800 text-sm">Riwayat Tanggungan & Denda</h3>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-left text-sm text-gray-600">
                                <thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                    <tr>
                                        <th class="px-6 py-3">ID Denda</th>
                                        <th class="px-6 py-3">Alat</th>
                                        <th class="px-6 py-3">Keterlambatan</th>
                                        <th class="px-6 py-3">Nominal</th>
                                        <th class="px-6 py-3">Status</th>
                                        <th class="px-6 py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody id="denda-tabel" class="divide-y divide-gray-100"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Surat Keterangan Bebas Tanggungan -->
                    <div class="flex justify-between items-center bg-teal-50 p-4 rounded-xl border border-teal-100">
                        <div>
                            <h4 class="text-sm font-bold text-teal-800">Surat Keterangan Bebas Tanggungan Lab</h4>
                            <p class="text-xs text-teal-600">Dapat diunduh sebagai syarat kelulusan/skripsi setelah semua alat kembali dan denda lunas.</p>
                        </div>
                        <button onclick="unduhSuratBebas()" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors">
                            <i class="fas fa-file-download mr-1"></i> Unduh PDF
                        </button>
                    </div>
                </section>
                
                <!-- VIEW: ATURAN PEMINJAMAN -->
                <section id="view-aturan" class="hidden space-y-6 max-w-5xl mx-auto"><div id="aturan-konten" class="space-y-6"></div></section>

                <!-- VIEW: BANTUAN & FAQ -->
                <section id="view-bantuan" class="hidden space-y-6 max-w-4xl mx-auto">
                    <div class="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <h2 class="text-xl font-bold text-gray-800 mb-6 border-b pb-4">Bantuan & Frequently Asked Questions (FAQ)</h2>
                        
                        <div class="space-y-4">
                            <details class="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                                <summary class="font-semibold text-sm text-gray-800 list-none flex justify-between items-center">
                                    Bagaimana cara meminjam alat?
                                    <i class="fas fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
                                </summary>
                                <p class="text-sm text-gray-600 mt-3 pl-2 border-l-2 border-teal-500">Mahasiswa memilih alat dari <strong>Katalog Alat</strong>, menekan <strong>Ajukan Pinjam</strong>, lalu menambahkan alat lain melalui tombol <strong>Tambah alat dari katalog</strong> bila diperlukan. Atur jumlah tiap alat, lengkapi jadwal dan tujuan, kemudian kirim satu pengajuan. Batas jenis alat aktif mengikuti aturan yang berlaku. Setelah dikirim, pantau status di menu <strong>Peminjaman Saya</strong>. Jika disetujui, datang ke ruang Admin pada jadwal yang tertera dan tunjukkan bukti berkode pengambilan.</p>
                            </details>
                            <details class="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                                <summary class="font-semibold text-sm text-gray-800 list-none flex justify-between items-center">
                                    Bagaimana jika alat rusak saat saya pakai?
                                    <i class="fas fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
                                </summary>
                                <p class="text-sm text-gray-600 mt-3 pl-2 border-l-2 border-teal-500">Gunakan menu <strong>Lapor Kendala</strong>, pilih alat yang bermasalah, jelaskan kerusakan, dan unggah foto. Jangan mencoba memperbaiki sendiri. Admin akan menghubungi Anda bila diperlukan.</p>
                            </details>
                            <details class="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                                <summary class="font-semibold text-sm text-gray-800 list-none flex justify-between items-center">
                                    Berapa denda keterlambatan?
                                    <i class="fas fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
                                </summary>
                                <p id="faq-denda" class="text-sm text-gray-600 mt-3 pl-2 border-l-2 border-teal-500"></p>
                            </details>
                            <details class="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                                <summary class="font-semibold text-sm text-gray-800 list-none flex justify-between items-center">
                                    Bagaimana cara membatalkan pinjaman?
                                    <i class="fas fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
                                </summary>
                                <p class="text-sm text-gray-600 mt-3 pl-2 border-l-2 border-teal-500">Buka menu <strong>Peminjaman Saya</strong>. Pengajuan hanya dapat dibatalkan saat masih <strong>Menunggu Persetujuan</strong> atau <strong>Siap Diambil</strong>, sebelum alat diserahkan Admin.</p>
                            </details>
                            <details class="group bg-gray-50 p-4 rounded-lg cursor-pointer">
                                <summary class="font-semibold text-sm text-gray-800 list-none flex justify-between items-center">
                                    Bagaimana cara mengembalikan alat?
                                    <i class="fas fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
                                </summary>
                                <p class="text-sm text-gray-600 mt-3 pl-2 border-l-2 border-teal-500">Bawa alat dan bukti peminjaman ke ruang Admin pada jam layanan, lalu tekan <strong>Ajukan Pengembalian</strong> di menu <strong>Peminjaman Saya</strong>. Admin memeriksa kelengkapan dan kondisi alat sebelum transaksi dinyatakan selesai.</p>
                            </details>
                        </div>
                        <div class="border-t border-gray-100 pt-6 flex flex-col items-center justify-center text-center">
                            <p class="text-sm text-gray-600 mb-3">Masih butuh bantuan? Hubungi admin lab.</p>
                            <a id="btn-wa-admin" href="#" target="_blank" rel="noopener" class="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold text-sm shadow-md transition-colors"><i class="fab fa-whatsapp"></i> Chat WhatsApp Admin</a>
                        </div>
                    </div>
                </section>

                <!-- VIEW: PROFIL -->
                <section id="view-profil" class="hidden max-w-4xl mx-auto flex flex-col md:flex-row gap-6">
                    <div class="w-full md:w-1/3 bg-white p-8 rounded-xl border border-gray-100 shadow-sm text-center">
                        <div class="w-24 h-24 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-3xl mx-auto shadow-inner mb-4 relative" id="profile-avatar">
                            AD
                        </div>
                        <h2 id="profile-name" class="text-xl font-bold text-gray-800">Mahasiswa</h2>
                        <p class="text-xs font-mono text-gray-400 mt-1" id="profile-nim">NPM: 243510595</p>
                        <p class="text-xs font-semibold text-teal-600 mt-1" id="profile-prodi">Mahasiswa (Peminjam)</p>
                        <span id="profile-status" class="inline-block mt-4 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Keanggotaan Aktif</span>
                    </div>

                    <div class="w-full md:w-2/3 bg-white p-8 rounded-xl border border-gray-100 shadow-sm space-y-6">
                        <div>
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2 text-sm">Informasi Kontak</h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-xs font-bold text-gray-500">Email Utama</label>
                                    <p id="profile-email" class="text-sm font-semibold text-gray-800 mt-1">mahasiswa@student.ac.id</p>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500">No. HP / WhatsApp</label>
                                    <input type="text" id="profile-hp" placeholder="08xxxxxxxxxx" class="mt-1 w-full border-b border-gray-300 py-1 text-sm outline-none focus:border-teal-600 bg-transparent">
                                </div>
                            </div>
                            <button class="mt-4 px-4 py-2 bg-navy text-white text-xs font-bold rounded hover:bg-gray-800" onclick="saveProfil()">Simpan Info Kontak</button>
                        </div>

                        <div>
                            <h3 class="font-bold text-gray-800 mb-4 border-b pb-2 text-sm mt-8">Ubah Kata Sandi</h3>
                            <form onsubmit="handleUbahSandi(event)" class="space-y-3 max-w-sm">
                                <input type="password" id="pw-lama" placeholder="Kata Sandi Lama" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                <input type="password" id="pw-baru" placeholder="Kata Sandi Baru" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                <input type="password" id="pw-konfirmasi" placeholder="Konfirmasi Sandi Baru" required class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600">
                                <button type="submit" class="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded hover:bg-teal-700">Perbarui Sandi</button>
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    </div>

    <!-- Modal Detail Laporan Kendala -->
    <div id="modal-detail-lapor" class="hidden fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 id="dl-judul" class="font-bold text-gray-800 text-lg">Detail Laporan</h3>
                    <p id="dl-sub" class="font-mono text-xs text-gray-500"></p>
                </div>
                <button onclick="tutupDetailLapor()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div id="dl-isi" class="space-y-4 text-sm"></div>
        </div>
    </div>

    <!-- Modal Upload Bukti Peminjaman -->
     
    <div id="modal-upload-bukti" class="hidden fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 class="font-bold text-gray-800 text-lg mb-1">Upload Bukti Peminjaman</h3>
            <p id="upload-trx-id" class="font-mono text-xs text-gray-500 mb-4">TRX-001</p>

            <label for="input-bukti" class="block w-full min-h-[180px] border-2 border-dashed border-gray-300 hover:border-teal-600 rounded-lg cursor-pointer overflow-hidden flex items-center justify-center text-center transition-colors">
                <div id="upload-placeholder" class="p-6">
                    <i class="fas fa-camera text-3xl text-gray-400 mb-2"></i>
                    <p class="text-sm font-semibold text-gray-600">Klik untuk memilih foto</p>
                    <p class="text-xs text-gray-400 mt-1">JPG / PNG, maksimal 2 MB</p>
                </div>
                <img id="preview-bukti" src="" alt="Pratinjau bukti" class="hidden w-full max-h-64 object-contain">
            </label>
            <input type="file" id="input-bukti" accept="image/*" class="hidden" onchange="previewBukti(event)">

            <div class="flex gap-3 mt-5">
                <button onclick="tutupUploadBukti()" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">Batal</button>
                <button onclick="simpanBukti()" class="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold">Simpan Bukti</button>
            </div>
        </div>
    </div>

        <!-- Modal Pembayaran Denda -->
    <div id="modal-bayar-denda" class="hidden fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 class="font-bold text-gray-800 text-lg mb-1">Pembayaran Denda</h3>
            <p id="bayar-info" class="text-xs text-gray-500 mb-4"></p>

            <div class="bg-rose-50 border border-rose-100 rounded-lg p-4 text-center mb-4">
                <p class="text-xs font-semibold text-rose-600">Total yang harus dibayar</p>
                <p id="bayar-nominal" class="text-3xl font-bold text-rose-700">Rp 0</p>
            </div>

            <label class="block text-xs font-bold text-gray-700 mb-1">Metode Pembayaran</label>
            <select id="bayar-metode" onchange="updateMetodeBayar()" class="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 mb-3">
                <option value="QRIS">QRIS</option>
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Tunai">Tunai di Admin</option>
            </select>

            <div id="bayar-instruksi" class="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 leading-relaxed"></div>

            <div id="bayar-bukti-wrap" class="mb-4">
                <label class="block text-xs font-bold text-gray-700 mb-1">Unggah Bukti Pembayaran</label>
                <input type="file" id="bayar-bukti" accept="image/*" class="w-full border rounded-lg px-3 py-2 text-sm outline-none file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100">
            </div>

            <div class="flex gap-3">
                <button onclick="tutupBayarDenda()" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">Batal</button>
                <button onclick="konfirmasiBayarDenda()" class="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold">Konfirmasi Pembayaran</button>
            </div>
        </div>
    </div>

    <div id="modal-bukti-pinjam" class="hidden fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4"><h3 class="font-bold text-gray-800 text-lg">Bukti Peminjaman</h3><button onclick="$('modal-bukti-pinjam').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button></div>
            <div id="bukti-isi" class="text-sm"></div>
            <div class="flex gap-3 mt-5"><button onclick="$('modal-bukti-pinjam').classList.add('hidden')" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">Tutup</button><button onclick="cetakBukti()" class="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold"><i class="fas fa-print mr-1"></i> Cetak</button></div>
        </div>
    </div>
    </div>

    <template id="admin-portal">
        <div id="view-login" class="fixed inset-0 bg-graybg z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
                <h2 class="text-xl font-bold text-gray-800">Sesi admin tidak ditemukan</h2>
                <p class="text-sm text-gray-500 mt-2">Silakan masuk melalui halaman login bersama.</p>
                <a href="index.html" class="inline-block mt-5 bg-teal-600 text-white font-bold rounded-lg px-5 py-3 hover:bg-teal-700 transition-colors">Kembali ke Login</a>
            </div>
        </div>

        <div id="app-layout" class="flex w-full h-screen overflow-hidden hidden">
            <aside class="w-64 bg-navy text-gray-300 flex flex-col justify-between p-4 flex-shrink-0 h-screen overflow-y-auto">
                <div>
                    <div class="flex items-center gap-3 px-3 py-4 mb-4 border-b border-gray-800">
                        <div class="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center p-1 border border-gray-700 shrink-0">
                            <svg class="w-full h-full" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="42" stroke="#22d3ee" stroke-width="3" stroke-dasharray="6 3" opacity=".8"/><g transform="rotate(45 50 50)"><path d="M50 14 L60 50 L50 46 Z" fill="#38bdf8"/><path d="M50 14 L40 50 L50 46 Z" fill="#0284c7"/><path d="M50 86 L60 50 L50 54 Z" fill="#0f172a"/><path d="M50 86 L40 50 L50 54 Z" fill="#334155"/></g><circle cx="50" cy="50" r="4" fill="#fff"/></svg>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-black text-lg tracking-wide text-white leading-none mt-1">KOMPAS<span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">LAB</span></span>
                            <span class="text-[9px] text-gray-400 font-medium tracking-wider uppercase mt-1">Panel Admin</span>
                        </div>
                    </div>
                    <nav id="nav-menu" class="space-y-1"></nav>
                </div>
                <div class="pt-4 mt-4 border-t border-gray-800">
                    <div class="flex items-center gap-3 mb-3 px-2">
                        <div id="user-avatar" class="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center font-bold text-white text-sm">AD</div>
                        <div><p id="user-display-name" class="text-sm font-semibold text-white truncate max-w-[130px]">Admin</p><p class="text-xs text-gray-500">Admin</p></div>
                    </div>
                    <button onclick="handleLogout()" class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg text-xs font-semibold transition-colors"><i class="fas fa-sign-out-alt"></i> Keluar</button>
                </div>
            </aside>

            <main class="flex-1 flex flex-col min-w-0 h-screen">
                <header class="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-30">
                    <h1 id="page-title" class="text-xl font-bold text-gray-800">Dashboard</h1>
                    <button id="admin-notif-button" onclick="toggleAdminNotifications(event)" class="relative p-2 text-gray-400 hover:text-teal-600 transition-colors" title="Notifikasi dan tindakan admin" aria-label="Buka notifikasi admin" aria-expanded="false" aria-controls="admin-notif-panel">
                        <i class="fas fa-bell text-lg"></i>
                        <span id="notif-badge" class="hidden absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">0</span>
                    </button>
                    <div id="admin-notif-panel" class="hidden absolute right-8 top-full mt-2 w-[min(92vw,26rem)] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                        <div id="admin-notif-content"></div>
                    </div>
                </header>
                <div id="content" class="p-8 space-y-6 flex-1 overflow-y-auto relative"></div>
                <div id="global-toast" class="hidden fixed top-20 right-8 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-[60]">
                    <i id="toast-icon" class="fas fa-check-circle text-green-400"></i><span id="toast-msg" class="text-sm font-medium"></span>
                </div>
            </main>
        </div>

        <div id="modal" class="hidden fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <div class="flex justify-between items-start mb-4">
                    <h3 id="modal-title" class="font-bold text-gray-800 text-lg"></h3>
                    <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
                </div>
                <div id="modal-body"></div>
            </div>
        </div>

        <input type="file" id="file-import" accept=".csv" class="hidden" onchange="importUsers(event)">
    </template>

    <script>
        const adminMode = new URLSearchParams(window.location.search).get('mode') === 'admin';
        if (adminMode) {
            document.getElementById('user-portal').remove();
            const adminTemplate = document.getElementById('admin-portal');
            document.body.append(adminTemplate.content.cloneNode(true));
            adminTemplate.remove();
            document.title = 'KOMPAS Lab - Panel Admin';
        }

        function loadAppScript(src) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Gagal memuat ${src}`));
                document.body.appendChild(script);
            });
        }

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                if (adminMode) {
                    await loadAppScript('Admin.js');
                    checkSession();
                    return;
                }
                await loadAppScript('core.js');
                await loadAppScript('user.js');
                initializeUserApp();
            } catch (error) {
                console.error(error);
                alert('Aplikasi gagal dimuat. Periksa file JavaScript dan coba muat ulang halaman.');
            }
        });
    </script>
</body>
</html>
````

## File: admin-workflows.test.js
````javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adminSource = fs.readFileSync(path.join(__dirname, 'Admin.js'), 'utf8');
const start = adminSource.indexOf('function issueNext(');
const end = adminSource.indexOf('// ================= PENGUMUMAN =================', start);
const issueWorkflow = adminSource.slice(start, end);
const fineStart = adminSource.indexOf('function fineReject(');
const fineEnd = adminSource.indexOf('// ================= LAPORAN KENDALA =================', fineStart);
const fineRejectWorkflow = adminSource.slice(fineStart, fineEnd);
const adminSessionStart = adminSource.indexOf('function loadAdminSession()');
const adminSessionEnd = adminSource.indexOf('\nconst addCalendarDays', adminSessionStart);
const adminSessionWorkflow = adminSource.slice(adminSessionStart, adminSessionEnd);
const pendingReturnStart = adminSource.indexOf('const hasPendingReturn =');
const pendingReturnEnd = adminSource.indexOf(';', pendingReturnStart) + 1;
const pendingReturnWorkflow = adminSource.slice(pendingReturnStart, pendingReturnEnd);

function createContext(issue, asset) {
    const context = vm.createContext({
        db: { laporan: [issue], assets: [asset] },
        TAHAP: ['Dilaporkan', 'Ditinjau Admin', 'Dalam Perbaikan', 'Selesai'],
        me: () => ({ name: 'Admin Uji' }),
        asetOf: id => context.db.assets.find(item => item.id === id),
        showToast: message => { context.lastToast = message; },
        notifyUser: () => {},
        log: () => {},
        save: () => {},
        render: () => {}
    });
    context.formData = null;
    context.formModal = (title, fields, callback) => {
        context.formData = { title, fields, callback };
    };
    vm.runInContext(issueWorkflow, context, { filename: 'Admin/Admin.js issue workflow' });
    return context;
}

function callForm(context, values) {
    context.formData.callback(values);
}

test('admin session migrates from shared legacy storage into the current tab', () => {
    const shared = new Map([['active_admin', JSON.stringify({ name: 'Admin Uji', nim: '198001012005' })]]);
    const tab = new Map();
    const storage = values => ({
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    });
    const context = vm.createContext({
        SES: 'kompas_session_admin',
        LEGACY_SES: 'active_admin',
        sessionStorage: storage(tab),
        localStorage: storage(shared)
    });
    vm.runInContext(adminSessionWorkflow, context);

    assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('loadAdminSession()', context))), { name: 'Admin Uji', nim: '198001012005' });
    assert.equal(tab.get('kompas_session_admin'), JSON.stringify({ name: 'Admin Uji', nim: '198001012005' }));
    assert.equal(shared.has('active_admin'), false);
});

test('admin detects only outstanding return requests for borrowed loans', () => {
    const context = vm.createContext({
        OUT: ['Dipinjam', 'Terlambat'],
        itemRemaining: item => Math.max(0, item.qty - (item.returnedQty || 0))
    });
    vm.runInContext(pendingReturnWorkflow, context);

    assert.equal(vm.runInContext("hasPendingReturn({ status: 'Dipinjam', items: [{ qty: 4, returnedQty: 1, returnRequestedQty: 2 }] })", context), true);
    assert.equal(vm.runInContext("hasPendingReturn({ status: 'Selesai', items: [{ qty: 4, returnRequestedQty: 2 }] })", context), false);
    assert.equal(vm.runInContext("hasPendingReturn({ status: 'Dipinjam', items: [{ qty: 4, returnRequestedQty: 0 }] })", context), false);
});

test('repair reports track partial unit recovery and close only when all units are restored', () => {
    const context = createContext({
        id: 'ISSUE-REPAIR', toolId: 'ASSET-1', toolName: 'Alat Uji', jenis: 'Rusak Fisik',
        jumlah: 2, tahap: 1, riwayat: []
    }, { id: 'ASSET-1', total: 5, rusak: 0, hilang: 0, servis: 0 });

    vm.runInContext("issueNext('ISSUE-REPAIR')", context);
    callForm(context, { catatan: 'Mulai perbaikan' });
    assert.equal(context.db.assets[0].rusak, 2);

    vm.runInContext("issueNext('ISSUE-REPAIR')", context);
    callForm(context, { jumlahPulih: 1, biaya: 200, catatan: 'Satu unit pulih' });
    assert.equal(context.db.laporan[0].tahap, 2);
    assert.equal(context.db.laporan[0].jumlahDipulihkan, 1);
    assert.equal(context.db.assets[0].rusak, 1);

    vm.runInContext("issueNext('ISSUE-REPAIR')", context);
    callForm(context, { jumlahPulih: 1, biaya: 100, catatan: 'Unit kedua pulih' });
    assert.equal(context.db.laporan[0].tahap, 3);
    assert.equal(context.db.laporan[0].jumlahDipulihkan, 2);
    assert.equal(context.db.assets[0].rusak, 0);
    assert.equal(context.db.assets[0].servis, 300);
});

test('lost-item reports record exact replacement or compensation before closure', () => {
    for (const method of ['Penggantian unit setara', 'Kompensasi / penyelesaian administratif']) {
        const context = createContext({
            id: `ISSUE-${method}`, toolId: 'ASSET-1', toolName: 'Alat Uji',
            jenis: 'Alat / Komponen Hilang', jumlah: 2, tahap: 1, riwayat: []
        }, { id: 'ASSET-1', total: 5, rusak: 0, hilang: 0, servis: 0 });

        vm.runInContext(`issueNext('ISSUE-${method}')`, context);
        callForm(context, { catatan: 'Ditinjau' });
        assert.equal(context.db.assets[0].hilang, 2);

        vm.runInContext(`issueNext('ISSUE-${method}')`, context);
        callForm(context, { metodePenyelesaian: method, jumlahPenyelesaian: 2, catatan: 'Penyelesaian dicatat' });
        assert.equal(context.db.laporan[0].tahap, 3);
        assert.equal(context.db.laporan[0].penyelesaian.metode, method);
        assert.equal(context.db.laporan[0].penyelesaian.jumlah, 2);
        assert.equal(context.db.assets[0].total, method === 'Penggantian unit setara' ? 7 : 5);
        assert.equal(context.db.assets[0].hilang, 2);
    }
});

test('rejected payment proof returns to unpaid status and stores the reason for resubmission', () => {
    const context = vm.createContext({
        db: { fines: [{
            id: 'FINE-1', nim: '12345678', status: 'Menunggu Verifikasi',
            bukti: 'data:image/jpeg;base64,abc', metode: 'QRIS', dibayarAt: '2026-10-20T09:00:00Z'
        }] },
        me: () => ({ name: 'Admin Uji' }),
        showToast: message => { context.lastToast = message; },
        notifyUser: (...args) => { context.notification = args; },
        log: () => {},
        save: () => {},
        render: () => {}
    });
    context.formData = null;
    context.formModal = (title, fields, callback) => {
        context.formData = { title, fields, callback };
    };
    vm.runInContext(fineRejectWorkflow, context, { filename: 'Admin/Admin.js fine rejection workflow' });

    vm.runInContext("fineReject('FINE-1')", context);
    const rejected = context.formData.callback({ alasan: 'Bukti tidak terbaca' });

    assert.equal(rejected, undefined);
    assert.equal(context.db.fines[0].status, 'Belum Dibayar');
    assert.equal(context.db.fines[0].bukti, '');
    assert.equal(context.db.fines[0].metode, '');
    assert.equal(context.db.fines[0].catatan, 'Bukti ditolak: Bukti tidak terbaca');
    assert.equal(context.db.fines[0].riwayatVerifikasi[0].alasan, 'Bukti tidak terbaca');
    assert.match(context.notification[2], /kirim ulang bukti pembayaran/);
});
````

## File: README.md
````markdown
# KOMPAS Lab

KOMPAS Lab adalah prototipe aplikasi inventaris laboratorium berbasis HTML, CSS, dan JavaScript. Halaman utama `index.html` memuat login bersama dan kedua dashboard.

## Menjalankan aplikasi

1. Buka folder proyek di Visual Studio Code.
2. Jalankan server web lokal dari folder proyek, misalnya menggunakan ekstensi Live Server.
3. Buka `index.html` melalui server lokal sebagai halaman login bersama dan aplikasi utama. Akun admin akan masuk ke panel admin, sedangkan akun pengguna akan masuk ke panel pengguna.
4. Data contoh dibuat otomatis saat aplikasi pertama kali dibuka.

## Menggunakan akun User dan Admin

Buka alamat aplikasi yang sama pada dua tab di browser yang sama. Masuk sebagai User di tab pertama dan Admin di tab kedua. Pengajuan peminjaman User akan muncul di menu **Peminjaman** Admin; Admin dapat menyetujui atau menolak dengan alasan, dan perubahan status akan terlihat kembali di akun User. Jangan mencampur alamat lokal (misalnya Live Server) dengan alamat GitHub Pages karena masing-masing memiliki penyimpanan browser yang berbeda.

Jangan gunakan server publik atau masukkan data pribadi ke aplikasi ini.

## Fitur demo

- Katalog dan pengajuan peminjaman alat; mahasiswa dapat mengajukan beberapa jenis alat dalam satu pengajuan, sesuai batas jenis alat aktif yang berlaku. Sebelum dikirim, mahasiswa meninjau ringkasan setiap alat, jumlah, jadwal, dan tujuan. Surat pengantar tugas akhir wajib dilampirkan dan tersedia untuk diunduh Admin. Status pengajuan dapat dipantau di menu Peminjaman Saya; persetujuan menampilkan jadwal serta kode pengambilan, sedangkan penolakan disertai alasan di Riwayat Transaksi. Pengembalian harus diajukan pengguna per jenis alat dan jumlah unit sebelum Admin dapat memeriksa kondisi; tenggat dan denda tetap dihitung dari transaksi.
- Persetujuan booking ruang memeriksa ulang kapasitas, hari kerja, durasi, jam layanan, tanggungan akun, dan benturan pada hari kerja. Pembayaran denda yang ditolak dapat dikirim ulang oleh pengguna dengan alasan penolakan yang tercatat.
- Manajemen pengguna, aset, laporan, audit, impor CSV dengan laporan kesalahan per baris, serta backup manual. Pemulihan aset mencatat jumlah unit yang selesai diperbaiki; laporan tetap aktif jika pemulihan masih parsial. Laporan kehilangan wajib mencatat jumlah unit dan penyelesaian Admin (penggantian setara atau kompensasi); penggantian menambah stok, sedangkan kompensasi tidak mengembalikan unit yang hilang.
- Pengujian aturan inti dapat dijalankan dengan Node.js versi 18 atau lebih baru:

```powershell
node --test
```

## Batasan keamanan dan data

- Data disimpan di `localStorage` browser, bukan database server. Data tidak tersinkron dengan browser atau perangkat lain dan dapat hilang ketika penyimpanan situs dibersihkan.
- Login dan pemeriksaan peran berjalan di sisi browser. Data serta aturan dapat diubah melalui developer tools; mekanisme ini bukan kontrol akses yang aman.
- Kata sandi di-hash di browser dengan SHA-256 deterministik, tanpa salt acak yang sesuai untuk penyimpanan kata sandi produksi.
- Reset kata sandi hanya mencocokkan NPM/NIP dan email dari data lokal. Ini tidak membuktikan identitas pengguna dan tidak mengirim OTP atau email.
- 2FA, SSO, gateway email/WhatsApp, dan matriks hak akses belum diterapkan. Nilai matriks hak akses hanya merupakan referensi tampilan.
- Backup hanya dibuat ketika tombol backup manual ditekan. Salinan di dalam aplikasi tetap berada di browser yang sama; unduh backup dan simpan secara terpisah.

Aplikasi ini hanya untuk demonstrasi/tugas kuliah. Untuk penggunaan nyata, diperlukan backend dengan autentikasi dan otorisasi server, database terpusat, pemulihan sandi melalui token/OTP, serta backup otomatis di server.
````

## File: user.js
````javascript
/* =====================================================================
   KOMPAS Lab - user.js (portal peminjam)
   Memakai core.js: data, aturan, dan denda sama persis dengan panel Admin.
   ===================================================================== */
let me = null;
let passwordResetNim = null;
const ui = { view: 'dashboard', cat: 'Semua', q: '', bk: null, trx: null, fine: null, bukti: null, laporFoto: null };
const loanRequest = { items: [] };
ACTOR = () => me ? me.name : 'Tamu';

let userAppInitialized = false;
function initializeUserApp() {
    if (userAppInitialized) return;
    userAppInitialized = true;
    document.addEventListener('click', e => { const w = $('notif-wrapper'); if (w && !w.contains(e.target)) $('notif-panel').classList.add('hidden'); });
    checkSession();
}
window.onDBChange = () => {
    if (!me) return;
    me = getUser(me.nim);
    if (!me || ['Nonaktif', 'Blacklist'].includes(me.status)) return handleLogout();
    renderAll();
};

// ================= AUTH =================
function checkSession() {
    sync();
    let nim = sessionStorage.getItem(SES_U);
    if (!nim) {
        nim = localStorage.getItem(SES_U);
        if (nim) {
            sessionStorage.setItem(SES_U, nim);
            localStorage.removeItem(SES_U);
        }
    }
    me = nim ? getUser(nim) : null;
    if (me && (me.role === 'Admin' || ['Nonaktif', 'Blacklist'].includes(me.status))) { sessionStorage.removeItem(SES_U); me = null; }
    $('view-login').classList.toggle('hidden', !!me);
    $('app-layout').classList.toggle('hidden', !me);
    $('reg-prodi').innerHTML = db.master['Program Studi'].map(p => `<option>${esc(p)}</option>`).join('');
    if (!me) return;
    $('user-avatar').textContent = $('profile-avatar').textContent = inisial(me.name);
    $('pinjam-tujuan-jenis').innerHTML = TUJUAN.map(t => `<option>${esc(t)}</option>`).join('');
    renderAll();
    switchView(ui.view || 'dashboard');
}
function showAuthAlert(msg, type) {
    $('auth-alert').className = `mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center ${type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`;
    $('auth-alert-icon').className = `fas mr-2 ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`;
    $('auth-alert-msg').textContent = msg;
}
function toggleAuthMode(mode) {
    if (mode === 'forgot') resetPasswordResetForm();
    ['login', 'register', 'forgot'].forEach(m => $('auth-form-' + m).classList.toggle('hidden', m !== mode));
    $('auth-alert').classList.add('hidden');
}
function resetPasswordResetForm() {
    passwordResetNim = null;
    $('forgot-account-fields').classList.remove('hidden');
    $('forgot-new-password-fields').classList.add('hidden');
    $('forgot-nim').required = true;
    $('forgot-email').required = true;
    $('forgot-new-password').required = false;
    $('forgot-confirm-password').required = false;
    $('forgot-submit-button').textContent = 'Lanjutkan';
    $('auth-form-forgot').querySelector('form').reset();
}
function storeLoginSession(user) {
    if (user.role === 'Admin') {
        sessionStorage.removeItem(SES_U);
        sessionStorage.setItem(SES_A, JSON.stringify({ name: user.name, nim: user.nim }));
    } else {
        sessionStorage.removeItem(SES_A);
        sessionStorage.setItem(SES_U, user.nim);
    }
}
function handleLogin(e) {
    e.preventDefault();
    const r = tryLogin($('login-email').value, $('login-password').value, 'shared');
    if (!r.ok) return showAuthAlert(r.msg, 'error');
    me = r.user;
    storeLoginSession(me);
    log(me.role === 'Admin' ? 'Login admin' : 'Login user');
    showAuthAlert('Login berhasil! Memuat dashboard...', 'success');
    if (me.role === 'Admin') {
        setTimeout(() => window.location.replace('index.html?mode=admin'), 400);
    } else {
        ui.view = 'dashboard'; setTimeout(checkSession, 400);
    }
}
function handleRegister(e) {
    e.preventDefault();
    const name = $('reg-name').value.trim(), nim = $('reg-nim').value.trim(), email = $('reg-email').value.trim().toLowerCase(), pw = $('reg-password').value;
    if (!/^[0-9]{8,20}$/.test(nim)) return showAuthAlert('NPM / NIP harus berupa angka (8 - 20 digit).', 'error');
    if (db.users.some(u => u.nim === nim || u.email.toLowerCase() === email)) return showAuthAlert('NPM/NIP atau email sudah terdaftar.', 'error');
    const bad = cekSandiBaru(pw); if (bad) return showAuthAlert(bad, 'error');
    db.users.push({ nim, name, email, role: 'Mahasiswa', prodi: $('reg-prodi').value, status: 'Aktif', password: hashPw(pw, nim), hp: '', createdAt: todayISO() });
    log('Registrasi mandiri ' + nim); e.target.reset();
    toggleAuthMode('login'); showAuthAlert('Pendaftaran berhasil. Silakan masuk dengan akun Anda.', 'success');
}
function handleForgotPassword(e) {
    e.preventDefault();
    if (!passwordResetNim) {
        const nim = $('forgot-nim').value.trim();
        const email = $('forgot-email').value.trim().toLowerCase();
        const u = db.users.find(user => user.nim === nim && String(user.email || '').trim().toLowerCase() === email && user.role !== 'Admin');
        if (!u) return showAuthAlert('NPM/NIP dan email tidak cocok dengan akun pengguna.', 'error');
        passwordResetNim = u.nim;
        $('forgot-account-fields').classList.add('hidden');
        $('forgot-new-password-fields').classList.remove('hidden');
        $('forgot-nim').required = false;
        $('forgot-email').required = false;
        $('forgot-new-password').required = true;
        $('forgot-confirm-password').required = true;
        $('forgot-submit-button').textContent = 'Simpan Kata Sandi Baru';
        $('auth-alert').classList.add('hidden');
        $('forgot-new-password').focus();
        return;
    }

    const u = db.users.find(user => user.nim === passwordResetNim && user.role !== 'Admin');
    if (!u) {
        resetPasswordResetForm();
        return showAuthAlert('Akun tidak ditemukan. Silakan mulai proses reset kembali.', 'error');
    }
    const password = $('forgot-new-password').value;
    if (password !== $('forgot-confirm-password').value) return showAuthAlert('Konfirmasi kata sandi tidak cocok.', 'error');
    const passwordError = cekSandiBaru(password);
    if (passwordError) return showAuthAlert(passwordError, 'error');

    const completedAt = new Date().toISOString();
    const pendingRequests = db.resets.filter(request => request.nim === u.nim && !request.done);
    if (pendingRequests.length) {
        pendingRequests.forEach(request => {
            request.done = true;
            request.completedAt = completedAt;
            request.completedBy = 'Pengguna';
        });
    } else {
        db.resets.unshift({ nim: u.nim, t: completedAt, done: true, completedAt, completedBy: 'Pengguna' });
    }
    u.password = hashPw(password, u.nim);
    notify({ untuk: 'ADMIN', icon: 'fa-key', style: 'text-indigo-600 bg-indigo-50', title: 'Reset kata sandi mandiri selesai', desc: `${u.name} (${u.nim}) telah memperbarui kata sandinya sendiri.`, view: 'users' });
    log(`Reset kata sandi mandiri ${u.nim}`);
    save();
    e.target.reset();
    passwordResetNim = null;
    toggleAuthMode('login');
    showAuthAlert('Kata sandi berhasil diperbarui. Anda sekarang dapat masuk menggunakan kata sandi baru.', 'success');
}
function handleLogout() { if (me) log('Logout user'); sessionStorage.removeItem(SES_U); me = null; checkSession(); }

// ================= UI UMUM =================
function showToast(msg, type = 'success') {
    $('toast-icon').className = `fas ${type === 'success' ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-amber-400'}`;
    $('toast-msg').textContent = msg; $('global-toast').classList.remove('hidden');
    clearTimeout(showToast.t); showToast.t = setTimeout(() => $('global-toast').classList.add('hidden'), 3500);
}
function toggleSidebar(force) {
    const open = force ?? $('sidebar').classList.contains('-translate-x-full');
    $('sidebar').classList.toggle('-translate-x-full', !open); $('sidebar-overlay').classList.toggle('hidden', !open);
}
const BADGE_LOAN = {
    [ST.MENUNGGU]: 'bg-blue-100 text-blue-800', [ST.SIAP]: 'bg-indigo-100 text-indigo-800', [ST.DIPINJAM]: 'bg-yellow-100 text-yellow-800',
    [ST.TERLAMBAT]: 'bg-red-100 text-red-800', [ST.SELESAI]: 'bg-green-100 text-green-800', [ST.DITOLAK]: 'bg-red-100 text-red-800', [ST.BATAL]: 'bg-gray-100 text-gray-600'
};
const badgeLoan = s => `<span class="px-3 py-1 rounded-full text-xs font-bold ${BADGE_LOAN[s] || 'bg-gray-100 text-gray-600'}">${esc(s)}</span>`;
const myLoans = () => db.loans.filter(l => l.nim === me.nim);
const kosong = (cols, t) => `<tr><td colspan="${cols}" class="py-8 text-center text-gray-400">${t}</td></tr>`;
const TITLES = { dashboard: 'Beranda Dashboard', catalog: 'Katalog Alat IT', detail: 'Detail Alat Inventaris', peminjaman: 'Pengajuan Peminjaman', booking: 'Booking Ruang Laboratorium', pengembalian: 'Peminjaman Saya', laporan: 'Riwayat Transaksi', pelaporan: 'Pelaporan Kendala Alat', sanksi: 'Sanksi & Denda', bantuan: 'Pusat Bantuan & FAQ', aturan: 'Aturan Peminjaman', profil: 'Profil & Pengaturan Akun' };
const VIEWS = Object.keys(TITLES);
function switchView(v) {
    if (v === 'peminjaman' && me.role !== 'Mahasiswa') {
        showToast('Pengajuan peminjaman alat hanya dapat dilakukan oleh mahasiswa.', 'error');
        v = 'catalog';
    }
    ui.view = v; sync();
    VIEWS.forEach(x => { $('view-' + x)?.classList.add('hidden'); $('nav-' + x)?.classList.remove('active', 'bg-gray-800', 'text-white'); });
    $('view-' + v).classList.remove('hidden'); $('nav-' + v)?.classList.add('active', 'bg-gray-800', 'text-white');
    $('page-title').textContent = TITLES[v];
    toggleSidebar(false); $('view-' + v).parentElement.scrollTop = 0;
    renderAll();
}
function renderAll() {
    sync(); me = getUser(me.nim);
    $('user-display-name').textContent = $('profile-name').textContent = me.name;
    $('user-status').textContent = me.role; $('profile-prodi').textContent = `${me.role} - ${me.prodi}`;
    $('profile-email').textContent = me.email; $('profile-nim').textContent = 'NIM/NIP: ' + me.nim;
    $('info-jam').textContent = `Senin - Jumat: ${db.policy.jamBuka} - ${db.policy.jamTutup} WIB`;
    renderStats(); renderDashAlert(); renderRecent(); renderCatalog(); renderNotifications();
    const v = ui.view;
    if (v === 'peminjaman') siapkanFormPinjam();
    if (v === 'pengembalian') renderPengembalian();
    if (v === 'laporan') { renderRiwayat(); renderBookingHistory(); }
    if (v === 'booking') { siapkanViewBooking(); renderBookingHistory(); }
    if (v === 'pelaporan') { isiPilihanAlatLapor(); renderLaporanKendala(); }
    if (v === 'sanksi') renderDenda();
    if (v === 'aturan') renderAturan();
    if (v === 'bantuan') renderBantuan();
    if (v === 'profil') { if (document.activeElement !== $('profile-hp')) $('profile-hp').value = me.hp || ''; renderProfilStatus(); }
}

// ================= DASHBOARD =================
function renderStats() {
    const A = asetAktif();
    $('stat-total').textContent = A.reduce((s, a) => s + a.total, 0);
    $('stat-available').textContent = A.reduce((s, a) => s + tersedia(a), 0);
    $('stat-borrowed').textContent = A.reduce((s, a) => s + qtyDitahan(a.id), 0);
    $('stat-repair').textContent = A.reduce((s, a) => s + (a.rusak || 0) + (a.hilang || 0), 0);
}
function renderDashAlert() {
    const sa = statusAkun(me.nim), L = myLoans(), today = todayISO(), box = [];
    if (!sa.boleh) box.push(`<div class="flex items-center justify-between gap-3 p-4 rounded-xl border ${sa.level === 'beku' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'} text-sm"><span><i class="fas fa-exclamation-triangle mr-2"></i><b>${sa.judul}.</b> ${esc(sa.pesan)}</span><button onclick="switchView('sanksi')" class="shrink-0 px-3 py-1.5 bg-white border rounded-lg text-xs font-bold">Lihat</button></div>`);
    L.filter(l => l.status === ST.SIAP).forEach(l => box.push(`<div class="p-4 rounded-xl border bg-indigo-50 border-indigo-200 text-indigo-800 text-sm"><i class="fas fa-box-open mr-2"></i><b>${l.id} siap diambil</b> di ruang Admin pada ${fmtTgl(l.tglAmbil)} pukul ${l.jamAmbil}. Tunjukkan kode <span class="font-mono font-bold">${esc(l.kode || '-')}</span>.</div>`));
    L.filter(l => l.status === ST.DIPINJAM && l.tglKembali <= today).forEach(l => box.push(`<div class="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 text-sm"><i class="fas fa-clock mr-2"></i><b>${l.id}</b> harus dikembalikan hari ini sebelum pukul ${db.policy.jamTutup}.</div>`));
    $('dash-alert').className = box.length ? 'space-y-3' : 'hidden'; $('dash-alert').innerHTML = box.join('');
}
function renderRecent() {
    const rows = myLoans().slice(0, 3);
    $('recent-transactions-table').innerHTML = rows.map(l => `<tr class="hover:bg-gray-50"><td class="py-3 px-4 font-medium text-gray-900"><i class="fas fa-box text-gray-400 mr-2"></i>${esc(loanNama(l))}</td><td class="py-3 px-4 text-gray-500">${fmtTgl(l.createdAt.slice(0, 10))}</td><td class="py-3 px-4">${badgeLoan(l.status)}</td></tr>`).join('') || kosong(3, 'Belum ada transaksi. Mulai dari menu Peminjaman Alat.');
}

// ================= KATALOG =================
function onGlobalSearch(v) { ui.q = v; $('cat-search').value = v; if (v && ui.view !== 'catalog') switchView('catalog'); else renderCatalog(); }
function onCatSearch(v) { ui.q = v; $('global-search').value = v; renderCatalog(); }
function setCategory(c) { ui.cat = c; renderCatalog(); }
function renderCatalog() {
    const cats = ['Semua', ...db.master['Kategori Alat']];
    $('cat-filters').innerHTML = cats.map(c => `<button onclick="setCategory('${esc(c)}')" class="px-4 py-1.5 rounded-full text-sm font-medium ${c === ui.cat ? 'bg-navy text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${esc(c)}</button>`).join('');
    const q = ui.q.trim().toLowerCase();
    const items = asetAktif().filter(a => (ui.cat === 'Semua' || a.kategori === ui.cat) && (!q || (a.name + a.id + a.lokasi + a.kategori).toLowerCase().includes(q)));
    $('empty-state').classList.toggle('hidden', items.length > 0);
    $('catalog-grid').innerHTML = items.map(a => {
        const st = statusAset(a), sc = st === 'Tersedia' ? 'bg-green-100 text-green-700' : st === 'Dipinjam' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
        const dipilih = loanRequest.items.some(item => item.toolId === a.id);
        return `<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer" onclick="showDetail('${esc(a.id)}')">
        <div><div class="flex justify-between items-start mb-3"><span class="p-3 bg-teal-50 text-teal-600 rounded-lg"><i class="fas ${a.icon} text-xl"></i></span><span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sc}">${st.toUpperCase()}</span></div>
        <h3 class="font-bold text-gray-800 text-sm mb-1 line-clamp-2" title="${esc(a.name)}">${esc(a.name)}</h3>
        <p class="text-[10px] text-gray-400 font-mono mb-3">${a.id}</p>
        <div class="text-xs text-gray-500 space-y-1.5 mb-4"><p><i class="fas fa-map-marker-alt w-4 text-gray-400"></i> ${esc(a.lokasi)}</p><p><i class="fas fa-boxes w-4 text-gray-400"></i> Tersedia: <strong class="text-teal-600">${tersedia(a)}</strong> / ${a.total}</p></div></div>
        <div class="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onclick="event.stopPropagation();showDetail('${esc(a.id)}')" class="py-2 bg-gray-50 hover:bg-gray-100 text-navy text-xs font-bold rounded-lg border border-gray-200 transition-colors">Detail</button>
            <button type="button" onclick="event.stopPropagation();startLoanRequest('${esc(a.id)}')" ${tersedia(a) > 0 && me.role === 'Mahasiswa' && !dipilih ? '' : 'disabled'} title="${dipilih ? 'Alat sudah dipilih' : me.role === 'Mahasiswa' ? 'Tambahkan alat ini ke pengajuan' : 'Peminjaman hanya untuk mahasiswa'}" class="py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"><i class="fas ${dipilih ? 'fa-check' : 'fa-clipboard-list'} mr-1"></i> ${dipilih ? 'Sudah Dipilih' : 'Tambah ke Pengajuan'}</button>
        </div></div>`;
    }).join('');
}
function showDetail(id) {
    const a = getAset(id); if (!a) return;
    const st = statusAset(a), p = db.policy, dur = bernilaiTinggi(a) ? p.durasiTinggi : p.durasiUmum;
    $('detail-title').textContent = a.name; $('detail-id').textContent = a.id; $('detail-category').textContent = a.kategori; $('detail-location').textContent = a.lokasi;
    $('detail-spek').textContent = a.spek || '-';
    $('detail-available').textContent = `${tersedia(a)} dari ${a.total} unit`;
    $('detail-kondisi').textContent = `${unitBaik(a)} unit baik` + (a.rusak ? `, ${a.rusak} dalam perbaikan` : '') + (a.hilang ? `, ${a.hilang} hilang` : '');
    $('detail-icon').className = `fas ${a.icon} text-8xl text-teal-600`;
    $('detail-status').textContent = st.toUpperCase();
    $('detail-status').className = 'px-3 py-1 rounded-full text-xs font-bold ' + (st === 'Tersedia' ? 'bg-green-100 text-green-700' : st === 'Dipinjam' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700');
    $('detail-rules').innerHTML = `<strong>Aturan pinjam:</strong> ${bernilaiTinggi(a) ? 'alat bernilai tinggi' : 'alat umum'}, maksimal <b>${dur} hari kerja</b>. Keterlambatan dikenai denda ${rp(p.dendaHari)} per alat per hari kerja (maksimal ${rp(p.dendaMaks)} per transaksi). Selengkapnya di menu Aturan Peminjaman.`;
    const habis = tersedia(a) === 0;
    $('btn-pinjam-detail').innerHTML = '<i class="fas fa-clipboard-list"></i> Ajukan Peminjaman';
    $('btn-pinjam-detail').disabled = habis || me.role !== 'Mahasiswa';
    $('btn-pinjam-detail').classList.toggle('opacity-50', habis || me.role !== 'Mahasiswa');
    $('btn-pinjam-detail').title = me.role === 'Mahasiswa' ? (habis ? 'Stok alat habis' : 'Ajukan peminjaman alat ini') : 'Peminjaman hanya untuk mahasiswa';
    $('btn-pinjam-detail').onclick = () => startLoanRequest(a.id);
    switchView('detail');
}

// ================= PEMINJAMAN =================
function startLoanRequest(id) {
    if (me.role !== 'Mahasiswa') return showToast('Pengajuan peminjaman alat hanya dapat dilakukan oleh mahasiswa.', 'error');
    const a = getAset(id);
    if (!a || a.dihapus) return showToast('Alat tidak ditemukan.', 'error');
    if (tersedia(a) < 1) return showToast(`Stok ${a.name} sedang tidak tersedia.`, 'error');
    if (loanRequest.items.some(item => item.toolId === id)) return showToast(`${a.name} sudah ada dalam daftar pengajuan.`, 'error');
    loanRequest.items.push({ toolId: id, qty: 1 });
    switchView('peminjaman');
}

function siapkanFormPinjam() {
    const p = db.policy, besok = nextKerja(addDays(todayISO(), 1));
    renderFormItems();
    $('syarat-teks').textContent = 'Saya menyetujui Syarat & Ketentuan Peminjaman Laboratorium. ' + (p.tnc || '');
    const tp = $('pinjam-tgl-pinjam'), tk = $('pinjam-tgl-kembali');
    tp.min = besok; tk.min = tp.value || besok; tp.onchange = () => { tk.min = tp.value; if (tk.value && tk.value < tp.value) tk.value = tp.value; };
    ['pinjam-jam-pinjam', 'pinjam-jam-kembali'].forEach(i => { $(i).min = p.jamBuka; $(i).max = p.jamTutup; });
    if (!$('pinjam-jam-pinjam').value) $('pinjam-jam-pinjam').value = '09:00';
    if (!$('pinjam-jam-kembali').value) $('pinjam-jam-kembali').value = '15:00';
}
function ubahQtyPengajuan(id, v) {
    const item = loanRequest.items.find(entry => entry.toolId === id), a = getAset(id);
    v = Number(v);
    if (!item || !a) return renderFormItems();
    if (!Number.isInteger(v) || v < 1 || v > tersedia(a)) {
        showToast(`Jumlah ${a.name} harus 1 - ${tersedia(a)} unit.`, 'error');
        return renderFormItems();
    }
    item.qty = v;
}
function hapusItemPengajuan(id) {
    loanRequest.items = loanRequest.items.filter(item => item.toolId !== id);
    renderFormItems();
}
function renderFormItems() {
    const rows = loanRequest.items.map(item => {
        const a = getAset(item.toolId);
        if (!a || a.dihapus) return `<div class="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"><p class="text-xs text-rose-700">Alat ${esc(item.toolId)} tidak lagi tersedia.</p><button type="button" onclick="hapusItemPengajuan('${esc(item.toolId)}')" class="text-xs font-semibold text-rose-700 hover:underline">Hapus</button></div>`;
        return `<div class="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2"><i class="fas ${esc(a.icon)} text-teal-600"></i><div class="flex-1 min-w-0"><p class="text-xs font-bold text-gray-800 truncate">${esc(a.name)}</p><p class="text-[10px] text-gray-400 font-mono">${esc(a.id)} · Tersedia ${tersedia(a)} unit</p></div><label class="text-xs text-gray-600">Jumlah<input type="number" min="1" max="${tersedia(a)}" step="1" value="${item.qty}" onchange="ubahQtyPengajuan('${esc(a.id)}', this.value)" class="ml-2 w-16 border rounded px-2 py-1 text-xs" aria-label="Jumlah ${esc(a.name)}"></label><button type="button" onclick="hapusItemPengajuan('${esc(a.id)}')" class="text-xs font-semibold text-rose-600 hover:underline">Hapus</button></div>`;
    }).join('');
    $('pinjam-items').innerHTML = `${rows || '<div class="rounded-lg border-2 border-dashed p-4 text-center"><p class="text-xs text-gray-500">Belum ada alat yang dipilih.</p></div>'}<button type="button" onclick="switchView('catalog')" class="w-full rounded-lg border border-dashed border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"><i class="fas fa-plus mr-1"></i>Tambah alat dari katalog</button>`;
}
async function handlePeminjamanSubmit(e) {
    e.preventDefault();
    if (me.role !== 'Mahasiswa') return showToast('Pengajuan peminjaman alat hanya dapat dilakukan oleh mahasiswa.', 'error');
    if (!loanRequest.items.length) return showToast('Pilih minimal satu alat dari katalog.', 'error');
    const tujuanJenis = $('pinjam-tujuan-jenis').value, f = $('pinjam-surat').files[0];
    if (tujuanJenis === 'Proyek Akhir / Skripsi' && !f) return showToast('Proyek tugas akhir wajib melampirkan surat pengantar.', 'error');
    const o = {
        user: me, items: loanRequest.items.map(item => ({ ...item })), tipe: $('pinjam-tipe').value, tujuanJenis, tujuan: $('pinjam-tujuan').value.trim(), surat: f ? f.name : '',
        tglAmbil: $('pinjam-tgl-pinjam').value, jamAmbil: $('pinjam-jam-pinjam').value, tglKembali: $('pinjam-tgl-kembali').value, jamKembali: $('pinjam-jam-kembali').value
    };
    const err = cekPengajuan(o); if (err) return showToast(err, 'error');
    if (f) {
        try { o.suratLampiran = await readLoanAttachment(f); }
        catch (error) { return showToast(error.message, 'error'); }
    }
    const ringkasan = [
        'Periksa ringkasan pengajuan:',
        ...o.items.map(item => {
            const a = getAset(item.toolId);
            return `- ${a.name} (${a.id}): ${item.qty} unit`;
        }),
        `Tipe: ${o.tipe}`,
        `Jadwal ambil: ${fmtTgl(o.tglAmbil)} pukul ${o.jamAmbil}`,
        `Jadwal kembali: ${fmtTgl(o.tglKembali)} pukul ${o.jamKembali}`,
        `Tujuan: ${o.tujuanJenis} - ${o.tujuan}`,
        `Surat pengantar: ${o.surat || 'Tidak dilampirkan'}`,
        '',
        'Pengajuan akan berstatus Menunggu Persetujuan sampai ditinjau Admin. Lanjutkan?'
    ].join('\n');
    if (!window.confirm(ringkasan)) return;
    const l = buatLoan(o, ST.MENUNGGU);
    notify({ untuk: 'ADMIN', icon: 'fa-inbox', style: 'text-sky-600 bg-sky-50', title: 'Pengajuan peminjaman baru', desc: `${me.name} mengajukan ${loanNama(l)} (${l.id}).`, view: 'loans' });
    log(`Ajukan peminjaman ${l.id}`); loanRequest.items = []; e.target.reset(); save();
    showToast(`Pengajuan ${l.id} terkirim. Pantau status dan tindakan berikutnya di menu Peminjaman Saya.`); switchView('pengembalian');
}

// ================= PENGEMBALIAN =================
function infoDenda(l) { const f = db.fines.find(x => x.loanId === l.id && x.status === 'Berjalan'); return f ? `<p class="text-[11px] text-rose-600 mt-1">Denda berjalan ${rp(f.nominal)} (${f.hari} hari kerja)</p>` : ''; }
function renderPengembalian() {
    const rank = { [ST.TERLAMBAT]: 0, [ST.DIPINJAM]: 1, [ST.SIAP]: 2, [ST.MENUNGGU]: 3 };
    const rows = myLoans().filter(l => HOLD.includes(l.status)).sort((a, b) => rank[a.status] - rank[b.status]);
    $('pengembalian-table').innerHTML = rows.map(l => {
        const late = l.status === ST.TERLAMBAT, out = OUT.includes(l.status);
        const btn = (t, fn, cls, dis = '') => `<button ${dis ? `disabled title="${esc(dis)}"` : ''} onclick="${fn}" class="px-3 py-1.5 ${cls} text-white text-xs rounded shadow-sm font-medium ${dis ? 'opacity-40 cursor-not-allowed' : ''}">${t}</button>`;
        let aksi = '';
        if (l.status === ST.MENUNGGU) aksi = `<span class="text-xs text-blue-600"><i class="fas fa-hourglass-half mr-1"></i> Admin sedang memeriksa. Anda masih dapat membatalkan sebelum alat diserahkan.</span>` + btn('Batalkan Pengajuan', `batalkanLoan('${l.id}')`, 'bg-rose-500 hover:bg-rose-600');
        else if (l.status === ST.SIAP) aksi = `<div class="w-full rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-900"><b>Langkah berikutnya:</b> datang ke ruang Admin pada ${fmtTgl(l.tglAmbil)} pukul ${l.jamAmbil}. Tunjukkan bukti dan kode pengambilan di bawah, lalu periksa kondisi serta kelengkapan alat saat serah terima.<br><b>Pembatalan:</b> masih bisa dilakukan hanya sebelum alat diserahkan.</div>` + btn('<i class="fas fa-receipt mr-1"></i> Lihat Bukti &amp; Kode', `bukaBukti('${l.id}')`, 'bg-navy hover:bg-gray-800') + btn('Batalkan Pengajuan', `batalkanLoan('${l.id}')`, 'bg-rose-500 hover:bg-rose-600');
        else aksi = l.items.filter(item => qtySisaItem(item) > 0).map(item => `<div class="w-full flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2 text-xs"><span class="min-w-[140px] flex-1">${esc(item.nama)} — sisa ${qtySisaItem(item)} unit</span>${item.returnRequestedQty ? '<span class="font-semibold text-teal-700">Menunggu cek Admin</span>' : `<label class="text-gray-600">Jumlah<input id="return-qty-${esc(l.id)}-${esc(item.toolId)}" type="number" min="1" max="${qtySisaItem(item)}" step="1" value="${qtySisaItem(item)}" class="ml-1 w-16 rounded border px-2 py-1" aria-label="Jumlah ${esc(item.nama)} untuk dikembalikan"></label><button type="button" onclick="ajukanKembali('${esc(l.id)}','${esc(item.toolId)}')" class="rounded bg-teal-600 px-2 py-1 text-white font-semibold hover:bg-teal-700">Ajukan Kembali</button>`}</div>`).join('')
            + btn(l.buktiFoto ? 'Bukti Terunggah' : 'Upload Bukti', `openUploadBukti('${l.id}')`, l.buktiFoto ? 'bg-green-600 hover:bg-green-700' : 'bg-navy hover:bg-gray-800')
            ;
        const info = l.status === ST.SIAP ? `Jadwal ambil ${fmtTgl(l.tglAmbil)} ${l.jamAmbil} | kode <b class="font-mono">${esc(l.kode || '-')}</b>` : `Sisa: ${loanQtySisa(l)} dari ${loanQty(l)} unit | ID: ${l.id}`;
        return `<tr class="hover:bg-gray-50"><td class="px-4 py-4"><p class="font-bold text-gray-800">${esc(loanNama(l))}</p><p class="text-xs text-gray-500">${info}</p></td>
        <td class="px-4 py-4 font-semibold ${late ? 'text-rose-600' : 'text-gray-700'}">${fmtTgl(l.tglKembali)}<br><span class="text-xs font-normal text-gray-400">${l.jamKembali}</span></td>
        <td class="px-4 py-4">${badgeLoan(l.status)}${late ? infoDenda(l) : ''}</td><td class="px-4 py-4"><div class="flex flex-wrap gap-2 items-center">${aksi}</div></td></tr>`;
    }).join('') || kosong(4, 'Tidak ada alat yang sedang Anda pinjam atau ajukan saat ini.');
}
function batalkanLoan(id) {
    const l = db.loans.find(x => x.id === id); if (!l || ![ST.MENUNGGU, ST.SIAP].includes(l.status)) return;
    if (!confirm(`Batalkan pengajuan ${id}? Pembatalan hanya dapat dilakukan sebelum alat diserahkan oleh Admin.`)) return;
    gantiStatusLoan(l, ST.BATAL, 'Dibatalkan peminjam');
    notify({ untuk: 'ADMIN', icon: 'fa-ban', style: 'text-gray-600 bg-gray-50', title: 'Pengajuan dibatalkan', desc: `${me.name} membatalkan ${id}.`, view: 'loans' });
    log('Batalkan pengajuan ' + id); save(); showToast('Pengajuan dibatalkan.'); renderAll();
}
function ajukanKembali(id, toolId) {
    const l = db.loans.find(x => x.id === id);
    const item = l && l.items.find(entry => entry.toolId === toolId);
    if (!l || !item || !OUT.includes(l.status)) return showToast('Item peminjaman tidak ditemukan atau tidak sedang dipinjam.', 'error');
    if (item.returnRequestedQty > 0) return showToast('Pengembalian item ini sudah diajukan dan menunggu pemeriksaan Admin.', 'error');
    const input = $(`return-qty-${id}-${toolId}`), qty = Number(input.value), remaining = qtySisaItem(item);
    if (!Number.isInteger(qty) || qty < 1 || qty > remaining) return showToast(`Jumlah pengembalian harus 1 - ${remaining} unit.`, 'error');
    if (!confirm(`Pastikan ${qty} unit ${item.nama} sudah dibawa ke ruang Admin. Ajukan pengembalian item ini?`)) return;
    item.returnRequestedQty = qty;
    l.pengembalianDiajukan = true;
    notify({ untuk: 'ADMIN', icon: 'fa-undo', style: 'text-teal-600 bg-teal-50', title: 'Pengembalian diajukan', desc: `${me.name} mengajukan pengembalian ${qty} unit ${item.nama} pada transaksi ${id}.`, view: 'loans' });
    log(`Ajukan pengembalian ${id}: ${item.nama} x${qty}`); save(); showToast('Pengembalian item diajukan. Menunggu pemeriksaan Admin.'); renderAll();
}
function bukaBukti(id) {
    const l = db.loans.find(x => x.id === id);
    $('bukti-isi').innerHTML = `<div class="border-2 border-dashed border-gray-300 rounded-xl p-5 space-y-2" id="bukti-cetak">
        <p class="text-center font-bold text-gray-800">${esc(db.settings.lembaga)}</p><p class="text-center text-xs text-gray-500 mb-2">Bukti Peminjaman Alat Laboratorium</p>
        <div class="text-center py-2"><p class="text-[11px] text-gray-400">Kode pengambilan</p><p class="text-3xl font-mono font-bold tracking-widest text-teal-700">${esc(l.kode || '-')}</p></div>
        <p><b>ID:</b> ${l.id}</p><p><b>Peminjam:</b> ${esc(l.nama)} (${l.nim})</p><p><b>Alat:</b> ${esc(loanNama(l))}</p>
        <p><b>Ambil:</b> ${fmtTgl(l.tglAmbil)} ${l.jamAmbil}</p><p><b>Kembali:</b> ${fmtTgl(l.tglKembali)} ${l.jamKembali}</p><p><b>Status:</b> ${esc(l.status)}</p>
        <p class="text-[11px] text-gray-400 pt-2">Tunjukkan bukti ini kepada Admin saat pengambilan dan pengembalian.</p></div>`;
    $('modal-bukti-pinjam').classList.remove('hidden');
}
function cetakHtml(judul, isi) {
    const w = window.open('', '_blank'); if (!w) return showToast('Pop-up diblokir browser. Izinkan pop-up untuk mencetak.', 'error');
    w.document.write(`<!doctype html><title>${esc(judul)}</title><body style="font-family:Arial,sans-serif;max-width:640px;margin:32px auto;line-height:1.6;color:#111">${isi}</body>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}
const cetakBukti = () => cetakHtml('Bukti Peminjaman', $('bukti-cetak').innerHTML.replace(/class="[^"]*"/g, ''));
// upload bukti foto
const kecilkan = (url, maxW = 900) => new Promise(ok => {
    const im = new Image(); im.onerror = () => ok(url);
    im.onload = () => { const r = Math.min(1, maxW / im.width), c = document.createElement('canvas'); c.width = im.width * r; c.height = im.height * r; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', .72)); };
    im.src = url;
});
const ambilFoto = async f => { const d = await readFile(f); return d ? kecilkan(d) : null; };
function readLoanAttachment(file, maxSize = 1024 * 1024) {
    if (file.size > maxSize) return Promise.reject(new Error('Ukuran surat pengantar maksimal 1 MB.'));
    const extension = file.name.split('.').pop().toLowerCase();
    const typeByExtension = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp'
    };
    const type = typeByExtension[extension];
    if (!type) return Promise.reject(new Error('Lampiran harus berupa PDF, DOC, DOCX, JPG, PNG, GIF, atau WEBP.'));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string' || !reader.result.startsWith(`data:${type};base64,`))
                return reject(new Error('Format lampiran tidak dapat dibaca.'));
            resolve({ name: file.name, type, data: reader.result });
        };
        reader.onerror = () => reject(new Error('Gagal membaca surat pengantar.'));
        reader.readAsDataURL(file);
    });
}
function openUploadBukti(id) {
    ui.trx = id; ui.bukti = null; $('upload-trx-id').textContent = id; $('input-bukti').value = '';
    const l = db.loans.find(x => x.id === id), im = $('preview-bukti');
    im.src = l.buktiFoto || ''; im.classList.toggle('hidden', !l.buktiFoto); $('upload-placeholder').classList.toggle('hidden', !!l.buktiFoto);
    $('modal-upload-bukti').classList.remove('hidden');
}
async function previewBukti(e) {
    try { ui.bukti = await ambilFoto(e.target.files[0]); } catch (m) { e.target.value = ''; return showToast(m, 'error'); }
    if (!ui.bukti) return; $('preview-bukti').src = ui.bukti; $('preview-bukti').classList.remove('hidden'); $('upload-placeholder').classList.add('hidden');
}
function simpanBukti() {
    if (!ui.bukti) return showToast('Pilih foto bukti terlebih dahulu.', 'error');
    const l = db.loans.find(x => x.id === ui.trx); l.buktiFoto = ui.bukti; save(); tutupUploadBukti(); renderAll(); showToast('Foto bukti peminjaman berhasil diunggah.');
}
function tutupUploadBukti() { $('modal-upload-bukti').classList.add('hidden'); ui.trx = null; ui.bukti = null; }

// ================= RIWAYAT =================
function renderRiwayat() {
    const bayar = db.fines.filter(f => f.nim === me.nim && ['Menunggu Verifikasi', 'Lunas'].includes(f.status)).reverse().map(f => {
        const l = db.loans.find(x => x.id === f.loanId), ok = f.status === 'Lunas';
        return `<tr class="hover:bg-gray-50"><td class="px-6 py-4 font-mono text-xs font-semibold text-gray-500">${f.id}</td><td class="px-6 py-4 font-bold text-gray-800"><i class="fas fa-money-bill-wave text-rose-500 mr-1"></i> Pembayaran Denda<br><span class="text-xs font-normal text-gray-400">${esc(f.alat)} | ${rp(f.nominal)} | ${esc(f.metode || '-')}</span></td><td class="px-6 py-4">Denda keterlambatan (${f.loanId})</td><td class="px-6 py-4">${l ? fmtTgl(l.tglAmbil) : '-'}</td><td class="px-6 py-4">${l ? fmtTgl(l.tglKembali) : '-'}</td><td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${ok ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">${ok ? 'Disetujui' : 'Menunggu Admin Setujui'}</span></td></tr>`;
    }).join('');
    const trx = myLoans().map(l => `<tr class="hover:bg-gray-50"><td class="px-6 py-4 font-mono text-xs font-semibold text-gray-500">${l.id}</td><td class="px-6 py-4 font-bold text-gray-800">${esc(loanNama(l))}<br><span class="text-xs font-normal text-gray-400">${esc(l.tipe)}</span></td><td class="px-6 py-4 max-w-[180px] truncate" title="${esc(l.tujuan)}">${esc(l.tujuan)}</td><td class="px-6 py-4">${fmtTgl(l.tglAmbil)}</td><td class="px-6 py-4">${fmtTgl(l.tglKembali)}</td><td class="px-6 py-4">${badgeLoan(l.status)}${l.status === ST.DITOLAK && l.alasan ? `<p class="text-[11px] text-rose-600 mt-1 max-w-[200px]"><b>Alasan penolakan:</b> ${esc(l.alasan)}</p>` : ''}</td></tr>`).join('');
    $('laporan-table').innerHTML = bayar + trx || kosong(6, 'Belum ada riwayat peminjaman.');
}

// ================= BOOKING RUANG =================
const bkRuang = () => Object.keys(db.policy.kapasitas);
function siapkanViewBooking() {
    const p = db.policy, sel = $('booking-ruang'), keep = sel.value, besok = nextKerja(addDays(todayISO(), 1));
    sel.innerHTML = '<option value="">-- Pilih Ruang --</option>' + bkRuang().map(r => `<option value="${esc(r)}">${esc(labNama(r))}</option>`).join(''); sel.value = keep;
    ['booking-tgl-mulai', 'booking-tgl-selesai'].forEach(i => $(i).min = besok);
    ['booking-jam-mulai', 'booking-jam-selesai'].forEach(i => { $(i).min = p.jamBuka; $(i).max = p.jamTutup; });
    $('bk-hint').textContent = `Jam yang sama berlaku setiap hari selama rentang tanggal. Hari kerja Senin - Jumat, ${p.jamBuka} - ${p.jamTutup} WIB, maksimal ${p.maksBooking} hari kerja.`;
    if (!ui.bk) { const d = new Date(); ui.bk = { y: d.getFullYear(), m: d.getMonth() }; }
    const k = p.kapasitas[sel.value]; $('booking-kapasitas-info').textContent = k ? `Kapasitas ${labNama(sel.value)}: maksimal ${k} orang.` : '';
    if (k) $('booking-peserta').max = k;
    renderKalenderBooking(); cekBentrokLive();
}
function onRuangBookingChange() { siapkanViewBooking(); }
function onTglMulaiBooking() { const s = $('booking-tgl-selesai'); s.min = $('booking-tgl-mulai').value; if (!s.value || s.value < s.min) s.value = s.min; cekBentrokLive(); }
function geserKalenderBooking(n) { const d = new Date(ui.bk.y, ui.bk.m + n, 1); ui.bk = { y: d.getFullYear(), m: d.getMonth() }; renderKalenderBooking(); }
function renderKalenderBooking() {
    const r = $('booking-ruang').value, { y, m } = ui.bk, first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), today = todayISO();
    $('booking-kalender-judul').textContent = first.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const list = r ? db.bookings.filter(b => b.ruang === r && ['Disetujui', 'Menunggu Persetujuan'].includes(b.status)) : [];
    let h = '<span></span>'.repeat(off);
    for (let d = 1; d <= n; d++) {
        const s = `${y}-${pad(m + 1)}-${pad(d)}`, wk = !isHariKerja(s), hit = list.filter(b => !wk && b.tglMulai <= s && s <= b.tglSelesai);
        const cls = hit.some(b => b.status === 'Disetujui') ? 'bg-rose-200 text-rose-800 font-bold' : hit.length ? 'bg-amber-200 text-amber-800 font-bold' : wk ? 'text-gray-300' : 'bg-gray-50 text-gray-700 hover:bg-teal-50';
        h += `<button type="button" ${wk || s <= today ? 'disabled' : ''} onclick="pilihTglBooking('${s}')" title="${hit.map(b => b.jamMulai + '-' + b.jamSelesai + ' ' + b.status).join(', ')}" class="h-9 rounded-lg text-xs flex items-center justify-center ${cls} ${s === today ? 'ring-2 ring-teal-600' : ''}">${d}</button>`;
    }
    $('booking-kalender-grid').innerHTML = h;
    const prefix = `${y}-${pad(m + 1)}`, bulanIni = list.filter(b => b.tglMulai.slice(0, 7) <= prefix && b.tglSelesai.slice(0, 7) >= prefix);
    $('booking-jadwal-judul').textContent = r ? 'Jadwal ' + labNama(r) + ' bulan ini' : 'Jadwal ruang';
    $('booking-jadwal-list').innerHTML = !r ? '<p class="text-xs text-gray-400">Pilih ruang untuk melihat jadwal terisi.</p>' : bulanIni.map(b => `<div class="p-3 rounded-lg text-xs border ${b.status === 'Disetujui' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}"><b>${fmtTgl(b.tglMulai)}${b.tglSelesai !== b.tglMulai ? ' - ' + fmtTgl(b.tglSelesai) : ''}</b> | ${b.jamMulai} - ${b.jamSelesai}<br><span class="text-gray-500">${esc(b.tujuan)} | ${b.status}</span></div>`).join('') || '<p class="text-xs text-gray-400">Belum ada jadwal pada bulan ini.</p>';
}
function pilihTglBooking(s) { $('booking-tgl-mulai').value = s; onTglMulaiBooking(); }
function bkForm() { return { ruang: $('booking-ruang').value, tglMulai: $('booking-tgl-mulai').value, tglSelesai: $('booking-tgl-selesai').value, jamMulai: $('booking-jam-mulai').value, jamSelesai: $('booking-jam-selesai').value }; }
function cekBentrokLive() {
    const f = bkForm(), box = $('booking-info');
    if (!f.ruang || !f.tglMulai || !f.tglSelesai || !f.jamMulai || !f.jamSelesai || f.jamSelesai <= f.jamMulai) return box.classList.add('hidden');
    const a = bookingKonflik(f.ruang, f.tglMulai, f.tglSelesai, f.jamMulai, f.jamSelesai, null, ['Disetujui']), w = bookingKonflik(f.ruang, f.tglMulai, f.tglSelesai, f.jamMulai, f.jamSelesai, null, ['Menunggu Persetujuan']);
    box.classList.remove('hidden');
    box.className = 'text-xs rounded-lg border px-4 py-3 ' + (a.length ? 'bg-rose-50 border-rose-200 text-rose-700' : w.length ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700');
    box.innerHTML = a.length ? `<i class="fas fa-times-circle mr-1"></i> Bentrok dengan booking yang sudah disetujui (${a.map(b => b.id).join(', ')}). Pilih jadwal lain.`
        : w.length ? `<i class="fas fa-exclamation-triangle mr-1"></i> Ada pengajuan lain yang masih menunggu pada jadwal ini; Admin yang menentukan.` : '<i class="fas fa-check-circle mr-1"></i> Jadwal tersedia.';
}
function handleBookingSubmit(e) {
    e.preventDefault();
    const p = db.policy, f = bkForm(), today = todayISO(), peserta = +$('booking-peserta').value, kontak = $('booking-pj-kontak').value.trim();
    const sa = statusAkun(me.nim); let err = '';
    if (!sa.boleh) err = sa.alasan;
    else if (f.tglMulai <= today) err = 'Booking paling lambat H-1; tanggal mulai tidak boleh hari ini atau yang sudah lewat.';
    else if (f.tglSelesai < f.tglMulai) err = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    else if (!isHariKerja(f.tglMulai) || !isHariKerja(f.tglSelesai)) err = 'Booking hanya pada hari kerja (Senin - Jumat, bukan hari libur).';
    else if (hariKerjaInklusif(f.tglMulai, f.tglSelesai) > p.maksBooking) err = `Booking maksimal ${p.maksBooking} hari kerja.`;
    else if (f.jamMulai < p.jamBuka || f.jamSelesai > p.jamTutup || f.jamSelesai <= f.jamMulai) err = `Jam harus dalam ${p.jamBuka} - ${p.jamTutup} dan jam selesai setelah jam mulai.`;
    else if (!(peserta >= 1) || peserta > p.kapasitas[f.ruang]) err = `Jumlah peserta maksimal ${p.kapasitas[f.ruang]} orang untuk ${labNama(f.ruang)}.`;
    else if (!/^[0-9+]{9,15}$/.test(kontak)) err = 'Kontak penanggung jawab harus berupa nomor HP yang valid.';
    else if (bookingKonflik(f.ruang, f.tglMulai, f.tglSelesai, f.jamMulai, f.jamSelesai, null, ['Disetujui']).length) err = 'Jadwal bentrok dengan booking yang sudah disetujui.';
    if (err) return showToast(err, 'error');
    const b = { id: nextId('BKG'), nim: me.nim, nama: me.name, ...f, peserta, pj: $('booking-pj').value.trim(), kontak, tujuan: $('booking-tujuan').value.trim(), status: 'Menunggu Persetujuan', createdAt: new Date().toISOString() };
    db.bookings.unshift(b);
    notify({ untuk: 'ADMIN', icon: 'fa-door-open', style: 'text-sky-600 bg-sky-50', title: 'Booking ruang baru', desc: `${me.name} mengajukan ${labNama(b.ruang)} (${b.id}).`, view: 'bookings' });
    log('Ajukan booking ' + b.id); save(); e.target.reset(); switchView('booking'); showToast(`Booking ${b.id} terkirim dan menunggu persetujuan Admin. Pantau statusnya di bagian Booking Saya.`);
}
function renderBookingHistory() {
    const bs = db.bookings.filter(x => x.nim === me.nim), cls = { Disetujui: 'bg-green-100 text-green-800', 'Menunggu Persetujuan': 'bg-blue-100 text-blue-800', Ditolak: 'bg-red-100 text-red-800', Dibatalkan: 'bg-gray-100 text-gray-600', Selesai: 'bg-teal-100 text-teal-800', 'Tidak Digunakan': 'bg-gray-100 text-gray-600' };
    const canCancel = b => ['Menunggu Persetujuan', 'Disetujui'].includes(b.status) && todayISO() < b.tglMulai;
    const cancelAction = b => canCancel(b)
        ? `<button onclick="batalkanBooking('${esc(b.id)}')" class="rounded bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600">Batalkan</button>`
        : '<span class="text-xs text-gray-400">Tidak ada tindakan</span>';
    $('booking-history-table').innerHTML = bs.map(b =>
        `<tr class="hover:bg-gray-50"><td class="px-6 py-4 font-mono text-xs font-semibold text-gray-500">${esc(b.id)}</td><td class="px-6 py-4 font-bold text-gray-800">${esc(labNama(b.ruang))}<br><span class="text-xs font-normal text-gray-400">${b.peserta} peserta</span></td><td class="px-6 py-4 max-w-[160px] truncate" title="${esc(b.tujuan)}">${esc(b.tujuan)}</td><td class="px-6 py-4">${fmtTgl(b.tglMulai)}${b.tglSelesai !== b.tglMulai ? ' - ' + fmtTgl(b.tglSelesai) : ''}</td><td class="px-6 py-4">${esc(b.jamMulai)} - ${esc(b.jamSelesai)}</td><td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${cls[b.status] || 'bg-gray-100 text-gray-600'}">${esc(b.status)}</span>${b.alasan ? `<p class="text-[11px] text-rose-600 mt-1">Alasan: ${esc(b.alasan)}</p>` : ''}</td><td class="px-6 py-4"><button onclick="switchView('booking')" class="text-xs font-semibold text-teal-700 hover:underline">Buka Booking Saya</button></td></tr>`
    ).join('') || kosong(7, 'Belum ada riwayat booking ruang.');
    $('booking-my-table').innerHTML = bs.map(b =>
        `<tr class="hover:bg-gray-50"><td class="px-4 py-3"><b class="font-mono text-xs text-gray-700">${esc(b.id)}</b><br><span class="text-xs text-gray-500">${esc(labNama(b.ruang))} · ${b.peserta} peserta</span><br><span class="text-xs text-gray-400">${esc(b.tujuan)}</span></td><td class="px-4 py-3 text-xs">${fmtTgl(b.tglMulai)}${b.tglSelesai !== b.tglMulai ? ' - ' + fmtTgl(b.tglSelesai) : ''}<br>${esc(b.jamMulai)} - ${esc(b.jamSelesai)}</td><td class="px-4 py-3"><span class="rounded-full px-3 py-1 text-xs font-bold ${cls[b.status] || 'bg-gray-100 text-gray-600'}">${esc(b.status)}</span>${b.alasan ? `<p class="mt-2 text-xs text-rose-600">Alasan: ${esc(b.alasan)}</p>` : ''}${b.status === 'Disetujui' ? '<p class="mt-2 text-xs text-gray-600">Jadwal terkonfirmasi. Hadiri kegiatan sesuai tanggal dan jam yang tertera. Setelah waktu berakhir, Admin akan mencatat apakah kegiatan selesai atau tidak digunakan.</p>' : ''}${b.status === 'Selesai' ? '<p class="mt-2 text-xs text-teal-700">Kegiatan telah dicatat selesai oleh Admin.</p>' : ''}${b.status === 'Tidak Digunakan' ? '<p class="mt-2 text-xs text-gray-600">Admin mencatat booking ini tidak digunakan.</p>' : ''}<div class="mt-2">${cancelAction(b)}</div></td></tr>`
    ).join('') || '<tr><td colspan="3" class="px-4 py-8 text-center text-xs text-gray-400">Belum ada booking. Isi formulir untuk mengajukan jadwal ruang.</td></tr>';
}
function batalkanBooking(id) {
    const b = db.bookings.find(x => x.id === id);
    if (!b || b.nim !== me.nim) return showToast('Booking tidak ditemukan.', 'error');
    if (!['Menunggu Persetujuan', 'Disetujui'].includes(b.status) || todayISO() >= b.tglMulai) return showToast('Booking hanya dapat dibatalkan sebelum tanggal mulai.', 'error');
    if (!confirm(`Batalkan booking ${id} untuk ${labNama(b.ruang)} pada ${fmtTgl(b.tglMulai)}?`)) return;
    b.status = 'Dibatalkan'; notify({ untuk: 'ADMIN', icon: 'fa-ban', style: 'text-gray-600 bg-gray-50', title: 'Booking dibatalkan', desc: `${me.name} membatalkan ${id}.`, view: 'bookings' });
    log('Batalkan booking ' + id); save(); showToast('Booking dibatalkan.'); renderAll();
}

// ================= LAPOR KENDALA =================
function isiPilihanAlatLapor() {
    const sel = $('lapor-alat'), keep = sel.value, pinjam = [...new Set(myLoans().filter(l => OUT.includes(l.status)).flatMap(l => l.items.filter(i => qtySisaItem(i) > 0).map(i => i.toolId)))];
    const opt = a => `<option value="${a.id}">${esc(a.name)} (${a.id})</option>`;
    sel.innerHTML = '<option value="">-- Pilih Alat --</option>' + (pinjam.length ? `<optgroup label="Sedang Anda pinjam">${pinjam.map(id => opt(getAset(id))).join('')}</optgroup>` : '') + `<optgroup label="Semua alat">${asetAktif().map(opt).join('')}</optgroup>`;
    sel.value = keep; updateLaporForm();
}
function maxLapor(a) {
    const pinj = myLoans().filter(l => OUT.includes(l.status)).reduce((s, l) => s + l.items.filter(i => i.toolId === a.id).reduce((x, i) => x + qtySisaItem(i), 0), 0);
    return { pinj, mx: pinj || a.total };
}
function updateLaporForm() {
    const jenis = $('lapor-jenis').value, hilang = jenis === JENIS_HILANG, a = getAset($('lapor-alat').value);
    $('lapor-foto-label').textContent = hilang ? '(opsional)' : '(wajib)';
    $('lapor-info').className = 'text-xs rounded-lg border px-4 py-3 leading-relaxed ' + (hilang ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-sky-50 border-sky-100 text-sky-800');
    $('lapor-info').innerHTML = hilang ? 'Kehilangan wajib dilaporkan maksimal <b>1 x 24 jam</b> sejak diketahui. Admin menyusun berita acara dan Anda perlu mengganti dengan barang setara. Selama belum selesai, status akun menjadi <b>Ada Tanggungan</b>.'
        : 'Jangan membongkar atau memperbaiki alat sendiri. Melapor tidak menghentikan batas waktu pengembalian; kembalikan alat sebelum jatuh tempo agar tidak terkena denda.';
    if (!a) { $('lapor-jumlah-info').textContent = 'Pilih alat terlebih dahulu'; return; }
    const { pinj, mx } = maxLapor(a);
    $('lapor-jumlah').max = mx; if (+$('lapor-jumlah').value > mx) $('lapor-jumlah').value = mx;
    $('lapor-jumlah-info').textContent = pinj ? `Anda meminjam ${pinj} unit alat ini.` : `Total ${a.total} unit di inventaris.`;
}
async function previewLaporFoto(e) {
    try { ui.laporFoto = await ambilFoto(e.target.files[0]); } catch (m) { e.target.value = ''; ui.laporFoto = null; return showToast(m, 'error'); }
    const im = $('lapor-foto-preview'); im.src = ui.laporFoto || ''; im.classList.toggle('hidden', !ui.laporFoto);
}
function handleLaporSubmit(e) {
    e.preventDefault();
    const a = getAset($('lapor-alat').value), jenis = $('lapor-jenis').value, tingkat = document.querySelector('input[name="lapor-tingkat"]:checked');
    if (!a) return showToast('Pilih alat yang bermasalah.', 'error');
    if (!tingkat) return showToast('Pilih tingkat keparahan.', 'error');
    if ($('lapor-tgl').value > todayISO()) return showToast('Tanggal kejadian tidak boleh di masa depan.', 'error');
    if (jenis !== JENIS_HILANG && !ui.laporFoto) return showToast('Foto bukti kendala wajib diunggah.', 'error');
    const jumlah = +$('lapor-jumlah').value, mx = maxLapor(a).mx; if (!(jumlah >= 1) || jumlah > mx) return showToast(`Jumlah unit terdampak harus 1 - ${mx}.`, 'error');
    const lp = { id: nextId('LPR'), nim: me.nim, nama: me.name, toolId: a.id, toolName: a.name, jenis, ditemukan: $('lapor-ditemukan').value, tingkat: tingkat.value, tgl: $('lapor-tgl').value, jumlah, deskripsi: $('lapor-deskripsi').value.trim(), foto: ui.laporFoto || '', tahap: 0, riwayat: [{ tahap: TAHAP[0], t: new Date().toISOString(), oleh: me.name, catatan: '' }] };
    db.laporan.unshift(lp);
    notify({ untuk: 'ADMIN', icon: 'fa-triangle-exclamation', style: 'text-rose-600 bg-rose-50', title: 'Laporan kendala baru', desc: `${me.name} melaporkan ${a.name} (${jenis}).`, view: 'tickets' });
    log('Laporan kendala ' + lp.id); save(); e.target.reset(); ui.laporFoto = null; $('lapor-foto-preview').classList.add('hidden');
    const s = $('lapor-sukses'); s.classList.remove('hidden');
    s.innerHTML = `<p class="font-bold text-green-800"><i class="fas fa-check-circle mr-1"></i> Laporan ${lp.id} terkirim</p><p class="text-xs text-green-700 mt-1">Admin akan meninjau laporan Anda. Pantau statusnya di tabel riwayat di bawah dan di notifikasi.</p>`;
    s.scrollIntoView({ behavior: 'smooth' }); renderAll();
}
function renderLaporanKendala() {
    const L = db.laporan.filter(l => l.nim === me.nim), cls = ['bg-blue-100 text-blue-800', 'bg-sky-100 text-sky-800', 'bg-indigo-100 text-indigo-800', 'bg-green-100 text-green-800'];
    $('lapor-ringkasan').textContent = `Total ${L.length} | Diproses ${L.filter(l => l.tahap < 3).length} | Selesai ${L.filter(l => l.tahap === 3).length}`;
    $('lapor-tabel').innerHTML = L.map(l => `<tr class="hover:bg-gray-50"><td class="px-6 py-3 font-mono text-xs font-semibold text-gray-500">${l.id}</td><td class="px-6 py-3 font-bold text-gray-800">${esc(l.toolName)}<br><span class="text-xs font-normal text-gray-400">${l.jumlah} unit</span></td><td class="px-6 py-3">${esc(l.jenis)}</td><td class="px-6 py-3">${fmtTgl(l.tgl)}</td><td class="px-6 py-3"><span class="px-3 py-1 rounded-full text-xs font-bold ${cls[l.tahap]}">${TAHAP[l.tahap]}</span></td><td class="px-6 py-3"><button onclick="bukaDetailLapor('${l.id}')" class="px-3 py-1.5 bg-navy hover:bg-gray-800 text-white text-xs rounded font-medium">Detail</button></td></tr>`).join('') || kosong(6, 'Belum ada laporan.');
}
function bukaDetailLapor(id) {
    const l = db.laporan.find(x => x.id === id); $('dl-judul').textContent = l.toolName; $('dl-sub').textContent = `${l.id} | ${l.jenis}`;
    $('dl-isi').innerHTML = `<div class="grid grid-cols-2 gap-3 text-xs"><div><p class="text-gray-400">Tingkat</p><b>${l.tingkat}</b></div><div><p class="text-gray-400">Ditemukan</p><b>${esc(l.ditemukan)}</b></div><div><p class="text-gray-400">Tanggal kejadian</p><b>${fmtTgl(l.tgl)}</b></div><div><p class="text-gray-400">Unit terdampak</p><b>${l.jumlah}</b></div></div>
    <div><p class="text-xs text-gray-400">Deskripsi</p><p class="text-sm text-gray-700">${esc(l.deskripsi)}</p></div>${l.foto ? `<img src="${l.foto}" alt="Foto bukti" class="max-h-48 rounded-lg border object-contain">` : ''}
    <div><p class="text-xs text-gray-400 mb-2">Perkembangan</p><ol class="space-y-2 border-l-2 border-teal-200 pl-4">${l.riwayat.map(r => `<li class="text-xs"><b class="text-gray-800">${r.tahap}</b> <span class="text-gray-400">${fmtWaktu(r.t)} oleh ${esc(r.oleh)}</span>${r.catatan ? `<br><span class="text-gray-600">${esc(r.catatan)}</span>` : ''}</li>`).join('')}</ol></div>`;
    $('modal-detail-lapor').classList.remove('hidden');
}
const tutupDetailLapor = () => $('modal-detail-lapor').classList.add('hidden');

// ================= SANKSI & DENDA =================
function renderDenda() {
    const p = db.policy, a = statusAkun(me.nim);
    const g = { aman: ['bg-white border-green-200', 'bg-green-100 text-green-600', 'fa-check', 'text-green-600'], peringatan: ['bg-amber-50/40 border-amber-200', 'bg-amber-100 text-amber-600', 'fa-exclamation-triangle', 'text-amber-600'], beku: ['bg-rose-50/40 border-rose-200', 'bg-rose-100 text-rose-600', 'fa-ban', 'text-rose-600'] }[a.level];
    $('akun-card').className = `p-6 rounded-xl border shadow-sm ${g[0]}`;
    $('akun-icon').className = `w-12 h-12 rounded-full flex items-center justify-center text-xl ${g[1]}`; $('akun-icon').innerHTML = `<i class="fas ${g[2]}"></i>`;
    $('akun-judul').className = `text-sm font-semibold ${g[3]}`; $('akun-judul').textContent = a.judul; $('akun-pesan').textContent = a.pesan;
    const sem = db.fines.filter(f => f.nim === me.nim && f.createdAt >= addDays(todayISO(), -182)).length;
    $('akun-counter').textContent = `Keterlambatan 6 bulan terakhir: ${sem} kali (pembekuan pada ${p.kaliTerlambat} kali atau lebih dari ${p.batasBeku} hari kerja dalam satu transaksi).`;
    $('denda-total').textContent = rp(a.totalTunggakan);
    $('denda-keterangan').textContent = a.menungguVerifikasi ? 'Pembayaran menunggu verifikasi Admin. Pengajuan pinjam dan booking baru dibuka setelah pembayaran disetujui.'
        : a.totalBerjalan ? `Termasuk denda berjalan ${rp(a.totalBerjalan)} yang terus bertambah sampai alat dikembalikan.`
            : a.totalTunggakan ? 'Silakan bayar denda lewat tombol Bayar pada tabel di bawah.' : 'Tidak ada denda yang harus dibayar.';
    $('denda-tarif').textContent = `Tarif ${rp(p.dendaHari)} per alat per hari kerja, maksimal ${rp(p.dendaMaks)} per transaksi.`;
    const cls = { Berjalan: 'bg-red-100 text-red-800', 'Belum Dibayar': 'bg-amber-100 text-amber-800', 'Menunggu Verifikasi': 'bg-blue-100 text-blue-800', Lunas: 'bg-green-100 text-green-800', Dibebaskan: 'bg-gray-100 text-gray-600' };
    $('denda-tabel').innerHTML = db.fines.filter(f => f.nim === me.nim).slice().reverse().map(f => {
        const aksi = f.status === 'Belum Dibayar' ? `<button onclick="bukaBayarDenda('${f.id}')" class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded font-medium">Bayar</button>`
            : f.status === 'Berjalan' ? '<span class="text-xs text-gray-400">Bayar setelah alat dikembalikan</span>' : f.status === 'Menunggu Verifikasi' ? '<span class="text-xs text-blue-600">Menunggu verifikasi Admin</span>' : '<span class="text-xs text-gray-300">-</span>';
        return `<tr class="hover:bg-gray-50"><td class="px-6 py-3 font-mono text-xs font-semibold text-gray-500">${f.id}</td><td class="px-6 py-3 font-bold text-gray-800">${esc(f.alat)}<br><span class="text-xs font-normal text-gray-400">${f.loanId}</span></td><td class="px-6 py-3">${f.hari} hari kerja<br><span class="text-xs text-gray-400">jatuh tempo ${fmtTgl(f.jatuhTempo)}</span></td><td class="px-6 py-3 font-semibold">${rp(f.nominal)}</td><td class="px-6 py-3"><span class="px-3 py-1 rounded-full text-xs font-bold ${cls[f.status]}">${f.status}</span>${f.catatan ? `<p class="text-[11px] text-gray-500 mt-1">${esc(f.catatan)}</p>` : ''}</td><td class="px-6 py-3">${aksi}</td></tr>`;
    }).join('') || kosong(6, 'Tidak ada riwayat denda. Pertahankan!');
}
const INSTRUKSI = { QRIS: 'Pindai QRIS resmi laboratorium yang dipajang di ruang Admin, lalu unggah tangkapan layar bukti pembayaran.', 'Transfer Bank': 'Transfer ke rekening yang ditetapkan kampus (tanyakan nomor rekening ke Admin), lalu unggah bukti transfer.', Tunai: 'Bayar tunai langsung ke Admin pada jam layanan. Unggah bukti tidak diperlukan.' };
function bukaBayarDenda(id) {
    const f = db.fines.find(x => x.id === id); ui.fine = id;
    $('bayar-info').textContent = `${f.id} | ${f.alat} | ${f.loanId}`; $('bayar-nominal').textContent = rp(f.nominal); $('bayar-bukti').value = ''; $('bayar-metode').value = 'QRIS';
    updateMetodeBayar(); $('modal-bayar-denda').classList.remove('hidden');
}
function updateMetodeBayar() { const m = $('bayar-metode').value; $('bayar-instruksi').textContent = INSTRUKSI[m]; $('bayar-bukti-wrap').classList.toggle('hidden', m === 'Tunai'); }
const tutupBayarDenda = () => { $('modal-bayar-denda').classList.add('hidden'); ui.fine = null; };
async function konfirmasiBayarDenda() {
    const f = db.fines.find(x => x.id === ui.fine), m = $('bayar-metode').value; let bukti = '';
    if (m !== 'Tunai') {
        try { bukti = await ambilFoto($('bayar-bukti').files[0]); } catch (e) { return showToast(e, 'error'); }
        if (!bukti) return showToast('Unggah bukti pembayaran terlebih dahulu.', 'error');
    }
    f.metode = m; f.bukti = bukti; f.status = 'Menunggu Verifikasi'; f.dibayarAt = new Date().toISOString(); delete f.catatan;
    notify({ untuk: 'ADMIN', icon: 'fa-money-bill-wave', style: 'text-teal-600 bg-teal-50', title: 'Pembayaran denda perlu verifikasi', desc: `${me.name} membayar ${f.id} (${rp(f.nominal)}) via ${m}.`, view: 'fines' });
    log(`Bayar denda ${f.id} via ${m}`); save(); tutupBayarDenda(); showToast('Pembayaran dikirim. Menunggu verifikasi Admin.'); renderAll();
}
function unduhSuratBebas() {
    const a = statusAkun(me.nim), aktif = myLoans().some(l => HOLD.includes(l.status)), denda = db.fines.some(f => f.nim === me.nim && ['Berjalan', 'Belum Dibayar', 'Menunggu Verifikasi'].includes(f.status));
    if (aktif) return showToast('Masih ada pinjaman yang belum selesai.', 'error');
    if (denda) return showToast('Masih ada denda yang belum lunas / belum diverifikasi.', 'error');
    if (!a.boleh) return showToast(a.alasan, 'error');
    const s = db.settings;
    cetakHtml('Surat Bebas Tanggungan', `<div style="text-align:center;border-bottom:3px double #111;padding-bottom:8px"><b style="font-size:18px">${esc(s.lembaga)}</b><br>${esc(s.kopSurat)}</div>
    <h3 style="text-align:center;text-decoration:underline;margin-top:28px">SURAT KETERANGAN BEBAS TANGGUNGAN LABORATORIUM</h3>
    <p>Yang bertanda tangan di bawah ini, Admin Laboratorium IT, menerangkan bahwa:</p>
    <table><tr><td width="130">Nama</td><td>: ${esc(me.name)}</td></tr><tr><td>NIM/NIP</td><td>: ${me.nim}</td></tr><tr><td>Program Studi</td><td>: ${esc(me.prodi)}</td></tr></table>
    <p>telah mengembalikan seluruh alat yang dipinjam dan tidak memiliki tanggungan denda maupun kewajiban penggantian alat di laboratorium.</p>
    <p>Surat ini dibuat untuk digunakan sebagai syarat administrasi.</p><p style="margin-top:40px">Pekanbaru, ${fmtTgl(todayISO())}</p><p style="margin-top:70px"><b>Admin Laboratorium</b></p>`);
    log('Unduh surat bebas tanggungan');
}

// ================= ATURAN, BANTUAN, PROFIL =================
function renderAturan() {
    const p = db.policy, row = (ic, l, t) => `<tr><td class="py-4 px-6 font-semibold text-gray-800"><i class="fas ${ic} w-5 text-gray-400"></i> ${l}</td><td class="py-4 px-6 text-gray-600">${t}</td></tr>`;
    const sec = (c, t) => `<tr class="bg-gray-50"><td colspan="2" class="py-2 px-6 text-xs font-bold ${c} uppercase tracking-wider">${t}</td></tr>`;
    const ul = a => `<ul class="list-disc pl-5 space-y-1">${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
    const kard = (l, v, c, s) => `<div class="bg-white p-5 rounded-xl border border-gray-100 shadow-sm"><p class="text-xs text-gray-400 uppercase font-semibold mb-1">${l}</p><h3 class="text-xl font-bold ${c}">${v}</h3><p class="text-[11px] text-gray-500 mt-1">${s}</p></div>`;
    $('aturan-konten').innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${kard('Tarif Denda', rp(p.dendaHari), 'text-rose-600', 'per alat, per hari kerja')}${kard('Denda Maksimal', rp(p.dendaMaks), 'text-gray-800', 'per transaksi peminjaman')}${kard('Batas Pembekuan', `${p.kaliTerlambat} kali / &gt; ${p.batasBeku} hari`, 'text-amber-600', 'terlambat per semester / per transaksi')}${kard('Lama Pembekuan', p.lamaBeku + ' hari', 'text-gray-800', 'dihitung sejak alat dikembalikan')}</div>
    <div class="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="bg-gray-50 text-gray-500 font-medium border-b border-gray-100"><tr><th class="py-3 px-6 w-1/4">Aturan</th><th class="py-3 px-6">Ketentuan</th></tr></thead><tbody class="divide-y divide-gray-100 align-top">
    ${sec('text-teal-700', 'Peminjaman')}
    ${row('fa-clock', 'Jam layanan', `Senin sampai Jumat, pukul <b>${p.jamBuka} - ${p.jamTutup} WIB</b>, di luar hari libur kampus. Pengambilan dan pengembalian hanya dilayani pada jam ini.`)}
    ${row('fa-user-check', 'Syarat peminjam', ul(['Memiliki akun dengan status <b>Aktif</b>. Pendaftaran mandiri langsung aktif.', 'Status akun <b>Aman</b> (tidak ada tanggungan yang belum diselesaikan dan tidak sedang dibekukan).', 'Peminjaman kelompok atau kelas hanya melalui <b>1 penanggung jawab</b> yang bertanggung jawab atas alat dan denda.']))}
    ${row('fa-calendar-day', 'Durasi pinjam', ul([`Alat umum: maksimal <b>${p.durasiUmum} hari kerja</b>.`, `Alat bernilai tinggi (harga unit mulai ${rp(p.ambangTinggi)}): maksimal <b>${p.durasiTinggi} hari kerja</b>, termasuk untuk proyek tugas akhir.`, `Proyek tugas akhir: maksimal <b>${p.durasiTA} hari</b> dengan surat pengantar; batas alat bernilai tinggi yang lebih ketat tetap berlaku.`]))}
    ${row('fa-layer-group', 'Batas jumlah', `Peminjaman hanya untuk mahasiswa, maksimal <b>${p.maksMhs} jenis alat aktif</b>. Jumlah unit tidak boleh melebihi stok yang tersedia.`)}
    ${row('fa-paper-plane', 'Batas pengajuan', `Paling lambat <b>H-1 pukul ${p.batasAjuan}</b>; tanggal ambil minimal besok. Pengajuan berlaku setelah disetujui Admin.`)}
    ${row('fa-circle-check', 'Persetujuan', 'Seluruh pengajuan ditinjau dan disetujui oleh <b>Admin</b>.')}
    ${row('fa-undo', 'Pengembalian', 'Alat dikembalikan langsung ke Admin dengan menunjukkan <b>bukti peminjaman</b>. Admin memeriksa kelengkapan dan kondisi alat sebelum transaksi dinyatakan selesai.')}
    ${sec('text-rose-600', 'Denda Keterlambatan')}
    ${row('fa-money-bill-wave', 'Tarif denda', `<b>${rp(p.dendaHari)} per alat per hari kerja</b>, maksimal <b>${rp(p.dendaMaks)} per transaksi</b>.<p class="mt-1 text-xs text-gray-500 font-mono">Denda = jumlah unit x hari kerja terlambat x ${rp(p.dendaHari)}</p>`)}
    ${row('fa-calendar-week', 'Cara hitung hari', 'Hanya <b>hari kerja (Senin - Jumat, di luar libur)</b> yang dihitung, mulai dari hari kerja setelah tanggal jatuh tempo. Contoh: jatuh tempo Jumat, dikembalikan Selasa, maka terlambat <b>2 hari kerja</b>.')}
    ${row('fa-hourglass-half', 'Denda berjalan', 'Denda dihitung otomatis dan <b>bertambah setiap hari kerja</b> selama alat belum dikembalikan. Nominal dikunci saat Admin menerima pengembalian, lalu berstatus <i>Belum Dibayar</i>.')}
    ${row('fa-wallet', 'Pembayaran', 'Dibayar lewat menu <b>Sanksi &amp; Denda</b>: QRIS, transfer bank, atau tunai di Admin. Denda berstatus <i>Lunas</i> setelah diverifikasi Admin.')}
    ${row('fa-flag', 'Status akun', ul(['<b class="text-green-600">Aman</b>: tidak ada tanggungan, boleh meminjam.', '<b class="text-amber-600">Ada Tanggungan</b>: ada denda belum lunas atau kehilangan belum diselesaikan; peminjaman baru ditolak.', '<b class="text-rose-600">Akses Dibekukan</b>: tidak dapat meminjam atau booking selama masa pembekuan.']))}
    ${sec('text-rose-600', 'Sanksi & Tanggungan')}
    ${row('fa-ban', 'Pembekuan akses', `Akses pinjam <b>dibekukan ${p.lamaBeku} hari</b> bila terlambat lebih dari <b>${p.batasBeku} hari kerja</b> dalam satu transaksi, atau terlambat <b>${p.kaliTerlambat} kali</b> dalam satu semester.`)}
    ${row('fa-user-slash', 'Blacklist', 'Dapat ditetapkan oleh admin untuk <b>pelanggaran berat</b> (kerusakan disengaja, alat tidak dikembalikan setelah pembekuan, data dipalsukan). Keterlambatan biasa <b>tidak</b> langsung menyebabkan blacklist.')}
    ${row('fa-screwdriver-wrench', 'Kerusakan', 'Kerusakan akibat kelalaian dikenai biaya perbaikan atau penggantian setara; kerusakan wajar tidak dikenai biaya. Penilaian dilakukan admin. Laporkan lewat menu <b>Lapor Kendala</b>.')}
    ${row('fa-magnifying-glass-minus', 'Kehilangan', 'Dilaporkan maksimal <b>1 x 24 jam</b>; wajib berita acara dan penggantian setara. Selama belum diganti, status akun tetap <i>Ada Tanggungan</i>.')}
    ${row('fa-file-circle-check', 'Bebas tanggungan', 'Surat keterangan bebas tanggungan dapat diunduh setelah <b>semua alat dikembalikan dan semua denda lunas</b>.')}
    ${sec('text-sky-700', 'Booking Ruang Lab')}
    ${row('fa-clock', 'Hari &amp; jam', `Hanya <b>Senin - Jumat, ${p.jamBuka} - ${p.jamTutup} WIB</b>, di luar hari libur.`)}
    ${row('fa-paper-plane', 'Batas pengajuan', 'Paling lambat <b>H-1</b>; tanggal mulai tidak boleh hari ini atau yang sudah lewat.')}
    ${row('fa-calendar-day', 'Durasi', `Maksimal <b>${p.maksBooking} hari kerja</b> per pengajuan; jam yang sama berlaku setiap hari dalam rentang tanggal.`)}
    ${row('fa-users', 'Kapasitas', ul(Object.entries(p.kapasitas).map(([r, k]) => `${labNama(r)}: <b>${k}</b> orang`)))}
    ${row('fa-user-shield', 'Penanggung jawab', 'Setiap booking wajib mencantumkan <b>1 penanggung jawab</b> beserta kontak yang bertanggung jawab atas kebersihan ruang, kelengkapan perangkat, dan kerusakan.')}
    ${row('fa-calendar-xmark', 'Jadwal bentrok', 'Bentrok dengan booking yang <b>sudah disetujui</b> ditolak otomatis. Jika hanya bentrok dengan pengajuan yang menunggu, Admin yang menentukan.')}
    ${row('fa-rotate-left', 'Pembatalan', 'Booking berstatus <b>Menunggu Persetujuan</b> atau <b>Disetujui</b> dapat dibatalkan selama tanggal mulai belum tiba. Gunakan tombol Batalkan pada bagian <b>Booking Saya</b>.')}
    </tbody></table></div></div>
    <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-rose-50 p-4 rounded-xl border border-rose-100"><p class="text-xs text-rose-700">Ingin melihat status akun dan denda Anda saat ini?</p><button onclick="switchView('sanksi')" class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shadow-sm"><i class="fas fa-file-invoice-dollar mr-1"></i> Buka Sanksi &amp; Denda</button></div>`;
}
function renderBantuan() {
    const p = db.policy;
    $('faq-denda').innerHTML = `Denda keterlambatan adalah <b>${rp(p.dendaHari)} per alat per hari kerja</b> (Senin - Jumat), maksimal <b>${rp(p.dendaMaks)} per transaksi</b>. Jika terlambat lebih dari ${p.batasBeku} hari kerja atau sudah ${p.kaliTerlambat} kali terlambat dalam satu semester, akses pinjam dibekukan ${p.lamaBeku} hari.`;
    $('btn-wa-admin').href = 'https://wa.me/' + (db.settings.waAdmin || '');
}
function renderProfilStatus() {
    const s = me.status, el = $('profile-status');
    el.textContent = s === 'Aktif' ? 'Keanggotaan Aktif' : s; el.className = 'inline-block mt-4 px-3 py-1 text-xs font-bold rounded-full ' + (s === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700');
}
function saveProfil() {
    const hp = $('profile-hp').value.trim();
    if (hp && !/^[0-9+]{9,15}$/.test(hp)) return showToast('Nomor HP tidak valid (9 - 15 digit).', 'error');
    me.hp = hp; log('Ubah kontak profil'); save(); showToast('Profil diperbarui!');
}
function handleUbahSandi(e) {
    e.preventDefault();
    const lama = $('pw-lama').value, baru = $('pw-baru').value;
    if (me.password !== hashPw(lama, me.nim)) return showToast('Kata sandi lama salah.', 'error');
    const bad = cekSandiBaru(baru); if (bad) return showToast(bad, 'error');
    if (baru === lama) return showToast('Kata sandi baru harus berbeda dari yang lama.', 'error');
    if (baru !== $('pw-konfirmasi').value) return showToast('Konfirmasi kata sandi tidak sama.', 'error');
    me.password = hashPw(baru, me.nim); log('Ubah kata sandi'); save(); e.target.reset(); showToast('Kata sandi berhasil diubah!');
}

// ================= NOTIFIKASI =================
const myNotifs = () => db.notifications.filter(n => n.untuk === me.nim);
function renderNotifications() {
    const L = myNotifs(), unread = L.filter(n => !n.read).length, b = $('notif-badge');
    b.textContent = unread; b.classList.toggle('hidden', !unread);
    $('notif-list').innerHTML = L.slice(0, 30).map(n => `<button onclick="openNotification(${n.id})" class="w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors ${n.read ? '' : 'bg-teal-50/40'}"><span class="w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${n.style}"><i class="fas ${n.icon} text-sm"></i></span><span class="flex-1 min-w-0"><span class="flex items-center justify-between gap-2"><span class="text-sm ${n.read ? 'font-medium text-gray-700' : 'font-bold text-gray-900'}">${esc(n.title)}</span>${n.read ? '' : '<span class="w-2 h-2 bg-rose-500 rounded-full shrink-0"></span>'}</span><span class="block text-xs text-gray-500 mt-0.5 leading-snug">${esc(n.desc)}</span><span class="block text-[10px] text-gray-400 mt-1">${waktuRel(n.t)}</span></span></button>`).join('') || '<p class="py-8 text-center text-sm text-gray-400">Tidak ada notifikasi.</p>';
}
function toggleNotifPanel(e) { e.stopPropagation(); $('notif-panel').classList.toggle('hidden'); }
function markAllNotifRead() { myNotifs().forEach(n => n.read = true); save(); renderNotifications(); }
function openNotification(id) {
    const n = db.notifications.find(x => x.id === id); if (!n) return;
    n.read = true; save(); $('notif-panel').classList.add('hidden'); if (n.view && VIEWS.includes(n.view)) switchView(n.view); else renderNotifications();
}
````

## File: Admin.js
````javascript
// ================= HELPER & DATA =================
const KEY = 'kompas_db_v2', LEGACY_KEY = 'kompas_admin_db', LEGACY_BACKUP_KEY = 'kompas_admin_db_backup', SES = 'kompas_session_admin', LEGACY_SES = 'active_admin';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const localISODate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayISO = () => localISODate(new Date());
function loadAdminSession() {
    let stored = sessionStorage.getItem(SES);
    if (!stored) {
        stored = localStorage.getItem(LEGACY_SES);
        if (stored) sessionStorage.setItem(SES, stored);
    }
    if (localStorage.getItem(LEGACY_SES)) localStorage.removeItem(LEGACY_SES);
    if (!stored) return null;
    try { return JSON.parse(stored); } catch {
        sessionStorage.removeItem(SES);
        return null;
    }
}
const addCalendarDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return localISODate(result);
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };

function adminHashPw(pw, nim) {
    const str = unescape(encodeURIComponent(nim + ':' + pw + ':kompas-lab'));
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    const K = [], H = [];
    for (let c = 2, n = 0; n < 64; c++) {
        let prime = true;
        for (let i = 2; i * i <= c; i++) if (c % i === 0) { prime = false; break; }
        if (prime) { if (n < 8) H[n] = (Math.sqrt(c) * 4294967296) | 0; K[n++] = (Math.cbrt(c) * 4294967296) | 0; }
    }
    const bytes = Array.from(str, c => c.charCodeAt(0));
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    const bitLength = str.length * 8;
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLength >>> (i * 8)) & 255);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const w = new Array(64);
        for (let i = 0; i < 16; i++) w[i] = (bytes[offset + 4 * i] << 24) | (bytes[offset + 4 * i + 1] << 16) | (bytes[offset + 4 * i + 2] << 8) | bytes[offset + 4 * i + 3];
        for (let i = 16; i < 64; i++) {
            const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const s1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + s1 + ch + K[i] + w[i]) | 0;
            const s0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (s0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, h].forEach((value, i) => H[i] = (H[i] + value) | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const legacyRole = role => ({ 'User (Peminjam)': 'Mahasiswa', 'Dosen / Kepala Lab': 'Dosen' }[role] || role || 'Mahasiswa');
const mergeRows = (current, incoming, key) => {
    const ids = new Set(current.map(row => row[key]));
    incoming.forEach(row => { if (!ids.has(row[key])) { current.push(row); ids.add(row[key]); } });
    return current;
};
function normalizeAdminDatabase(source) {
    const users = (source.users || []).map(user => ({
        ...user, name: user.name || user.nama || 'Pengguna', email: user.email || '', role: legacyRole(user.role),
        password: /^[a-f\d]{64}$/i.test(user.password || '') ? user.password : adminHashPw(user.password || 'kompas123', user.nim),
        createdAt: user.createdAt || todayISO()
    }));
    const assets = (source.assets || []).map(asset => {
        const total = Math.max(0, Number(asset.total) || 0);
        const rusak = Math.min(total, Math.max(0, Number(asset.rusak ?? asset.rk) || 0));
        const hilang = Math.min(total - rusak, Math.max(0, Number(asset.hilang) || 0));
        return {
            ...asset, total, status: asset.status || 'Tersedia', icon: asset.icon || 'fa-desktop', spek: asset.spek || '', pj: asset.pj || asset.pinjam || 0,
            rk: rusak, rusak, hilang,
            dihapus: asset.dihapus || String(asset.status || '').startsWith('Dihapus') || asset.status === 'Nonaktif'
        };
    });
    const assetById = id => assets.find(asset => asset.id === id);
    const userByName = name => users.find(user => user.name === name);
    const loans = (source.loans || []).map(loan => {
        if (loan.items) return loan;
        const asset = assetById(loan.aset);
        const waitingCheck = loan.status === 'Menunggu Cek';
        return {
            id: loan.id, nim: loan.nim, nama: loan.nama || loan.peminjam || users.find(user => user.nim === loan.nim)?.name || 'Pengguna',
            tipe: 'Individu', items: [{ toolId: loan.aset, nama: asset?.name || loan.aset, qty: Number(loan.qty) || 1, ...(waitingCheck ? { returnRequestedQty: Number(loan.qty) || 1 } : {}) }],
            tujuanJenis: 'Mata Kuliah / Praktikum', tujuan: loan.tujuan || '', tglAmbil: loan.pinjam || todayISO(), jamAmbil: '09:00',
            tglKembali: loan.kembali || todayISO(), jamKembali: '15:00', surat: '',
            status: waitingCheck ? 'Dipinjam' : loan.status, pengembalianDiajukan: waitingCheck ? new Date().toISOString() : undefined,
            createdAt: loan.createdAt || new Date().toISOString(), riwayat: loan.riwayat || []
        };
    });
    const bookings = (source.bookings || []).map(booking => booking.tglMulai ? booking : ({
        ...booking, nim: booking.nim || userByName(booking.pj)?.nim || '', nama: booking.nama || booking.pj || '',
        tglMulai: booking.tgl || todayISO(), tglSelesai: booking.tgl || todayISO(), jamMulai: booking.jm || '09:00', jamSelesai: booking.js || '10:00',
        createdAt: booking.createdAt || new Date().toISOString()
    }));
    const fines = (source.fines || []).map(fine => fine.nominal != null ? fine : ({
        ...fine, loanId: fine.loan || '', nama: fine.nama || fine.peminjam || '', alat: fine.item || '', qty: fine.qty || 1,
        nominal: fine.jumlah || 0, jatuhTempo: fine.jatuhTempo || fine.tgl || todayISO(), createdAt: fine.createdAt || fine.tgl || todayISO()
    }));
    const stageIndex = { Dilaporkan: 0, Ditinjau: 1, 'Ditinjau Admin': 1, 'Dalam Perbaikan': 2, Selesai: 3 };
    const laporan = (source.laporan || source.issues || []).map(issue => issue.toolId ? issue : ({
        id: issue.id, nim: issue.nim || '', nama: issue.nama || issue.pelapor || '', toolId: issue.aset || '',
        toolName: assetById(issue.aset)?.name || issue.aset || '', jenis: issue.jenis === 'Hilang' ? 'Alat / Komponen Hilang' : issue.jenis === 'Rusak' ? 'Rusak Fisik' : issue.jenis,
        ditemukan: 'Saat digunakan', tingkat: issue.tingkat || 'Sedang', tgl: issue.tgl || todayISO(), jumlah: issue.jumlah || 1,
        deskripsi: issue.deskripsi || '', foto: issue.foto || '', tahap: stageIndex[issue.status] ?? 0,
        riwayat: issue.riwayat || [{ tahap: 'Dilaporkan', t: new Date().toISOString(), oleh: issue.pelapor || 'Pengguna', catatan: '' }]
    }));
    const notifications = (source.notifications || []).concat((source.notifs || []).map((item, index) => ({
        id: Date.now() + index, t: item.at || new Date().toISOString(), read: false, icon: 'fa-bell', style: 'text-sky-600 bg-sky-50',
        untuk: item.nim, title: 'Pembaruan permohonan', desc: item.t || '', view: 'dashboard'
    })));
    const policy = {
        durasiUmum: 3, durasiTinggi: 1, durasiTA: 14, maksMhs: 3,
        dendaHari: 5000, dendaMaks: 100000, batasBeku: 7, kaliTerlambat: 3, lamaBeku: 14,
        jamBuka: '08:00', jamTutup: '16:00', batasAjuan: '15:00', penyusutan: 4, ambangTinggi: 5000000,
        maksBooking: 3, kapasitas: { 'Lab Pemrograman': 40, 'Lab Jaringan': 30, 'Lab Komputasi': 20, 'Lab IoT': 25 }, libur: '', tnc: '',
        ...(source.policy || {})
    };
    delete policy.approver;
    const master = { ...(source.master || {}) };
    master['Kategori Alat'] ||= ['Komputer', 'Jaringan', 'Server', 'Mikrokontroler'];
    master['Lokasi / Lab'] ||= ['Lab Pemrograman', 'Lab Jaringan', 'Lab Komputasi', 'Lab IoT', 'Ruang Laboran'];
    master['Program Studi'] ||= ['Teknik Informatika', 'Sistem Informasi', 'Teknik Elektro'];
    master['Merek'] ||= []; master['Satuan'] ||= []; master['Vendor'] ||= []; master['Mata Kuliah'] ||= [];
    master['Status Aset'] ||= ['Tersedia', 'Maintenance', 'Rusak (menunggu keputusan)', 'Hilang', 'Nonaktif', 'Dihapus (Write-off)'];
    const settings = { lembaga: 'Universitas Islam Riau - Lab IT', kopSurat: '', minPassword: 8, waAdmin: '', ...(source.settings || {}) };
    settings.waAdmin ||= settings.wa || '';
    settings.wa ||= settings.waAdmin;
    const sequence = (prefix, rows) => Math.max(0, ...(rows || []).map(row => Number(String(row.id || '').replace(prefix + '-', '')) || 0));
    return {
        ...source, v: 2, users, assets, loans, bookings, fines, laporan, notifications, policy, master,
        resets: source.resets || [], procurement: source.procurement || [],
        perms: source.perms || [], tren: source.tren || (source.trenDasar || []).map((value, index) => [['Mei', 'Jun', 'Jul', 'Agu', 'Sep'][index], value]),
        trenDasar: source.trenDasar || [], settings,
        logs: source.logs || [], backups: source.backups || [], jadwalBackup: source.jadwalBackup || 'Harian',
        pengumuman: source.pengumuman || [],
        seq: { TRX: sequence('TRX', loans), DND: sequence('DND', fines), BKG: sequence('BKG', bookings), LPR: sequence('LPR', laporan), ...(source.seq || {}) },
        migration: { ...(source.migration || {}) }
    };
}
function mergeLegacyAdmin(shared, legacy) {
    const imported = normalizeAdminDatabase(legacy);
    mergeRows(shared.users, imported.users, 'nim'); mergeRows(shared.assets, imported.assets, 'id');
    mergeRows(shared.loans, imported.loans, 'id'); mergeRows(shared.bookings, imported.bookings, 'id');
    mergeRows(shared.fines, imported.fines, 'id'); mergeRows(shared.laporan, imported.laporan, 'id');
    mergeRows(shared.notifications, imported.notifications, 'id'); mergeRows(shared.procurement, imported.procurement, 'id');
    const existingLogs = new Set(shared.logs.map(item => `${item.t}|${item.user}|${item.aksi}`));
    imported.logs.forEach(item => { const key = `${item.t}|${item.user}|${item.aksi}`; if (!existingLogs.has(key)) shared.logs.push(item); });
    mergeRows(shared.backups, imported.backups, 't');
    Object.entries(imported.master).forEach(([name, values]) => {
        shared.master[name] ||= [];
        values.forEach(value => { if (!shared.master[name].includes(value)) shared.master[name].push(value); });
    });
    if (!shared.perms?.length) shared.perms = imported.perms;
    Object.entries(imported.policy).forEach(([name, value]) => { if (shared.policy[name] == null) shared.policy[name] = value; });
    Object.entries(imported.settings).forEach(([name, value]) => { if (shared.settings[name] == null) shared.settings[name] = value; });
    shared.migration ||= {}; shared.migration.adminV1 = true;
    shared.seq ||= imported.seq;
    return shared;
}
function initializeSharedDatabase() {
    const legacy = load(LEGACY_KEY, null);
    if (legacy && !localStorage.getItem(LEGACY_BACKUP_KEY)) {
        try { localStorage.setItem(LEGACY_BACKUP_KEY, JSON.stringify(legacy)); } catch { }
    }
    let shared = load(KEY, null), importedLegacy = false;
    if (!shared || shared.v !== 2) { shared = normalizeAdminDatabase(legacy || seed()); importedLegacy = !!legacy; }
    else if (legacy && !shared.migration?.adminV1) { shared = mergeLegacyAdmin(shared, legacy); importedLegacy = true; }
    shared = normalizeAdminDatabase(shared);
    shared.migration.adminV1 = !!(shared.migration.adminV1 || importedLegacy);
    localStorage.setItem(KEY, JSON.stringify(shared));
    return shared;
}

const MENU = [
    ['dashboard', 'fa-home', 'Dashboard'], ['users', 'fa-users-cog', 'Pengguna & Peran'], ['master', 'fa-database', 'Data Master'],
    ['policy', 'fa-scale-balanced', 'Kebijakan'], ['assets', 'fa-desktop', 'Aset'], ['procurement', 'fa-cart-flatbed', 'Pengadaan'],
    ['reports', 'fa-chart-line', 'Laporan & Analitik'], ['audit', 'fa-clipboard-list', 'Audit Log'],
    ['settings', 'fa-gear', 'Pengaturan Sistem'], ['backup', 'fa-cloud-arrow-up', 'Backup']
];
const ROLES = ['Mahasiswa', 'Dosen', 'Laboran', 'Admin', 'Pimpinan / Auditor'];
const STATUS_USER = ['Menunggu Verifikasi', 'Aktif', 'Nonaktif', 'Dibekukan', 'Blacklist'];
const BADGE = { Aktif: 'b-green', 'Menunggu Verifikasi': 'b-yellow', Nonaktif: 'b-gray', Dibekukan: 'b-amber', Blacklist: 'b-red',
    Tersedia: 'b-green', Dipesan: 'b-blue', Dipinjam: 'b-yellow', Maintenance: 'b-amber', 'Rusak (menunggu keputusan)': 'b-red', Hilang: 'b-red',
    'Dihapus (Write-off)': 'b-gray', Diusulkan: 'b-yellow', Disetujui: 'b-blue', Ditolak: 'b-red', Terealisasi: 'b-green' };
const badge = s => `<span class="badge ${BADGE[s] || 'b-gray'}">${esc(s)}</span>`;

function seed() {
    const U = (nim, name, email, role, prodi, status, password = 'kompas123') => ({ nim, name, email, role, prodi, status, password });
    return {
        users: [
            { ...U('198001012005', 'Admin KOMPAS', 'admin@uir.ac.id', 'Admin', 'Unit Laboratorium', 'Aktif'), password: 'admin123' },
            U('198020261001', 'Budi Santoso', 'budi@student.uir.ac.id', ROLES[0], 'Teknik Informatika', 'Aktif', 'student123'),
            U('198020261004', 'Reza Pahlevi', 'reza@student.uir.ac.id', ROLES[0], 'Teknik Informatika', 'Aktif', 'student123'),
            U('198020261006', 'Rafi Hidayat', 'rafi@student.uir.ac.id', ROLES[0], 'Sistem Informasi', 'Menunggu Verifikasi', 'student123'),
            U('198020261003', 'Ahmad Dahlan', 'ahmad@student.uir.ac.id', ROLES[0], 'Teknik Informatika', 'Dibekukan', 'student123'),
            U('197905102006', 'Siti Aminah', 'siti@uir.ac.id', 'Laboran', 'Unit Laboratorium', 'Aktif'),
            U('197503202001', 'Dr. Andi Wijaya', 'andi@uir.ac.id', 'Dosen / Kepala Lab', 'Teknik Informatika', 'Aktif', 'student123'),
            U('196801151995', 'Prof. Hendra', 'hendra@uir.ac.id', 'Pimpinan / Auditor', 'Rektorat', 'Aktif')
        ],
        perms: [['Lihat katalog dan ajukan pinjam', 1, 1, 1], ['Setujui peminjaman umum', 0, 1, 1], ['Setujui alat bernilai tinggi', 0, 0, 1],
            ['Serah terima dan pengembalian', 0, 1, 1], ['Kelola aset (tambah dan ubah)', 0, 1, 1], ['Hapus atau write-off aset', 0, 0, 1],
            ['Stock opname dan maintenance', 0, 1, 1], ['Kelola pengguna dan peran', 0, 0, 1], ['Atur kebijakan dan denda', 0, 0, 1],
            ['Audit log dan pengaturan sistem', 0, 0, 1]],
        master: {
            'Kategori Alat': ['Komputer', 'Jaringan', 'Server', 'Mikrokontroler'],
            'Lokasi / Lab': ['Lab Pemrograman', 'Lab Jaringan', 'Lab Komputasi', 'Lab IoT', 'Ruang Laboran'],
            'Merek': ['Dell', 'Lenovo', 'Cisco', 'Mikrotik', 'Logitech', 'Arduino'],
            'Satuan': ['Unit', 'Set', 'Buah', 'Pak'],
            'Vendor': ['PT Mitra Teknologi', 'CV Data Prima', 'Toko Elektro Jaya'],
            'Program Studi': ['Teknik Informatika', 'Sistem Informasi', 'Teknik Elektro'],
            'Mata Kuliah': ['Jaringan Komputer', 'Pemrograman Web', 'Sistem Tertanam', 'Keamanan Server'],
            'Status Aset': ['Tersedia', 'Dipesan', 'Dipinjam', 'Maintenance', 'Rusak (menunggu keputusan)', 'Hilang', 'Nonaktif']
        },
        policy: { durasiUmum: 3, durasiTinggi: 1, durasiTA: 14, maksMhs: 3, dendaHari: 5000, dendaMaks: 100000,
            batasBeku: 7, kaliTerlambat: 3, lamaBeku: 14, jamBuka: '08:00', jamTutup: '16:00', penyusutan: 4, ambangTinggi: 5000000,
            libur: '2026-12-25 Natal\n2027-01-01 Tahun Baru', tnc: 'Peminjam wajib menjaga alat, mengembalikan tepat waktu, dan menerima sanksi atau denda sesuai kebijakan laboratorium.' },
        assets: [
            { id: 'TI-KMP-001', name: 'PC Workstation i7 12th Gen', kategori: 'Komputer', lokasi: 'Lab Pemrograman', total: 10, harga: 12000000, tglBeli: '2023-02-10', sumber: 'Pembelian', garansi: '2026-12-10', servis: 1500000, status: 'Tersedia', pinjam: 42, rusak: 2 },
            { id: 'TI-KMP-002', name: 'Laptop Lenovo ThinkPad E14', kategori: 'Komputer', lokasi: 'Lab Pemrograman', total: 8, harga: 14500000, tglBeli: '2024-03-15', sumber: 'Pembelian', garansi: '2027-03-15', servis: 600000, status: 'Tersedia', pinjam: 51, rusak: 1 },
            { id: 'TI-KMP-005', name: 'Proyektor Epson EB-X06', kategori: 'Komputer', lokasi: 'Ruang Laboran', total: 4, harga: 6500000, tglBeli: '2022-08-01', sumber: 'Hibah', garansi: '', servis: 900000, status: 'Tersedia', pinjam: 30, rusak: 3 },
            { id: 'TI-JRG-001', name: 'Router Cisco Catalyst 2960', kategori: 'Jaringan', lokasi: 'Lab Jaringan', total: 5, harga: 9800000, tglBeli: '2023-06-20', sumber: 'Pembelian', garansi: '2026-11-20', servis: 0, status: 'Tersedia', pinjam: 24, rusak: 0 },
            { id: 'TI-JRG-008', name: 'Access Point Ubiquiti UniFi AC Lite', kategori: 'Jaringan', lokasi: 'Lab Jaringan', total: 3, harga: 1800000, tglBeli: '2023-01-12', sumber: 'Pembelian', garansi: '', servis: 450000, status: 'Maintenance', pinjam: 9, rusak: 4 },
            { id: 'TI-SRV-001', name: 'Dell PowerEdge R740 Server', kategori: 'Server', lokasi: 'Lab Komputasi', total: 2, harga: 85000000, tglBeli: '2022-11-05', sumber: 'Pembelian', garansi: '2025-11-05', servis: 4200000, status: 'Dipinjam', pinjam: 12, rusak: 1 },
            { id: 'TI-IOT-001', name: 'Kit Arduino Uno R3 Starter', kategori: 'Mikrokontroler', lokasi: 'Lab IoT', total: 15, harga: 350000, tglBeli: '2024-09-01', sumber: 'Pembelian', garansi: '', servis: 0, status: 'Tersedia', pinjam: 66, rusak: 5 },
            { id: 'TI-IOT-010', name: 'Osiloskop Digital Rigol DS1054Z', kategori: 'Mikrokontroler', lokasi: 'Lab IoT', total: 2, harga: 5900000, tglBeli: '2021-05-18', sumber: 'Hibah', garansi: '', servis: 300000, status: 'Tersedia', pinjam: 4, rusak: 0 }
        ],
        procurement: [
            { id: 'PRC-001', item: 'Switch Mikrotik CRS326 (4 unit)', pengusul: 'Siti Aminah', estimasi: 18000000, realisasi: 0, status: 'Diusulkan' },
            { id: 'PRC-002', item: 'Laptop Lenovo ThinkPad E14 (5 unit)', pengusul: 'Siti Aminah', estimasi: 72500000, realisasi: 70200000, status: 'Terealisasi' }
        ],
        tren: [['Mei', 28], ['Jun', 35], ['Jul', 22], ['Agu', 41], ['Sep', 48], ['Okt', 30]],
        settings: { lembaga: 'Universitas Islam Riau - Lab IT', kopSurat: 'Fakultas Teknik, Jl. Kaharuddin Nasution, Pekanbaru', twofa: false, minPassword: 8,
            email: 'smtp.uir.ac.id', wa: '', sso: false, tplNotif: 'Halo {nama}, pengajuan {id} berstatus {status}.' },
        logs: [{ t: new Date().toISOString(), user: 'Sistem', aksi: 'Database admin diinisialisasi' }],
        backups: [], jadwalBackup: 'Harian'
    };
}
let db = initializeSharedDatabase();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const me = () => load(SES, { name: 'Admin' });
const log = aksi => { db.logs.unshift({ t: new Date().toISOString(), user: me().name, aksi }); db.logs = db.logs.slice(0, 300); save(); };
const live = () => db.assets.filter(a => !a.dihapus);
const nilaiBuku = a => {
    const th = (Date.now() - new Date(a.tglBeli)) / 31557600000;
    return Math.round(a.harga * a.total * Math.max(0, 1 - th / db.policy.penyusutan));
};
const ui = { v: 'dashboard', q: '', aq: '', mt: 'Kategori Alat' };
let adminNotificationListenersReady = false;

// ================= AUTH =================
window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    db = load(KEY, null);
    const active = loadAdminSession();
    const admin = active && db?.users.find(user => user.nim === active.nim && user.role === 'Admin' && user.status === 'Aktif');
    if (!admin) { sessionStorage.removeItem(SES); checkSession(); return; }
    render();
});

function checkSession() {
    const a = loadAdminSession();
    const user = a && db.users.find(x => x.nim === a.nim && x.role === 'Admin' && x.status === 'Aktif');
    if (a && !user) sessionStorage.removeItem(SES);
    if (!user) { window.location.replace('index.html'); return; }
    $('view-login').classList.toggle('hidden', !!user);
    $('app-layout').classList.toggle('hidden', !user);
    $('user-display-name').innerText = user.name;
    $('user-avatar').innerText = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    $('nav-menu').innerHTML = MENU.map(m => `<button id="nav-${m[0]}" onclick="go('${m[0]}')" class="nav-btn"><i class="fas ${m[1]} w-5"></i> ${m[2]}</button>`).join('');
    if (!adminNotificationListenersReady) {
        document.addEventListener('click', closeAdminNotificationsOnOutsideClick);
        document.addEventListener('keydown', handleAdminNotificationKeys);
        adminNotificationListenersReady = true;
    }
    go('dashboard');
}
function handleLogout() { log('Logout admin'); sessionStorage.removeItem(SES); checkSession(); }

// ================= UI UMUM =================
function showToast(msg, type = 'success') {
    $('toast-icon').className = `fas ${type === 'success' ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-amber-400'}`;
    $('toast-msg').innerText = msg;
    $('global-toast').classList.remove('hidden');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => $('global-toast').classList.add('hidden'), 3000);
}
const closeModal = () => $('modal').classList.add('hidden');
const ib = (icon, title, fn, cls = '') => `<button title="${title}" onclick="${fn}" class="ib ${cls}"><i class="fas ${icon}"></i></button>`;
const tbl = (h, rows, empty = 'Belum ada data.', id = '') => `<div class="card !p-0 overflow-hidden"><div class="overflow-x-auto"><table class="tbl"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody${id ? ` id="${id}"` : ''}>${rows || `<tr><td colspan="${h.length}" class="text-center text-gray-400 !py-8">${empty}</td></tr>`}</tbody></table></div></div>`;
const stat = (l, v, c = 'text-gray-800') => `<div class="card"><p class="text-xs text-gray-400 uppercase font-semibold mb-1">${l}</p><h3 class="text-2xl font-bold ${c}">${v}</h3></div>`;

function fieldHtml(f) {
    const id = 'f-' + f.k, v = esc(f.v ?? '');
    let c;
    if (f.opts) c = `<select id="${id}" class="inp">${f.opts.map(o => `<option ${o == f.v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') c = `<textarea id="${id}" rows="3" class="inp" ${f.req === false ? '' : 'required'}>${v}</textarea>`;
    else c = `<input id="${id}" type="${f.type || 'text'}" value="${v}" class="inp" ${f.req === false ? '' : 'required'} ${f.ro ? 'readonly' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''}>`;
    return `<div><label class="lbl" for="${id}">${f.l}</label>${c}</div>`;
}
const readFields = fields => { const o = {}; fields.forEach(f => { const el = $('f-' + f.k); o[f.k] = f.type === 'number' ? Number(el.value) : el.value.trim(); }); return o; };
function formModal(title, fields, cb, ok = 'Simpan') {
    $('modal-title').innerText = title;
    $('modal-body').innerHTML = `<form id="gform" class="space-y-3">${fields.map(fieldHtml).join('')}<div class="flex gap-3 pt-2"><button type="button" onclick="closeModal()" class="btn btn-gray flex-1">Batal</button><button class="btn btn-teal flex-1">${ok}</button></div></form>`;
    $('gform').onsubmit = e => { e.preventDefault(); if (cb(readFields(fields)) !== false) closeModal(); };
    $('modal').classList.remove('hidden');
}
function csv(name, rows) {
    const t = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' }));
    a.download = name; a.click();
    log('Ekspor ' + name);
}

// ================= NAVIGASI =================
const V = {};
function go(v) {
    ui.v = v;
    MENU.forEach(m => $('nav-' + m[0])?.classList.toggle('active', m[0] === v));
    $('page-title').innerText = MENU.find(m => m[0] === v)[2];
    $('content').innerHTML = V[v]();
    $('content').scrollTop = 0;
    renderAdminNotificationBadge();
}
const render = () => go(ui.v);
function adminActionItems() {
    const items = [
        { count: db.users.filter(user => user.status === 'Menunggu Verifikasi').length, title: 'Akun menunggu verifikasi', view: 'users', icon: 'fa-user-check', description: 'Tinjau dan aktifkan akun baru.' },
        { count: db.loans.filter(loan => loan.status === 'Menunggu Persetujuan').length, title: 'Pengajuan peminjaman', view: 'loans', filter: 'Menunggu Persetujuan', icon: 'fa-hand-holding', description: 'Tinjau permintaan alat baru.' },
        { count: db.loans.filter(hasPendingReturn).length, title: 'Pengembalian perlu dicek', view: 'loans', filter: 'Menunggu Cek', icon: 'fa-box-open', description: 'Periksa jumlah dan kondisi alat.' },
        { count: db.bookings.filter(booking => booking.status === 'Menunggu Persetujuan').length, title: 'Booking ruang', view: 'bookings', filter: 'Menunggu Persetujuan', icon: 'fa-door-open', description: 'Tentukan persetujuan jadwal ruang.' },
        { count: db.fines.filter(fine => fine.status === 'Menunggu Verifikasi').length, title: 'Pembayaran denda', view: 'fines', filter: 'Menunggu Verifikasi', icon: 'fa-money-bill-wave', description: 'Verifikasi bukti pembayaran.' },
        { count: db.laporan.filter(issue => issue.tahap < 3).length, title: 'Laporan kendala aktif', view: 'issues', filter: 'Semua', icon: 'fa-screwdriver-wrench', description: 'Tindak lanjuti laporan kerusakan.' },
        { count: db.procurement.filter(item => item.status === 'Diusulkan').length, title: 'Usulan pengadaan', view: 'procurement', icon: 'fa-cart-flatbed', description: 'Tinjau usulan yang belum diputuskan.' }
    ];
    return items.filter(item => item.count > 0);
}
const adminNotifications = () => db.notifications
    .filter(notification => notification.untuk === 'ADMIN')
    .sort((a, b) => new Date(b.t) - new Date(a.t));
function renderAdminNotificationBadge() {
    const badge = $('notif-badge'), count = adminActionItems().reduce((sum, item) => sum + item.count, 0)
        + adminNotifications().filter(notification => !notification.read).length;
    badge.innerText = count > 99 ? '99+' : count;
    badge.classList.toggle('hidden', !count);
    badge.setAttribute('aria-label', `${count} notifikasi atau tindakan perlu perhatian`);
    const panel = $('admin-notif-panel');
    if (panel && !panel.classList.contains('hidden')) renderAdminNotificationPanel();
}
function adminNotificationTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Waktu tidak diketahui' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
function adminViewForNotification(notification) {
    const views = { tickets: 'issues', laporan: 'issues', pengembalian: 'loans', sanksi: 'fines', peminjaman: 'loans' };
    const view = views[notification.view] || notification.view;
    return MENU.some(item => item[0] === view) ? view : 'dashboard';
}
function renderAdminNotificationPanel() {
    const host = $('admin-notif-content');
    if (!host) return;
    const actions = adminActionItems(), notifications = adminNotifications();
    host.innerHTML = `<div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div><h2 class="text-sm font-bold text-gray-800">Notifikasi Admin</h2><p class="text-[11px] text-gray-500">${actions.reduce((sum, item) => sum + item.count, 0)} tindakan · ${notifications.filter(item => !item.read).length} belum dibaca</p></div>
        <button type="button" onclick="markAllAdminNotificationsRead()" class="text-xs text-teal-700 font-semibold hover:underline disabled:text-gray-400" ${notifications.some(item => !item.read) ? '' : 'disabled'}>Tandai dibaca</button>
    </div>
    <div class="max-h-[70vh] overflow-y-auto">
        ${actions.length ? `<section class="p-3 border-b border-gray-100"><p class="px-1 mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Perlu tindakan</p>
            <div class="space-y-1">${actions.map((item, index) => `<button type="button" onclick="openAdminAction(${index})" class="w-full flex items-center gap-3 p-2 rounded-lg text-left hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
                <span class="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700"><i class="fas ${item.icon}"></i></span>
                <span class="min-w-0 flex-1"><span class="block text-xs font-semibold text-gray-800">${esc(item.title)}</span><span class="block text-[11px] text-gray-500">${esc(item.description)}</span></span>
                <span class="min-w-6 h-6 px-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center">${item.count}</span>
            </button>`).join('')}</div></section>` : `<div class="px-4 py-3 border-b border-gray-100 text-xs text-green-700"><i class="fas fa-circle-check mr-1"></i> Tidak ada tindakan yang tertunda.</div>`}
        <section class="p-3"><div class="flex items-center justify-between px-1 mb-2"><p class="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Aktivitas pengguna</p><span class="text-[10px] text-gray-400">${notifications.length}</span></div>
            ${notifications.length ? `<div class="divide-y divide-gray-100">${notifications.slice(0, 30).map(notification => `<button type="button" onclick="openAdminNotification(${Number(notification.id)})" class="w-full flex gap-3 p-3 text-left rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${notification.read ? '' : 'bg-teal-50/60'}">
                <span class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${esc(notification.style || 'text-sky-600 bg-sky-50')}"><i class="fas ${esc(notification.icon || 'fa-bell')} text-xs"></i></span>
                <span class="min-w-0 flex-1"><span class="flex items-start justify-between gap-2"><span class="text-xs font-semibold text-gray-800">${esc(notification.title || 'Notifikasi')}</span>${notification.read ? '' : '<span class="mt-1 w-2 h-2 rounded-full bg-teal-600 shrink-0" aria-label="Belum dibaca"></span>'}</span>
                    <span class="mt-1 block text-[11px] text-gray-600">${esc(notification.desc || '')}</span><span class="mt-1 block text-[10px] text-gray-400">${adminNotificationTime(notification.t)}</span></span>
            </button>`).join('')}</div>` : '<p class="px-2 py-4 text-center text-xs text-gray-400">Belum ada aktivitas pengguna.</p>'}
        </section>
    </div>`;
}
function toggleAdminNotifications(event) {
    event.stopPropagation();
    const panel = $('admin-notif-panel'), open = panel.classList.contains('hidden');
    if (open) renderAdminNotificationPanel();
    panel.classList.toggle('hidden', !open);
    $('admin-notif-button').setAttribute('aria-expanded', String(open));
}
function closeAdminNotificationsOnOutsideClick(event) {
    const panel = $('admin-notif-panel');
    if (!panel || panel.classList.contains('hidden') || panel.contains(event.target) || $('admin-notif-button').contains(event.target)) return;
    panel.classList.add('hidden');
    $('admin-notif-button').setAttribute('aria-expanded', 'false');
}
function handleAdminNotificationKeys(event) {
    if (event.key !== 'Escape') return;
    const panel = $('admin-notif-panel');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    $('admin-notif-button').setAttribute('aria-expanded', 'false');
    $('admin-notif-button').focus();
}
function openAdminAction(index) {
    const action = adminActionItems()[index];
    if (!action) return;
    if (action.filter != null) {
        const filterKey = { loans: 'lf', bookings: 'bf', fines: 'ff', issues: 'isf' }[action.view];
        if (filterKey) ui[filterKey] = action.filter;
    }
    closeAdminNotificationsOnOutsideClick({ target: document.body });
    go(action.view);
}
function openAdminNotification(id) {
    const notification = adminNotifications().find(item => String(item.id) === String(id));
    if (!notification) return;
    notification.read = true;
    save();
    closeAdminNotificationsOnOutsideClick({ target: document.body });
    const view = adminViewForNotification(notification);
    if (view === 'loans' && /pengembalian/i.test(notification.title || '')) ui.lf = 'Menunggu Cek';
    else if (view === 'loans' && /pengajuan peminjaman/i.test(notification.title || '')) ui.lf = 'Menunggu Persetujuan';
    else if (view === 'bookings' && /booking ruang baru/i.test(notification.title || '')) ui.bf = 'Menunggu Persetujuan';
    else if (view === 'fines' && /perlu verifikasi/i.test(notification.title || '')) ui.ff = 'Menunggu Verifikasi';
    else if (view === 'issues') ui.isf = 'Semua';
    go(view);
}
function markAllAdminNotificationsRead() {
    let changed = false;
    db.notifications.forEach(notification => {
        if (notification.untuk === 'ADMIN' && !notification.read) {
            notification.read = true;
            changed = true;
        }
    });
    if (changed) save();
    renderAdminNotificationPanel();
    renderAdminNotificationBadge();
}

// ================= DASHBOARD =================
V.dashboard = () => {
    const A = live(), unit = A.reduce((s, a) => s + a.total, 0);
    const usul = db.procurement.filter(p => p.status === 'Diusulkan').length;
    const verif = db.users.filter(u => u.status === 'Menunggu Verifikasi').length;
    const rusak = A.filter(a => /Rusak|Maintenance|Hilang/.test(a.status)).length;
    const garansi = A.filter(a => a.garansi && (new Date(a.garansi) - Date.now()) / 864e5 < 90 && new Date(a.garansi) > Date.now()).length;
    const max = Math.max(...db.tren.map(t => t[1]));
    return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-gradient-to-r from-teal-600 to-slate-900 p-6 rounded-2xl text-white shadow-md relative overflow-hidden">
            <span class="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold text-teal-100 mb-3 inline-block"><i class="fas fa-shield-halved mr-1"></i> Pusat Kendali Admin</span>
            <h2 class="text-2xl font-bold mb-2">Selamat datang, ${esc(me().name)}</h2>
            <p class="text-teal-100 text-sm mb-5 max-w-lg">Kelola pengguna, aset, kebijakan, pengadaan, dan laporan laboratorium dalam satu tempat.</p>
            <div class="flex flex-wrap gap-3">
                <button onclick="go('users')" class="px-4 py-2.5 bg-white text-teal-800 rounded-xl font-bold text-xs hover:bg-teal-50"><i class="fas fa-user-check mr-1"></i> Verifikasi Pengguna</button>
                <button onclick="go('assets')" class="px-4 py-2.5 bg-teal-500/30 border border-white/30 rounded-xl font-bold text-xs hover:bg-white/10"><i class="fas fa-desktop mr-1"></i> Kelola Aset</button>
            </div>
            <i class="fas fa-user-gear absolute -right-6 -bottom-6 text-white/10 text-9xl pointer-events-none"></i>
        </div>
        <div class="card space-y-2 text-xs">
            <h3 class="font-bold text-gray-800 text-sm mb-2"><i class="fas fa-bullhorn text-teal-600 mr-2"></i>Perlu Tindakan</h3>
            <button onclick="go('users')" class="w-full text-left p-3 bg-amber-50 rounded-xl border border-amber-100">${verif} akun menunggu verifikasi</button>
            <button onclick="go('procurement')" class="w-full text-left p-3 bg-sky-50 rounded-xl border border-sky-100">${usul} usulan pengadaan menunggu keputusan</button>
            <button onclick="go('assets')" class="w-full text-left p-3 bg-rose-50 rounded-xl border border-rose-100">${rusak} aset rusak / maintenance / hilang</button>
            <button onclick="go('assets')" class="w-full text-left p-3 bg-teal-50 rounded-xl border border-teal-100">${garansi} garansi habis dalam 90 hari</button>
        </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        ${stat('Total Aset (Unit)', unit)}
        ${stat('Nilai Buku Aset', rp(A.reduce((s, a) => s + nilaiBuku(a), 0)), 'text-teal-600')}
        ${stat('Pengguna Aktif', db.users.filter(u => u.status === 'Aktif').length, 'text-amber-500')}
        ${stat('Perlu Tindakan', verif + usul + rusak + garansi, 'text-rose-500')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card"><h3 class="font-bold text-gray-800 mb-4 text-sm">Tren Peminjaman (6 bulan)</h3>
            <div class="flex items-end gap-3 h-40">${db.tren.map(t => `<div class="flex-1 flex flex-col items-center justify-end h-full"><span class="text-[10px] text-gray-500 mb-1">${t[1]}</span><div class="w-full bg-teal-600 rounded-t" style="height:${t[1] / max * 100}%"></div><span class="text-[10px] text-gray-400 mt-1">${t[0]}</span></div>`).join('')}</div></div>
        <div class="card"><h3 class="font-bold text-gray-800 mb-4 text-sm">Aktivitas Terbaru</h3>
            <ul class="space-y-2 text-xs">${db.logs.slice(0, 5).map(l => `<li class="flex justify-between gap-3 border-b border-gray-50 pb-2"><span class="text-gray-700">${esc(l.aksi)}</span><span class="text-gray-400 shrink-0">${new Date(l.t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span></li>`).join('')}</ul></div>
    </div>`;
};

// ================= PENGGUNA & PERAN =================
V.users = () => `
    <div class="flex flex-col md:flex-row justify-between gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm no-print">
        <input type="text" placeholder="Cari nama, NIM/NIP, email..." value="${esc(ui.q)}" oninput="ui.q=this.value;$('user-rows').innerHTML=userRows()" class="inp md:w-80">
        <div class="flex flex-wrap gap-2">
            <button onclick="$('file-import').click()" class="btn btn-gray"><i class="fas fa-file-csv mr-1"></i> Impor CSV</button>
            <button onclick="csv('pengguna.csv',[['NIM/NIP','Nama','Email','Peran','Prodi','Status'],...db.users.map(u=>[u.nim,u.name,u.email,u.role,u.prodi,u.status])])" class="btn btn-gray"><i class="fas fa-file-export mr-1"></i> Ekspor</button>
            <button onclick="userForm()" class="btn btn-teal"><i class="fas fa-plus mr-1"></i> Tambah Akun</button>
        </div>
    </div>
    <p class="text-[11px] text-gray-400 -mt-3">Impor menerima CSV yang diekspor aplikasi atau header <span class="font-mono">nim,nama,email,peran</span>. Baris dengan NIM/email/peran tidak valid akan ditolak dan dilaporkan.</p>
    ${db.resets.length ? `<div class="card"><h3 class="font-bold text-gray-800 text-sm mb-1">Riwayat Permintaan Reset Kata Sandi</h3><p class="text-xs text-gray-500 mb-3">Pengguna dapat memperbarui kata sandi sendiri. Riwayat ini hanya untuk pemantauan.</p>${db.resets.slice(0, 15).map(request => { const user = db.users.find(item => item.nim === request.nim); const status = request.done ? (request.completedBy === 'Pengguna' ? 'Selesai mandiri' : 'Selesai') : 'Belum diselesaikan'; const at = request.completedAt || request.t; return `<div class="flex items-center justify-between gap-3 border-b border-gray-100 py-2 text-sm"><span>${esc(user?.name || request.nim)} <span class="sub">${esc(request.nim)} · ${at ? new Date(at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</span></span><span class="text-xs font-semibold ${request.done ? 'text-green-700' : 'text-amber-700'}">${status}</span></div>`; }).join('')}</div>` : ''}
    ${tbl(['Pengguna', 'Peran', 'Status', 'Aksi'], userRows(), '', 'user-rows')}
    <div class="card"><h3 class="font-bold text-gray-800 mb-1 text-sm">Contoh Matriks Hak Akses</h3>
        <p class="text-xs text-amber-700 mb-3">Informasi referensi untuk demo saja. Matriks ini tidak membatasi akses atau tindakan di aplikasi.</p>
        <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Fitur</th><th>Pengguna</th><th>Admin</th></tr></thead><tbody>
        ${db.perms.map(p => `<tr><td>${esc(p[0])}</td>${[1, 3].map(j => `<td>${p[j] ? '<span class="text-green-700 font-semibold">Ya</span>' : '<span class="text-gray-400">Tidak</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>`;

function userRows() {
    const q = ui.q.toLowerCase();
    const r = db.users.filter(u => !q || (u.name + u.nim + u.email).toLowerCase().includes(q)).map(u => {
        const n = esc(u.nim), s = u.status;
        const act = (s === 'Menunggu Verifikasi' ? ib('fa-user-check', 'Verifikasi', `setUser('${n}','Aktif')`, 'ok') : '')
            + (s === 'Aktif' ? ib('fa-snowflake', 'Bekukan', `setUser('${n}','Dibekukan')`, 'warn') + ib('fa-user-slash', 'Blacklist', `setUser('${n}','Blacklist')`, 'bad') + ib('fa-toggle-off', 'Nonaktifkan', `setUser('${n}','Nonaktif')`) : '')
            + (['Dibekukan', 'Blacklist'].includes(s) ? ib('fa-gavel', 'Cabut sanksi', `setUser('${n}','Aktif')`, 'ok') : '')
            + (s === 'Nonaktif' ? ib('fa-toggle-on', 'Aktifkan', `setUser('${n}','Aktif')`, 'ok') : '')
            + ib('fa-pen', 'Ubah', `userForm('${n}')`) + ib('fa-key', 'Reset sandi', `resetPw('${n}')`) + ib('fa-trash', 'Hapus', `delUser('${n}')`, 'bad');
        return `<tr><td><b class="text-gray-800">${esc(u.name)}</b><br><span class="sub">${n} | ${esc(u.email)}</span></td><td>${esc(u.role)}<br><span class="sub">${esc(u.prodi || '-')}</span></td><td>${badge(s)}</td><td><div class="flex flex-wrap gap-1">${act}</div></td></tr>`;
    }).join('');
    return r || '<tr><td colspan="4" class="text-center text-gray-400 !py-8">Pengguna tidak ditemukan.</td></tr>';
}
function userForm(nim) {
    const u = db.users.find(x => x.nim === nim) || { role: ROLES[0], status: 'Aktif' };
    const roleOptions = nim && !ROLES.includes(u.role) ? [u.role, ...ROLES] : ROLES;
    formModal(nim ? 'Ubah Akun' : 'Tambah Akun', [
        { k: 'name', l: 'Nama Lengkap', v: u.name }, { k: 'nim', l: 'NIM / NIP', v: u.nim, ro: !!nim },
        { k: 'email', l: 'Email Kampus', type: 'email', v: u.email }, { k: 'prodi', l: 'Program Studi / Unit', v: u.prodi, req: false },
        { k: 'role', l: 'Peran', opts: roleOptions, v: u.role }, { k: 'status', l: 'Status', opts: STATUS_USER, v: u.status }
    ], o => {
        if (nim) { Object.assign(u, o); log(`Ubah akun ${nim}`); }
        else {
            if (db.users.some(x => x.nim === o.nim || x.email === o.email)) { showToast('NIM/NIP atau email sudah terdaftar.', 'error'); return false; }
            db.users.push({ ...o, password: adminHashPw('kompas123', o.nim), createdAt: todayISO(), hp: '' }); log(`Tambah akun ${o.nim}`);
        }
        save(); render(); showToast('Akun disimpan.');
    });
}
function setUser(nim, status) {
    const u = db.users.find(x => x.nim === nim);
    if (!u || !confirm(`Ubah status ${u.name} menjadi "${status}"?`)) return;
    if (u.nim === me().nim && status !== 'Aktif') return showToast('Akun yang sedang dipakai tidak bisa dinonaktifkan.', 'error');
    u.status = status; notifyUser(u.nim, 'Status akun diperbarui', `Status akun Anda sekarang: ${status}.`, 'profil');
    log(`Status ${u.nim} -> ${status}`); save(); render(); showToast(`Status ${u.name}: ${status}`);
}
function resetPw(nim) {
    const u = db.users.find(x => x.nim === nim);
    if (!u || !confirm(`Reset kata sandi ${u.name}?`)) return;
    const temporaryPassword = 'Reset' + Math.floor(1000 + Math.random() * 9000);
    u.password = adminHashPw(temporaryPassword, u.nim);
    const completedAt = new Date().toISOString();
    db.resets.filter(request => request.nim === nim && !request.done).forEach(request => {
        request.done = true;
        request.completedAt = completedAt;
        request.completedBy = 'Admin';
    });
    notifyUser(u.nim, 'Kata sandi direset', 'Minta kata sandi sementara kepada admin. Setelah masuk, buka Profil untuk mengganti kata sandi sementara dengan kata sandi baru.', 'profil');
    log(`Reset sandi ${nim}`); save(); render();
    $('modal-title').innerText = 'Reset Kata Sandi Berhasil';
    $('modal-body').innerHTML = `
        <div class="space-y-4 text-sm text-gray-600">
            <p>Kata sandi sementara untuk <b class="text-gray-800">${esc(u.name)}</b> sudah dibuat.</p>
            <div>
                <label class="lbl" for="reset-temporary-password">Kata sandi sementara</label>
                <input id="reset-temporary-password" class="inp font-mono font-bold" value="${esc(temporaryPassword)}" readonly onclick="this.select()">
            </div>
            <ol class="list-decimal pl-5 space-y-2">
                <li>Berikan kata sandi sementara ini kepada pengguna secara langsung atau melalui saluran yang aman.</li>
                <li>Pengguna membuka <a class="text-teal-700 font-semibold underline" href="index.html" target="_blank" rel="noopener">halaman login bersama</a>, lalu masuk memakai NPM/NIP atau email dan kata sandi sementara.</li>
                <li>Setelah masuk, pengguna membuka menu <b>Profil</b> dan mengganti kata sandi sementara di bagian <b>Ubah Kata Sandi</b>.</li>
            </ol>
            <button type="button" onclick="closeModal()" class="btn btn-teal w-full">Selesai</button>
        </div>`;
    $('modal').classList.remove('hidden');
}
function delUser(nim) {
    if (nim === me().nim) return showToast('Tidak bisa menghapus akun sendiri.', 'error');
    const activeLoan = db.loans.some(loan => loan.nim === nim && HOLD.includes(loan.status) && itemRemainingCount(loan) > 0);
    const openFine = db.fines.some(fine => fine.nim === nim && ['Berjalan', 'Belum Dibayar', 'Menunggu Verifikasi'].includes(fine.status));
    const activeBooking = db.bookings.some(booking => booking.nim === nim && ['Menunggu Persetujuan', 'Disetujui'].includes(booking.status));
    const activeIssue = db.laporan.some(issue => issue.nim === nim && issue.tahap < 3);
    if (activeLoan || openFine || activeBooking || activeIssue)
        return showToast('Akun tidak dapat dihapus selama masih memiliki pinjaman, denda, booking, atau laporan aktif. Nonaktifkan akun sebagai gantinya.', 'error');
    if (!confirm('Hapus akun ini secara permanen?')) return;
    db.users = db.users.filter(x => x.nim !== nim); log(`Hapus akun ${nim}`); save(); render(); showToast('Akun dihapus.');
}
function parseCsvRecords(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
            else if (char === '"') quoted = false;
            else value += char;
        } else if (char === '"' && value === '') quoted = true;
        else if (char === ',') { row.push(value); value = ''; }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            row.push(value); rows.push(row); row = []; value = '';
        } else if (char === '"') throw new Error('Tanda kutip CSV tidak berpasangan atau berada di posisi yang salah.');
        else value += char;
    }
    if (quoted) throw new Error('Tanda kutip CSV tidak berpasangan.');
    if (value !== '' || row.length) { row.push(value); rows.push(row); }
    return rows;
}
function csvHeaderKey(value) {
    const key = value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return ({ nim: 'nim', nimnip: 'nim', nama: 'name', name: 'name', email: 'email', peran: 'role', role: 'role',
        prodi: 'prodi', programstudi: 'prodi', status: 'status' })[key] || '';
}
function validateImportedUser(user, seenNims, seenEmails, roles, statuses) {
    const errors = [];
    if (!/^[0-9]{8,20}$/.test(user.nim)) errors.push('NIM/NIP harus 8–20 digit angka');
    if (!user.name) errors.push('nama wajib diisi');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push('email tidak valid');
    if (!roles.includes(user.role)) errors.push(`peran "${user.role}" tidak dikenal`);
    if (!statuses.includes(user.status)) errors.push(`status "${user.status}" tidak dikenal`);
    if (seenNims.has(user.nim)) errors.push(`NIM/NIP ${user.nim} sudah terdaftar atau duplikat`);
    if (seenEmails.has(user.email)) errors.push(`email ${user.email} sudah terdaftar atau duplikat`);
    return errors;
}
function showImportReport(imported, errors) {
    $('modal-title').innerText = 'Hasil Impor CSV';
    const shown = errors.slice(0, 50).map(error => `<li>${esc(error)}</li>`).join('');
    $('modal-body').innerHTML = `<div class="space-y-3 text-sm"><p>${imported} akun berhasil diimpor; ${errors.length} baris ditolak.</p>
        ${errors.length ? `<div class="max-h-64 overflow-y-auto rounded border bg-amber-50 p-3 text-amber-900"><ul class="list-disc space-y-1 pl-5">${shown}</ul>${errors.length > 50 ? `<p class="mt-2">dan ${errors.length - 50} kesalahan lainnya.</p>` : ''}</div>` : '<p class="text-green-700">Tidak ada kesalahan pada baris CSV.</p>'}
        <button type="button" onclick="closeModal()" class="btn btn-teal w-full">Tutup</button></div>`;
    $('modal').classList.remove('hidden');
}
function importUsers(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
        let rows;
        try { rows = parseCsvRecords(String(r.result || '')); }
        catch (error) { return showImportReport(0, [`CSV tidak dapat dibaca: ${error.message}`]); }
        const header = (rows.shift() || []).map(csvHeaderKey), required = ['nim', 'name', 'email', 'role'];
        if (required.some(key => !header.includes(key))) return showImportReport(0, ['Header wajib memuat kolom NIM/NIP, Nama, Email, dan Peran.']);
        const columns = Object.fromEntries(header.map((key, index) => [key, index]).filter(([key]) => key));
        const seenNims = new Set(db.users.map(user => user.nim));
        const seenEmails = new Set(db.users.map(user => String(user.email || '').trim().toLowerCase()).filter(Boolean));
        let imported = 0;
        const errors = [];
        rows.forEach((values, index) => {
            const rowNumber = index + 2;
            if (values.every(value => !value.trim())) return;
            if (values.length !== header.length) return errors.push(`Baris ${rowNumber}: jumlah kolom tidak sesuai header.`);
            const read = key => values[columns[key]]?.trim() || '';
            const nim = read('nim'), name = read('name'), email = read('email').toLowerCase();
            const role = read('role'), prodi = read('prodi'), status = read('status') || 'Aktif';
            const rowErrors = validateImportedUser({ nim, name, email, role, status }, seenNims, seenEmails, ROLES, STATUS_USER);
            if (rowErrors.length) return errors.push(`Baris ${rowNumber}: ${rowErrors.join('; ')}.`);
            db.users.push({ nim, name, email, role, prodi, status, password: adminHashPw('kompas123', nim), createdAt: todayISO(), hp: '' });
            seenNims.add(nim); seenEmails.add(email); imported++;
        });
        if (imported) { log(`Impor ${imported} akun dari ${f.name}`); save(); render(); }
        showImportReport(imported, errors);
    };
    r.onerror = () => showImportReport(0, ['File CSV gagal dibaca.']);
    r.readAsText(f); e.target.value = '';
}

// ================= DATA MASTER =================
V.master = () => {
    const keys = Object.keys(db.master), list = db.master[ui.mt];
    return `
    <div class="flex flex-wrap gap-2">${keys.map(k => `<button onclick="ui.mt='${k}';render()" class="px-4 py-1.5 rounded-full text-sm font-medium ${k === ui.mt ? 'bg-navy text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${k}</button>`).join('')}</div>
    <div class="card"><h3 class="font-bold text-gray-800 mb-4 text-sm">${ui.mt} (${list.length})</h3>
        <div class="flex flex-wrap gap-2 mb-5">${list.map((x, i) => `<span class="chip">${esc(x)}<button onclick="delMaster(${i})" class="text-rose-500 hover:text-rose-700" title="Hapus"><i class="fas fa-times"></i></button></span>`).join('') || '<span class="text-sm text-gray-400">Belum ada data.</span>'}</div>
        <form onsubmit="addMaster(event)" class="flex gap-2 max-w-md"><input id="master-new" required class="inp" placeholder="Tambah ${esc(ui.mt)} baru..."><button class="btn btn-teal shrink-0"><i class="fas fa-plus mr-1"></i> Tambah</button></form>
    </div>`;
};
function addMaster(e) {
    e.preventDefault();
    const v = $('master-new').value.trim(), l = db.master[ui.mt];
    if (l.some(x => x.toLowerCase() === v.toLowerCase())) return showToast('Data sudah ada.', 'error');
    l.push(v); log(`Tambah master ${ui.mt}: ${v}`); save(); render(); showToast('Data ditambahkan.');
}
function delMaster(i) {
    const v = db.master[ui.mt][i];
    if (!confirm(`Hapus "${v}"?`)) return;
    db.master[ui.mt].splice(i, 1); log(`Hapus master ${ui.mt}: ${v}`); save(); render();
}

// ================= KEBIJAKAN =================
const POL = [
    ['Peminjaman', [['durasiUmum', 'Durasi alat umum (hari kerja)', 'number'], ['durasiTinggi', 'Durasi alat bernilai tinggi (hari kerja)', 'number'], ['durasiTA', 'Durasi proyek tugas akhir (hari)', 'number'],
        ['maksMhs', 'Maks jenis alat aktif - Mahasiswa', 'number']]],
    ['Denda & Sanksi', [['dendaHari', 'Denda per alat per hari kerja (Rp)', 'number'], ['dendaMaks', 'Denda maksimal per transaksi (Rp)', 'number'], ['batasBeku', 'Terlambat lebih dari (hari kerja) = dibekukan', 'number'],
        ['kaliTerlambat', 'Terlambat per semester (kali) = dibekukan', 'number'], ['lamaBeku', 'Lama pembekuan (hari)', 'number']]],
    ['Operasional & Persetujuan', [['jamBuka', 'Jam buka layanan', 'time'], ['jamTutup', 'Jam tutup layanan', 'time'], ['ambangTinggi', 'Ambang nilai alat bernilai tinggi (Rp)', 'number'],
        ['penyusutan', 'Masa manfaat penyusutan (tahun)', 'number']]]
];
V.policy = () => `<form onsubmit="savePolicy(event)" class="space-y-6">
    ${POL.map(g => `<div class="card"><h3 class="font-bold text-gray-800 mb-4 text-sm border-b pb-2">${g[0]}</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${g[1].map(f => fieldHtml({ k: f[0], l: f[1], type: f[2], opts: f[3], v: db.policy[f[0]], min: 0 })).join('')}</div></div>`).join('')}
    <div class="card"><h3 class="font-bold text-gray-800 mb-4 text-sm border-b pb-2">Kalender Libur & Syarat Ketentuan</h3><div class="space-y-4">
        ${fieldHtml({ k: 'libur', l: 'Hari libur / kalender akademik (satu baris per tanggal)', type: 'textarea', v: db.policy.libur, req: false })}
        ${fieldHtml({ k: 'tnc', l: 'Syarat dan ketentuan peminjaman', type: 'textarea', v: db.policy.tnc, req: false })}</div></div>
    <button class="btn btn-teal !py-3 !px-8 text-sm">Simpan Kebijakan</button></form>`;
function savePolicy(e) {
    e.preventDefault();
    const fields = POL.flatMap(g => g[1]).map(f => ({ k: f[0], type: f[2] })).concat([{ k: 'libur' }, { k: 'tnc' }]);
    const o = readFields(fields);
    if (o.jamTutup <= o.jamBuka) return showToast('Jam tutup harus setelah jam buka.', 'error');
    Object.assign(db.policy, o); log('Ubah kebijakan peminjaman dan denda'); save(); showToast('Kebijakan disimpan.');
}

// ================= ASET =================
V.assets = () => {
    const A = db.assets;
    const rows = A.map(a => {
        const wo = String(a.status).startsWith('Dihapus'), inactive = !!a.dihapus;
        return `<tr><td><b class="text-gray-800">${esc(a.name)}</b><br><span class="sub font-mono">${esc(a.id)} | ${esc(a.kategori)} | ${esc(a.lokasi)}</span></td>
        <td>${a.total} unit <span class="sub">(${a.total - a.rusak - a.hilang} baik, ${a.rusak} rusak, ${a.hilang} hilang)</span><br><span class="sub">${esc(a.sumber)} | ${esc(a.tglBeli)}</span></td>
        <td>${rp(a.harga * a.total)}<br><span class="sub">Buku: ${wo ? '-' : rp(nilaiBuku(a))}</span></td>
        <td>${rp(a.harga * a.total + a.servis)}<br><span class="sub">servis ${rp(a.servis)}</span></td>
        <td>${badge(assetStatusLabel(a))}${a.garansi ? `<br><span class="sub">Garansi ${esc(a.garansi)}</span>` : ''}</td>
        <td><div class="flex gap-1">${wo ? '<span class="sub">-</span>' : ib('fa-pen', 'Ubah', `assetForm('${a.id}')`) + (inactive ? '' : ib('fa-eraser', 'Write-off', `writeOff('${a.id}')`, 'bad'))}</div></td></tr>`;
    }).join('');
    return `<div class="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
        <p class="text-sm text-gray-500">Jumlah unit rusak/hilang diubah satu per satu. Status ketersediaan dihitung dari jumlah unit dan transaksi aktif.</p>
        <button onclick="assetForm()" class="btn btn-teal"><i class="fas fa-plus mr-1"></i> Tambah Aset</button></div>
        ${tbl(['Aset', 'Jumlah & Sumber', 'Nilai Perolehan', 'Biaya Kepemilikan', 'Status', 'Aksi'], rows)}`;
};
function assetForm(id) {
    const a = db.assets.find(x => x.id === id) || { kategori: db.master['Kategori Alat'][0], lokasi: db.master['Lokasi / Lab'][0], sumber: 'Pembelian', status: 'Tersedia', total: 1, harga: 0, servis: 0, rusak: 0, hilang: 0, tglBeli: todayISO() };
    const M = db.master;
    formModal(id ? 'Ubah Aset' : 'Tambah Aset', [
        { k: 'id', l: 'Kode Aset', v: a.id, ro: !!id }, { k: 'name', l: 'Nama Aset', v: a.name },
        { k: 'kategori', l: 'Kategori', opts: M['Kategori Alat'], v: a.kategori }, { k: 'lokasi', l: 'Lokasi / Lab', opts: M['Lokasi / Lab'], v: a.lokasi },
        { k: 'total', l: 'Jumlah Unit', type: 'number', v: a.total, min: 1 }, { k: 'harga', l: 'Harga per Unit (Rp)', type: 'number', v: a.harga, min: 0 },
        { k: 'rusak', l: 'Unit rusak / dalam perbaikan', type: 'number', v: a.rusak, min: 0 },
        { k: 'hilang', l: 'Unit hilang', type: 'number', v: a.hilang, min: 0 },
        { k: 'tglBeli', l: 'Tanggal Perolehan', type: 'date', v: a.tglBeli }, { k: 'sumber', l: 'Sumber', opts: ['Pembelian', 'Hibah'], v: a.sumber },
        { k: 'garansi', l: 'Garansi Berakhir', type: 'date', v: a.garansi, req: false }, { k: 'servis', l: 'Total Biaya Servis (Rp)', type: 'number', v: a.servis, min: 0 },
        { k: 'status', l: 'Status katalog', opts: ['Aktif', 'Nonaktif'], v: a.dihapus ? 'Nonaktif' : 'Aktif' }
    ], o => {
        if (!Number.isInteger(o.total) || o.total < 1 || !Number.isInteger(o.rusak) || !Number.isInteger(o.hilang)
            || o.rusak < 0 || o.hilang < 0 || o.rusak + o.hilang > o.total)
            return showToast('Jumlah unit rusak dan hilang harus bilangan bulat dan totalnya tidak boleh melebihi jumlah unit.', 'error'), false;
        const checkedOut = db.loans.filter(loan => OUT.includes(loan.status))
            .reduce((sum, loan) => sum + loan.items.filter(item => item.toolId === o.id).reduce((qty, item) => qty + itemRemaining(item), 0), 0);
        if (checkedOut + o.rusak + o.hilang > o.total)
            return showToast(`Jumlah unit tidak boleh kurang dari ${checkedOut + o.rusak + o.hilang} unit yang sedang dipinjam, rusak, atau hilang.`, 'error'), false;
        if (id) {
            Object.assign(a, o, { dihapus: o.status === 'Nonaktif', rk: o.rusak });
            a.status = a.dihapus ? 'Nonaktif' : assetStatusLabel(a);
            log(`Ubah aset ${id}`);
        } else {
            if (db.assets.some(x => x.id === o.id)) { showToast('Kode aset sudah dipakai.', 'error'); return false; }
            const asset = { ...o, pinjam: 0, pj: 0, rk: o.rusak, dihapus: o.status === 'Nonaktif', icon: 'fa-desktop', spek: '' };
            asset.status = asset.dihapus ? 'Nonaktif' : assetStatusLabel(asset);
            db.assets.push(asset); log(`Tambah aset ${o.id}`);
        }
        save(); render(); showToast('Aset disimpan.');
    });
}
function writeOff(id) {
    const a = db.assets.find(x => x.id === id);
    formModal(`Write-off ${a.id}`, [
        { k: 'alasan', l: 'Alasan penghapusan', type: 'textarea' }, { k: 'ba', l: 'No. Berita Acara' },
        { k: 'setuju', l: 'Disetujui oleh', v: me().name, ro: true }
    ], o => {
        a.status = 'Dihapus (Write-off)'; a.dihapus = true; a.alasanHapus = o.alasan; a.ba = o.ba;
        log(`Write-off aset ${id} (BA ${o.ba}): ${o.alasan}`); save(); render(); showToast('Aset dihapus dari inventaris aktif.');
    }, 'Proses Write-off');
}

// ================= PENGADAAN =================
V.procurement = () => {
    const P = db.procurement;
    const rows = P.map(p => `<tr><td class="font-mono text-xs">${p.id}</td><td><b class="text-gray-800">${esc(p.item)}</b><br><span class="sub">Pengusul: ${esc(p.pengusul)}</span></td>
        <td>${rp(p.estimasi)}</td><td>${p.realisasi ? rp(p.realisasi) : '-'}</td><td>${badge(p.status)}</td>
        <td><div class="flex gap-1">${p.status === 'Diusulkan' ? ib('fa-check', 'Setujui', `setProc('${p.id}','Disetujui')`, 'ok') + ib('fa-xmark', 'Tolak', `setProc('${p.id}','Ditolak')`, 'bad') : ''}
        ${p.status === 'Disetujui' ? ib('fa-receipt', 'Catat realisasi', `realisasi('${p.id}')`, 'ok') : ''}</div></td></tr>`).join('');
    return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${stat('Total Usulan', rp(P.reduce((s, p) => s + p.estimasi, 0)))}
        ${stat('Disetujui / Terealisasi', rp(P.filter(p => ['Disetujui', 'Terealisasi'].includes(p.status)).reduce((s, p) => s + p.estimasi, 0)), 'text-teal-600')}
        ${stat('Realisasi Anggaran', rp(P.reduce((s, p) => s + p.realisasi, 0)), 'text-amber-500')}</div>
        <div class="flex justify-end no-print"><button onclick="procForm()" class="btn btn-teal"><i class="fas fa-plus mr-1"></i> Tambah Usulan</button></div>
        ${tbl(['ID', 'Usulan', 'Estimasi', 'Realisasi', 'Status', 'Aksi'], rows)}`;
};
function procForm() {
    formModal('Usulan Pembelian', [{ k: 'item', l: 'Barang / jumlah' }, { k: 'pengusul', l: 'Pengusul', v: me().name }, { k: 'estimasi', l: 'Estimasi biaya (Rp)', type: 'number', min: 1 }], o => {
        const id = 'PRC-' + String(db.procurement.reduce((m, p) => Math.max(m, parseInt(p.id.slice(4))), 0) + 1).padStart(3, '0');
        db.procurement.unshift({ id, ...o, realisasi: 0, status: 'Diusulkan' }); log(`Usulan pengadaan ${id}`); save(); render();
    });
}
function setProc(id, status) {
    const p = db.procurement.find(x => x.id === id);
    if (!confirm(`${status === 'Ditolak' ? 'Tolak' : 'Setujui'} usulan ${id}?`)) return;
    p.status = status; log(`Pengadaan ${id} -> ${status}`); save(); render();
}
function realisasi(id) {
    const p = db.procurement.find(x => x.id === id);
    formModal(`Realisasi ${id}`, [{ k: 'nilai', l: 'Nilai realisasi (Rp)', type: 'number', v: p.estimasi, min: 1 }], o => {
        p.realisasi = o.nilai; p.status = 'Terealisasi'; log(`Realisasi ${id}: ${rp(o.nilai)}`); save(); render();
    });
}

// ================= LAPORAN & ANALITIK =================
V.reports = () => {
    const A = live(), top = (arr, key, desc = true) => [...arr].sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]).slice(0, 5);
    const list = (arr, key, sat) => arr.map(a => `<li class="flex justify-between border-b border-gray-50 pb-2"><span>${esc(a.name)}</span><b class="text-gray-800">${a[key]} ${sat}</b></li>`).join('');
    const perLab = {};
    A.forEach(a => { const l = perLab[a.lokasi] ||= { unit: 0, perolehan: 0, buku: 0, servis: 0 }; l.unit += a.total; l.perolehan += a.harga * a.total; l.buku += nilaiBuku(a); l.servis += a.servis; });
    const rows = Object.entries(perLab).map(([k, v]) => `<tr><td class="font-semibold text-gray-800">${esc(k)}</td><td>${v.unit}</td><td>${rp(v.perolehan)}</td><td>${rp(v.buku)}</td><td>${rp(v.servis)}</td></tr>`).join('');
    const sum = k => Object.values(perLab).reduce((s, v) => s + v[k], 0);
    return `<div class="flex flex-wrap gap-2 justify-end no-print">
        <button onclick="exportInventaris()" class="btn btn-teal"><i class="fas fa-file-excel mr-1"></i> Ekspor Excel (CSV)</button>
        <button onclick="window.print()" class="btn btn-navy"><i class="fas fa-print mr-1"></i> Cetak / Simpan PDF</button></div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        ${stat('Total Aset (Unit)', sum('unit'))}${stat('Nilai Perolehan', rp(sum('perolehan')))}${stat('Nilai Buku', rp(sum('buku')), 'text-teal-600')}${stat('Biaya Maintenance', rp(sum('servis')), 'text-rose-500')}</div>
    <h3 class="font-bold text-gray-800 text-sm">Laporan Inventaris per Lab (Akreditasi & Audit)</h3>
    ${tbl(['Lab / Lokasi', 'Unit', 'Nilai Perolehan', 'Nilai Buku', 'Biaya Servis'], rows)}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="card"><h3 class="font-bold text-gray-800 mb-3 text-sm">Paling Sering Dipinjam</h3><ul class="space-y-2 text-xs text-gray-600">${list(top(A, 'pinjam'), 'pinjam', 'x')}</ul></div>
        <div class="card"><h3 class="font-bold text-gray-800 mb-3 text-sm">Paling Sering Rusak</h3><ul class="space-y-2 text-xs text-gray-600">${list(top(A, 'rusak'), 'rusak', 'x')}</ul></div>
        <div class="card"><h3 class="font-bold text-gray-800 mb-3 text-sm">Jarang Dipakai</h3><ul class="space-y-2 text-xs text-gray-600">${list(top(A, 'pinjam', false), 'pinjam', 'x')}</ul></div></div>`;
};
function exportInventaris() {
    csv('laporan-inventaris.csv', [['Kode', 'Nama', 'Kategori', 'Lokasi', 'Unit', 'Harga/Unit', 'Tgl Perolehan', 'Sumber', 'Nilai Buku', 'Biaya Servis', 'Status'],
        ...live().map(a => [a.id, a.name, a.kategori, a.lokasi, a.total, a.harga, a.tglBeli, a.sumber, nilaiBuku(a), a.servis, a.status])]);
}

// ================= AUDIT LOG =================
V.audit = () => `<div class="card no-print"><input type="text" placeholder="Cari aktivitas atau pengguna..." value="${esc(ui.aq)}" oninput="ui.aq=this.value;$('audit-rows').innerHTML=auditRows()" class="inp md:w-96"></div>
    ${tbl(['Waktu', 'Pengguna', 'Aktivitas'], auditRows(), '', 'audit-rows')}
    <p class="text-[11px] text-gray-400">Log disimpan minimal 2 tahun pada sistem sebenarnya. Di demo ini hanya 300 aktivitas terakhir.</p>`;
function auditRows() {
    const q = ui.aq.toLowerCase();
    return db.logs.filter(l => !q || (l.aksi + l.user).toLowerCase().includes(q)).slice(0, 100).map(l =>
        `<tr><td class="whitespace-nowrap">${new Date(l.t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td><td class="font-semibold text-gray-800">${esc(l.user)}</td><td>${esc(l.aksi)}</td></tr>`).join('')
        || '<tr><td colspan="3" class="text-center text-gray-400 !py-8">Tidak ada aktivitas.</td></tr>';
}

// ================= PENGATURAN SISTEM =================
V.settings = () => {
    const s = db.settings;
    return `<form onsubmit="saveSettings(event)" class="space-y-6 max-w-3xl">
    <div class="card space-y-4"><h3 class="font-bold text-gray-800 text-sm border-b pb-2">Identitas Lembaga</h3>
        ${fieldHtml({ k: 'lembaga', l: 'Nama lembaga', v: s.lembaga })}${fieldHtml({ k: 'kopSurat', l: 'Kop surat', type: 'textarea', v: s.kopSurat, req: false })}</div>
    <div class="card space-y-4"><h3 class="font-bold text-gray-800 text-sm border-b pb-2">Keamanan (Demo)</h3>
        <p class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">Autentikasi dua langkah, SSO, dan pembatasan hak akses belum diterapkan. Login dan data masih diproses di browser, sehingga aplikasi ini hanya untuk demonstrasi dan tidak boleh digunakan untuk data nyata.</p>
        ${fieldHtml({ k: 'minPassword', l: 'Panjang minimal kata sandi', type: 'number', v: s.minPassword, min: 6 })}</div>
    <div class="card space-y-4"><h3 class="font-bold text-gray-800 text-sm border-b pb-2">Notifikasi (Konfigurasi Demo)</h3>
        <p class="text-xs text-gray-500">Pengaturan di bawah hanya disimpan. Aplikasi demo belum mengirim email atau pesan WhatsApp.</p>
        ${fieldHtml({ k: 'email', l: 'Server email (SMTP)', v: s.email, req: false })}${fieldHtml({ k: 'wa', l: 'WhatsApp gateway (URL / token)', v: s.wa, req: false })}
        ${fieldHtml({ k: 'tplNotif', l: 'Template notifikasi', type: 'textarea', v: s.tplNotif, req: false })}</div>
    <button class="btn btn-teal !py-3 !px-8 text-sm">Simpan Pengaturan</button></form>`;
};
function saveSettings(e) {
    e.preventDefault();
    const o = readFields([{ k: 'lembaga' }, { k: 'kopSurat' }, { k: 'minPassword', type: 'number' }, { k: 'email' }, { k: 'wa' }, { k: 'tplNotif' }]);
    Object.assign(db.settings, o, { waAdmin: o.wa });
    log('Ubah pengaturan sistem'); save(); showToast('Pengaturan disimpan.');
}

// ================= BACKUP & RESTORE =================
V.backup = () => `<div class="card max-w-3xl space-y-3">
        <h3 class="font-bold text-gray-800 text-sm">Backup manual</h3>
        <p class="text-sm text-gray-600">Backup tidak berjalan otomatis. Backup tersimpan di penyimpanan browser yang sama; unduh salinannya dan simpan di tempat terpisah agar tidak hilang saat data browser dibersihkan.</p>
        <button onclick="buatBackup()" class="btn btn-teal"><i class="fas fa-cloud-arrow-up mr-1"></i> Buat Backup Sekarang</button></div>
    ${tbl(['Waktu', 'Ukuran', 'Aksi'], db.backups.map((b, i) => `<tr><td>${new Date(b.t).toLocaleString('id-ID')}</td><td>${(b.data.length / 1024).toFixed(1)} KB</td>
        <td><div class="flex gap-1">${ib('fa-rotate-left', 'Restore', `restore(${i})`, 'warn')}${ib('fa-download', 'Unduh', `unduhBackup(${i})`)}</div></td></tr>`).join(''), 'Belum ada backup. Klik "Buat Backup Sekarang".')}`;
function buatBackup() {
    const { backups, ...isi } = db;
    db.backups.unshift({ t: new Date().toISOString(), data: JSON.stringify(isi) });
    db.backups = db.backups.slice(0, 10); log('Backup manual dibuat'); save(); render(); showToast('Backup dibuat.');
}
function restore(i) {
    if (!confirm('Restore akan menimpa seluruh data saat ini. Lanjutkan?')) return;
    const b = db.backups[i];
    if (!b) return showToast('Backup tidak ditemukan.', 'error');
    try {
        const contents = JSON.parse(b.data);
        if (!contents || typeof contents !== 'object' || Array.isArray(contents)) throw new Error('Format data tidak valid.');
        const keep = db.backups;
        db = normalizeAdminDatabase({ ...contents, backups: keep });
        db.migration.adminV1 = true;
        log('Restore dari backup ' + b.t); save(); render(); showToast('Data berhasil dipulihkan.');
    } catch (error) {
        showToast(`Backup tidak dapat dipulihkan: ${error.message}`, 'error');
    }
}
function unduhBackup(i) {
    if (!db.backups[i]) return showToast('Backup tidak ditemukan.', 'error');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([db.backups[i].data], { type: 'application/json' }));
    a.download = 'backup-kompas-lab.json'; a.click();
}

// ===== KOMPAS Lab - Modul Alur User -> Admin (muat SETELAH Admin.js) =====
Object.assign(BADGE, { 'Menunggu Persetujuan': 'b-yellow', 'Siap Diambil': 'b-blue', Terlambat: 'b-red', 'Menunggu Cek': 'b-amber', Selesai: 'b-green', 'Tidak Digunakan': 'b-gray', 'Belum Dibayar': 'b-red', Lunas: 'b-green', Dibebaskan: 'b-gray', Dilaporkan: 'b-red', Ditinjau: 'b-yellow', 'Ditinjau Admin': 'b-yellow', 'Dalam Perbaikan': 'b-amber', Dibatalkan: 'b-gray' });
MENU.splice(1, 0, ['loans', 'fa-hand-holding', 'Peminjaman'], ['bookings', 'fa-door-open', 'Booking Ruang'], ['fines', 'fa-money-bill-wave', 'Denda & Sanksi'], ['issues', 'fa-screwdriver-wrench', 'Laporan Kendala'], ['announce', 'fa-bullhorn', 'Pengumuman']);

const TAHAP = ['Dilaporkan', 'Ditinjau Admin', 'Dalam Perbaikan', 'Selesai'];
const HOLD = ['Menunggu Persetujuan', 'Siap Diambil', 'Dipinjam', 'Terlambat'];
const OUT = ['Dipinjam', 'Terlambat'];
const bookingHasEnded = booking => {
    const end = new Date(`${booking.tglSelesai}T${booking.jamSelesai}:00`);
    return !Number.isNaN(end.getTime()) && end <= new Date();
};
const asetOf = id => db.assets.find(asset => asset.id === id) || { id, name: id, harga: 0, total: 0, rusak: 0, hilang: 0 };
const userOf = nim => db.users.find(user => user.nim === nim);
const itemCount = loan => loan.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
const itemRemaining = item => Math.max(0, Number(item.qty || 0) - Number(item.returnedQty || 0));
const itemRemainingCount = loan => loan.items.reduce((sum, item) => sum + itemRemaining(item), 0);
const itemNames = loan => loan.items.map(item => `${item.nama}${item.qty > 1 ? ` x${item.qty}` : ''}`).join(', ');
const loanAvailability = (assetId, ignoreId) => {
    const asset = asetOf(assetId), total = Math.max(0, asset.total - (asset.rusak || 0) - (asset.hilang || 0));
    const held = db.loans.filter(loan => loan.id !== ignoreId && HOLD.includes(loan.status))
        .reduce((sum, loan) => sum + loan.items.filter(item => item.toolId === assetId).reduce((qty, item) => qty + itemRemaining(item), 0), 0);
    return Math.max(0, total - held);
};
function assetStatusLabel(asset) {
    if (asset.dihapus) return asset.status.startsWith('Dihapus') ? asset.status : 'Nonaktif';
    const good = Math.max(0, asset.total - (asset.rusak || 0) - (asset.hilang || 0));
    if (!good) return asset.hilang >= asset.total ? 'Hilang' : 'Maintenance';
    return loanAvailability(asset.id, null) === 0 ? 'Dipinjam' : 'Tersedia';
}
const tabs = (key, list, cur) => `<div class="flex flex-wrap gap-2 no-print">${list.map(value => `<button onclick="ui.${key}='${value}';render()" class="px-4 py-1.5 rounded-full text-sm font-medium ${value === cur ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${value}</button>`).join('')}</div>`;
function nextFlowId(prefix) {
    db.seq[prefix] = (db.seq[prefix] || 0) + 1;
    return `${prefix}-${String(db.seq[prefix]).padStart(3, '0')}`;
}
function notifyUser(nim, title, desc, view, icon = 'fa-bell', style = 'text-sky-600 bg-sky-50') {
    if (!nim) return;
    db.notifications.unshift({ id: Date.now() + Math.floor(Math.random() * 10000), t: new Date().toISOString(), read: false, untuk: nim, title, desc, view, icon, style });
    db.notifications = db.notifications.slice(0, 300);
}
const holidayDates = () => (db.policy.libur || '').split('\n').map(line => line.trim().slice(0, 10));
function isAdminWorkday(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localISODate(new Date(`${date}T00:00:00`)) !== date) return false;
    const day = new Date(`${date}T00:00:00`).getDay();
    return day !== 0 && day !== 6 && !holidayDates().includes(date);
}
function adminWorkingDays(start, end) {
    let count = 0;
    for (let date = start; date <= end; date = addCalendarDays(new Date(`${date}T00:00:00`), 1))
        if (isAdminWorkday(date)) count++;
    return count;
}
function bookingDateRangesOverlap(first, second) {
    const start = first.tglMulai > second.tglMulai ? first.tglMulai : second.tglMulai;
    const end = first.tglSelesai < second.tglSelesai ? first.tglSelesai : second.tglSelesai;
    for (let date = start; date <= end; date = addCalendarDays(new Date(`${date}T00:00:00`), 1)) {
        if (isAdminWorkday(date)) return true;
    }
    return false;
}
function lateWorkDays(due, through = todayISO()) {
    let count = 0;
    const date = new Date(`${due}T00:00:00`), end = new Date(`${through}T00:00:00`), holidays = holidayDates();
    while (date < end) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay(), calendarDate = localISODate(date);
        if (day !== 0 && day !== 6 && !holidays.includes(calendarDate)) count++;
    }
    return count;
}
function syncFlowData() {
    let changed = false;
    db.loans.forEach(loan => {
        if (!OUT.includes(loan.status)) return;
        const remainingQty = itemRemainingCount(loan);
        if (!remainingQty) return;
        const daysLate = lateWorkDays(loan.tglKembali);
        if (!daysLate) return;
        if (loan.status !== 'Terlambat') {
            loan.status = 'Terlambat';
            loan.riwayat.push({ t: new Date().toISOString(), s: 'Terlambat', oleh: 'Sistem' });
            changed = true;
        }
        let fine = db.fines.find(item => item.loanId === loan.id);
        if (!fine) {
            fine = { id: nextFlowId('DND'), loanId: loan.id, nim: loan.nim, nama: loan.nama, alat: itemNames(loan), qty: itemCount(loan), qtyAktif: remainingQty, frozenNominal: 0, jatuhTempo: loan.tglKembali, hari: 0, nominal: 0, status: 'Berjalan', createdAt: todayISO() };
            db.fines.push(fine); changed = true;
            notifyUser(loan.nim, 'Peminjaman terlambat', `${itemNames(loan)} (${loan.id}) melewati batas pengembalian. Denda berjalan ${rp(db.policy.dendaHari)} per unit per hari kerja.`, 'sanksi', 'fa-exclamation-circle', 'text-rose-600 bg-rose-50');
        }
        const nominal = Math.min(db.policy.dendaMaks, (fine.frozenNominal || 0) + Math.min(daysLate * remainingQty * db.policy.dendaHari, db.policy.dendaMaks));
        if (fine.status === 'Berjalan' && (fine.hari !== daysLate || fine.qtyAktif !== remainingQty || fine.nominal !== nominal)) {
            fine.hari = daysLate; fine.qtyAktif = remainingQty; fine.nominal = nominal; changed = true;
        }
    });
    if (changed) save();
}
function adminUserEligibility(nim) {
    syncFlowData();
    const user = userOf(nim);
    if (!user || user.status !== 'Aktif') return 'Akun peminjam tidak aktif atau sedang dibekukan.';
    if (db.fines.some(fine => fine.nim === nim && ['Berjalan', 'Belum Dibayar', 'Menunggu Verifikasi'].includes(fine.status)))
        return 'Peminjam masih memiliki denda yang belum diselesaikan atau diverifikasi.';
    if (db.laporan.some(issue => issue.nim === nim && issue.jenis === 'Alat / Komponen Hilang' && issue.tahap < 3))
        return 'Peminjam masih memiliki laporan kehilangan yang belum diselesaikan.';
    return '';
}
function setLoanStatus(loan, status, note) {
    loan.status = status;
    loan.riwayat ||= [];
    loan.riwayat.push({ t: new Date().toISOString(), s: status, oleh: me().name, catatan: note || '' });
}
const hasPendingReturn = loan => !!loan && OUT.includes(loan.status) && loan.items.some(item =>
    itemRemaining(item) > 0 && Number.isInteger(item.returnRequestedQty) && item.returnRequestedQty > 0);
ui.lf = 'Semua'; ui.bf = 'Semua'; ui.ff = 'Semua'; ui.isf = 'Semua';

const dash0 = V.dashboard;
V.dashboard = () => {
    syncFlowData();
    const queue = [
        ['loans', 'fa-hand-holding', `${db.loans.filter(loan => loan.status === 'Menunggu Persetujuan').length} pengajuan pinjam`],
        ['loans', 'fa-box-open', `${db.loans.filter(hasPendingReturn).length} pengembalian perlu dicek`],
        ['bookings', 'fa-door-open', `${db.bookings.filter(booking => booking.status === 'Menunggu Persetujuan').length} booking ruang`],
        ['fines', 'fa-money-bill-wave', `${db.fines.filter(fine => fine.status === 'Menunggu Verifikasi').length} pembayaran denda`],
        ['issues', 'fa-screwdriver-wrench', `${db.laporan.filter(issue => issue.tahap < 3).length} laporan kendala aktif`]
    ];
    const incoming = db.notifications.filter(notification => notification.untuk === 'ADMIN').slice(0, 5);
    return dash0() + `<div class="card"><h3 class="font-bold text-gray-800 text-sm mb-3"><i class="fas fa-list-check text-teal-600 mr-2"></i>Antrean Kerja Admin</h3><div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">${queue.map(item => `<button onclick="go('${item[0]}')" class="text-left p-3 bg-gray-50 hover:bg-teal-50 rounded-xl text-xs font-semibold text-gray-700"><i class="fas ${item[1]} text-teal-600 mr-1"></i> ${item[2]}</button>`).join('')}</div></div>
    ${incoming.length ? `<div class="card"><h3 class="font-bold text-gray-800 text-sm mb-3">Aktivitas terbaru dari pengguna</h3>${incoming.map(notification => `<div class="border-b border-gray-100 py-2 text-xs"><b>${esc(notification.title)}</b><p class="text-gray-500 mt-1">${esc(notification.desc)}</p></div>`).join('')}</div>` : ''}`;
};

// ================= PEMINJAMAN =================
const LS = ['Semua', 'Menunggu Persetujuan', 'Siap Diambil', 'Dipinjam', 'Terlambat', 'Selesai', 'Ditolak'];
V.loans = () => {
    syncFlowData();
    const statuses = [...LS, 'Dibatalkan'];
    const loans = db.loans.filter(loan => ui.lf === 'Semua' || loan.status === ui.lf || (ui.lf === 'Menunggu Cek' && hasPendingReturn(loan)));
    const rows = loans.map(loan => {
        const pendingReturn = hasPendingReturn(loan);
        const status = pendingReturn ? 'Menunggu Cek' : loan.status;
        const items = loan.items.map(item => {
            const history = (item.returnHistory || []).map(entry => `${entry.qty} unit ${esc(entry.condition)} (${esc(entry.date)})`).join(', ');
            return `${esc(item.nama)} x${item.qty}${item.returnedQty ? ` <span class="sub">(kembali ${item.returnedQty}, sisa ${itemRemaining(item)}${history ? `; ${history}` : ''})</span>` : ''}${item.returnRequestedQty ? ` <span class="sub text-teal-700">(pengembalian ${item.returnRequestedQty} menunggu cek)</span>` : ''}`;
        }).join('<br>');
        const attachment = loan.suratLampiran;
        const attachmentTypeAllowed = attachment && (/^image\/(jpeg|png|gif|webp)$/.test(attachment.type)
            || ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(attachment.type));
        const attachmentLink = attachmentTypeAllowed && typeof attachment.data === 'string'
            && attachment.data.startsWith(`data:${attachment.type};base64,`)
            && /^data:[^;]+;base64,[A-Za-z0-9+/=]+$/.test(attachment.data)
            ? `<br><a href="${esc(attachment.data)}" download="${esc(attachment.name || loan.surat || 'surat-pengantar')}" class="text-xs text-teal-700 underline">Unduh surat pengantar: ${esc(attachment.name || loan.surat)}</a>`
            : loan.surat ? `<br><span class="sub text-amber-700">Lampiran lama tidak tersimpan: ${esc(loan.surat)}</span>` : '';
        const qty = itemRemainingCount(loan), due = loan.tglKembali, late = status === 'Terlambat' ? lateWorkDays(due) : 0;
        let actions = '';
        if (loan.status === 'Menunggu Persetujuan') actions = ib('fa-check', 'Setujui', `loanOk('${loan.id}')`, 'ok') + ib('fa-xmark', 'Tolak', `loanNo('${loan.id}')`, 'bad');
        else if (loan.status === 'Siap Diambil') actions = ib('fa-handshake', 'Catat serah terima', `loanOut('${loan.id}')`, 'ok');
        else if (pendingReturn) actions = ib('fa-box-open', 'Periksa pengembalian', `loanIn('${loan.id}')`, 'ok');
        return `<tr><td class="font-mono text-xs">${loan.id}</td><td><b class="text-gray-800">${esc(loan.nama)}</b><br><span class="sub">${esc(loan.nim)}</span></td><td>${items}${loan.items.some(item => asetOf(item.toolId).harga >= db.policy.ambangTinggi) ? '<br><span class="badge b-amber">Bernilai tinggi</span>' : ''}<br><span class="sub">${esc(loan.tujuan)}</span>${attachmentLink}${loan.buktiFoto ? `<br><a href="${esc(loan.buktiFoto)}" target="_blank" rel="noopener" class="text-xs text-teal-700 underline">Lihat bukti alat</a>` : ''}</td><td>${loan.tglAmbil}<br><span class="sub">s/d ${due}</span></td><td>${badge(status)}${late ? `<br><span class="sub text-rose-600">${late} hari kerja | ${rp(Math.min(late * qty * db.policy.dendaHari, db.policy.dendaMaks))}</span>` : ''}${loan.alasan ? `<br><span class="sub">${esc(loan.alasan)}</span>` : ''}</td><td><div class="flex gap-1">${actions}</div></td></tr>`;
    }).join('');
    return `${tabs('lf', ['Semua', ...statuses], ui.lf)}${tbl(['ID', 'Peminjam', 'Alat', 'Periode', 'Status', 'Aksi'], rows, 'Tidak ada peminjaman.')}
    <p class="text-[11px] text-gray-400">Alur: Menunggu Persetujuan → Siap Diambil → Dipinjam → (Terlambat) → Menunggu Cek → Selesai.</p>`;
};
function newPickupCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = Array.from({ length: 6 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
    } while (db.loans.some(loan => loan.kode === code));
    return code;
}
function loanOk(id) {
    const loan = db.loans.find(item => item.id === id);
    if (!loan) return;
    if (loan.status !== 'Menunggu Persetujuan') return showToast('Pengajuan ini tidak lagi menunggu persetujuan.', 'error');
    const eligibilityError = adminUserEligibility(loan.nim);
    if (eligibilityError) return showToast(eligibilityError, 'error');
    const validationError = cekPengajuan({
        user: userOf(loan.nim), items: loan.items, tujuanJenis: loan.tujuanJenis, tujuan: loan.tujuan,
        tglAmbil: loan.tglAmbil, jamAmbil: loan.jamAmbil, tglKembali: loan.tglKembali, jamKembali: loan.jamKembali
    }, loan.id);
    if (validationError) return showToast(validationError, 'error');
    for (const item of loan.items) {
        const available = loanAvailability(item.toolId, loan.id);
        if (available < item.qty) return showToast(`Stok ${item.nama} tidak cukup (tersedia ${available}).`, 'error');
    }
    loan.kode ||= newPickupCode();
    setLoanStatus(loan, 'Siap Diambil');
    notifyUser(loan.nim, 'Peminjaman disetujui', `Pengajuan ${id} disetujui. Ambil alat pada ${loan.tglAmbil} pukul ${loan.jamAmbil}.`, 'pengembalian', 'fa-circle-check', 'text-green-600 bg-green-50');
    log(`Setujui peminjaman ${id}`); save(); render(); showToast('Pengajuan disetujui.');
}
function loanNo(id) {
    const pending = db.loans.find(item => item.id === id);
    if (!pending || pending.status !== 'Menunggu Persetujuan') return showToast('Pengajuan ini tidak lagi menunggu keputusan.', 'error');
    formModal('Tolak ' + id, [{ k: 'alasan', l: 'Alasan penolakan', type: 'textarea' }], o => {
        const loan = db.loans.find(item => item.id === id);
        if (!loan || loan.status !== 'Menunggu Persetujuan') return showToast('Pengajuan ini tidak lagi menunggu keputusan.', 'error'), false;
        if (!o.alasan) return showToast('Alasan penolakan wajib diisi.', 'error'), false;
        loan.alasan = o.alasan; setLoanStatus(loan, 'Ditolak', o.alasan);
        notifyUser(loan.nim, 'Peminjaman ditolak', `Pengajuan ${id} ditolak: ${o.alasan}`, 'laporan', 'fa-circle-xmark', 'text-rose-600 bg-rose-50');
        log(`Tolak peminjaman ${id}`); save(); render();
    }, 'Tolak');
}
function loanOut(id) {
    const loan = db.loans.find(item => item.id === id);
    if (!loan || loan.status !== 'Siap Diambil') return showToast('Peminjaman ini tidak lagi siap diserahkan.', 'error');
    formModal('Serah Terima ' + id, [{ k: 'kondisi', l: 'Kondisi alat saat diserahkan', opts: ['Baik', 'Ada catatan'] }, { k: 'cat', l: 'Catatan / kelengkapan', type: 'textarea', req: false }], o => {
        if (loan.status !== 'Siap Diambil') return showToast('Peminjaman ini tidak lagi siap diserahkan.', 'error'), false;
        const eligibilityError = adminUserEligibility(loan.nim);
        if (eligibilityError) return showToast(eligibilityError, 'error'), false;
        for (const item of loan.items) {
            const asset = asetOf(item.toolId), available = loanAvailability(item.toolId, loan.id);
            if (asset.dihapus || available < item.qty)
                return showToast(`Aset ${item.nama} tidak lagi tersedia untuk diserahkan.`, 'error'), false;
        }
        loan.out = o; setLoanStatus(loan, 'Dipinjam', o.cat);
        notifyUser(loan.nim, 'Alat sudah diserahkan', `${itemNames(loan)} diserahkan. Batas kembali ${loan.tglKembali} pukul ${loan.jamKembali}.`, 'pengembalian', 'fa-box-open', 'text-teal-600 bg-teal-50');
        log(`Serah terima ${id}`); save(); render(); showToast('Serah terima dicatat.');
    }, 'Serahkan');
}
function loanIn(id) {
    const loan = db.loans.find(item => item.id === id); if (!loan) return;
    if (!hasPendingReturn(loan)) return showToast('Peminjam harus mengajukan pengembalian sebelum Admin memeriksanya.', 'error');
    const activeItems = loan.items.map((item, index) => ({ item, index }))
        .filter(({ item }) => itemRemaining(item) > 0 && Number.isInteger(item.returnRequestedQty) && item.returnRequestedQty > 0);
    const fields = activeItems.flatMap(({ item, index }) => [
        { k: `qty_${index}`, l: `${item.nama} — jumlah diajukan (${item.returnRequestedQty} unit)`, type: 'number', v: item.returnRequestedQty, min: 0, max: Math.min(itemRemaining(item), item.returnRequestedQty), step: 1, req: false },
        { k: `condition_${index}`, l: `Kondisi ${item.nama}`, opts: ['Baik', 'Rusak', 'Hilang'], v: 'Baik' }
    ]);
    fields.push({ k: 'cat', l: 'Catatan pengembalian', type: 'textarea', req: false });
    formModal('Pengembalian ' + id, fields, o => {
        const selected = activeItems.map(({ item, index }) => ({ item, index, qty: o[`qty_${index}`], condition: o[`condition_${index}`] }));
        if (!hasPendingReturn(loan)) return showToast('Pengajuan pengembalian tidak lagi tersedia.', 'error'), false;
        if (selected.some(entry => !qtyPengembalianValid(entry.item, entry.qty)))
            return showToast('Jumlah pengembalian tidak valid. Periksa kembali jumlah setiap alat.', 'error'), false;
        const returning = selected.filter(entry => entry.qty > 0);
        if (!returning.length) return showToast('Masukkan jumlah minimal satu unit untuk dikembalikan.', 'error'), false;
        syncFlowData();
        const user = userOf(loan.nim), returnedAt = todayISO(), fine = db.fines.find(item => item.loanId === id && item.status === 'Berjalan');
        const returnedLate = lateWorkDays(loan.tglKembali, returnedAt);
        const qtyReturned = returning.reduce((sum, entry) => sum + entry.qty, 0);
        returning.forEach(({ item, qty, condition }) => {
            item.returnedQty = (item.returnedQty || 0) + qty;
            item.returnRequestedQty = Math.max(0, (item.returnRequestedQty || 0) - qty);
            item.returnHistory ||= [];
            item.returnHistory.push({ qty, condition, date: returnedAt, note: o.cat });
            const asset = asetOf(item.toolId);
            if (condition === 'Baik') return;
            const lost = condition === 'Hilang';
            db.laporan.unshift({
                id: nextFlowId('LPR'), nim: loan.nim, nama: loan.nama, toolId: item.toolId, toolName: item.nama,
                jenis: lost ? 'Alat / Komponen Hilang' : 'Rusak Fisik', ditemukan: 'Saat pengembalian', tingkat: 'Berat',
                tgl: returnedAt, jumlah: qty, deskripsi: `Ditemukan saat pengembalian ${id}. ${o.cat}`, foto: '', tahap: 0,
                applied: true, riwayat: [{ tahap: TAHAP[0], t: new Date().toISOString(), oleh: loan.nama, catatan: '' }]
            });
            if (lost) asset.hilang = Math.min(asset.total - (asset.rusak || 0), (asset.hilang || 0) + qty);
            else asset.rusak = Math.min(asset.total - (asset.hilang || 0), (asset.rusak || 0) + qty);
            asset.status = lost ? 'Hilang' : 'Rusak (menunggu keputusan)';
        });
        const remainingQty = itemRemainingCount(loan);
        const allReturned = remainingQty === 0;
        loan.pengembalianDiajukan = loan.items.some(item => Number.isInteger(item.returnRequestedQty) && item.returnRequestedQty > 0 && itemRemaining(item) > 0);
        if (!loan.pengembalianDiajukan) delete loan.pengembalianDiajukan;
        if (fine) {
            fine.frozenNominal = Math.min(db.policy.dendaMaks, (fine.frozenNominal || 0) + Math.min(returnedLate * qtyReturned * db.policy.dendaHari, db.policy.dendaMaks));
            fine.qtyAktif = remainingQty;
            fine.nominal = Math.min(db.policy.dendaMaks, fine.frozenNominal + Math.min(fine.hari * remainingQty * db.policy.dendaHari, db.policy.dendaMaks));
            if (allReturned) {
                fine.status = 'Belum Dibayar'; fine.dikembalikan = returnedAt;
                notifyUser(loan.nim, 'Denda siap dibayar', `Denda ${fine.id} sebesar ${rp(fine.nominal)} untuk ${id}. Silakan bayar melalui menu Sanksi & Denda.`, 'sanksi', 'fa-file-invoice-dollar', 'text-amber-600 bg-amber-50');
            }
            const recentFines = db.fines.filter(item => item.nim === loan.nim && item.createdAt >= addCalendarDays(new Date(), -182)).length;
            if (allReturned && user && user.status === 'Aktif' && (fine.hari > db.policy.batasBeku || recentFines >= db.policy.kaliTerlambat)) {
                user.status = 'Dibekukan'; user.bekuSampai = addCalendarDays(new Date(`${returnedAt}T00:00:00`), db.policy.lamaBeku);
                notifyUser(loan.nim, 'Akses pinjam dibekukan', `Akses pinjam dibekukan sampai ${user.bekuSampai} akibat keterlambatan.`, 'sanksi', 'fa-ban', 'text-rose-600 bg-rose-50');
            }
        }
        const status = allReturned ? 'Selesai' : returnedLate ? 'Terlambat' : 'Dipinjam';
        setLoanStatus(loan, status, o.cat);
        if (allReturned) loan.dikembalikan = returnedAt;
        notifyUser(loan.nim, allReturned ? 'Pengembalian selesai' : 'Pengembalian sebagian selesai',
            `${id}: ${allReturned ? 'semua alat telah dikembalikan' : 'pengembalian sebagian telah dicatat'}.`, 'pengembalian', 'fa-circle-check', 'text-green-600 bg-green-50');
        log(`Terima pengembalian ${id}${allReturned ? '' : ' (sebagian)'}`); save(); render();
        showToast(allReturned ? (fine ? `Selesai. Denda ${rp(fine.nominal)} dibuat.` : 'Semua alat pada transaksi sudah dikembalikan.') : 'Pengembalian sebagian dicatat.');
    }, 'Selesaikan');
}

// ================= BOOKING RUANG =================
V.bookings = () => {
    const bookings = db.bookings.filter(booking => ui.bf === 'Semua' || booking.status === ui.bf);
    const actionsFor = booking => {
        if (booking.status === 'Menunggu Persetujuan') return ib('fa-check', 'Setujui', `bkSet('${booking.id}','Disetujui')`, 'ok') + ib('fa-xmark', 'Tolak', `bkSet('${booking.id}','Ditolak')`, 'bad');
        if (booking.status !== 'Disetujui') return '';
        if (bookingHasEnded(booking)) return ib('fa-check-double', 'Tandai selesai', `bkSet('${booking.id}','Selesai')`, 'ok') + ib('fa-calendar-xmark', 'Tidak digunakan', `bkSet('${booking.id}','Tidak Digunakan')`, 'warn');
        return ib('fa-ban', 'Batalkan', `bkSet('${booking.id}','Dibatalkan')`, 'warn');
    };
    const rows = bookings.map(booking => `<tr><td class="font-mono text-xs">${booking.id}</td><td><b class="text-gray-800">${esc(booking.ruang)}</b><br><span class="sub">${esc(booking.tujuan)}</span></td><td>${booking.tglMulai}${booking.tglSelesai !== booking.tglMulai ? ` - ${booking.tglSelesai}` : ''}<br><span class="sub">${booking.jamMulai}-${booking.jamSelesai} | ${booking.peserta} orang</span></td><td>${esc(booking.pj)}<br><span class="sub">${esc(booking.nim)} | ${esc(booking.kontak)}</span></td><td>${badge(booking.status)}${booking.alasan ? `<br><span class="sub">${esc(booking.alasan)}</span>` : ''}</td>
        <td><div class="flex flex-wrap gap-1">${actionsFor(booking)}</div></td></tr>`).join('');
    return `<p class="text-xs text-gray-500">Booking yang disetujui dapat ditandai selesai atau tidak digunakan setelah waktu jadwal berakhir.</p>${tabs('bf', ['Semua', 'Menunggu Persetujuan', 'Disetujui', 'Ditolak', 'Dibatalkan', 'Selesai', 'Tidak Digunakan'], ui.bf)}${tbl(['ID', 'Ruang', 'Jadwal', 'Penanggung Jawab', 'Status', 'Aksi'], rows, 'Belum ada booking.')}`;
};
function bkSet(id, st) {
    const booking = db.bookings.find(item => item.id === id); if (!booking) return;
    const apply = reason => {
        const allowedFrom = {
            Disetujui: ['Menunggu Persetujuan'],
            Ditolak: ['Menunggu Persetujuan'],
            Selesai: ['Disetujui'],
            'Tidak Digunakan': ['Disetujui'],
            Dibatalkan: ['Disetujui']
        };
        if (!allowedFrom[st] || !allowedFrom[st].includes(booking.status))
            return showToast('Status booking sudah berubah atau tindakan ini tidak sesuai alur.', 'error'), false;
        if (['Selesai', 'Tidak Digunakan'].includes(st) && (booking.status !== 'Disetujui' || !bookingHasEnded(booking)))
            return showToast('Booking hanya dapat ditutup setelah jadwal yang disetujui berakhir.', 'error'), false;
        if (st === 'Disetujui') {
            const eligibilityError = adminUserEligibility(booking.nim);
            if (eligibilityError) return showToast(eligibilityError, 'error'), false;
            const capacity = db.policy.kapasitas[booking.ruang];
            if (!capacity || !Number.isInteger(booking.peserta) || booking.peserta < 1 || booking.peserta > capacity)
                return showToast('Jumlah peserta tidak valid atau melebihi kapasitas ruang.', 'error'), false;
            if (booking.tglMulai <= todayISO() || booking.tglSelesai < booking.tglMulai
                || !isAdminWorkday(booking.tglMulai) || !isAdminWorkday(booking.tglSelesai)
                || adminWorkingDays(booking.tglMulai, booking.tglSelesai) > db.policy.maksBooking)
                return showToast(`Tanggal booking tidak valid atau melebihi ${db.policy.maksBooking} hari kerja.`, 'error'), false;
            if (booking.jamMulai < db.policy.jamBuka || booking.jamSelesai > db.policy.jamTutup
                || booking.jamSelesai <= booking.jamMulai) return showToast('Jam booking tidak valid atau di luar jam layanan.', 'error'), false;
            const clash = db.bookings.find(item => item.id !== id && item.status === 'Disetujui' && item.ruang === booking.ruang
                && bookingDateRangesOverlap(booking, item)
                && booking.jamMulai < item.jamSelesai && item.jamMulai < booking.jamSelesai);
            if (clash) return showToast(`Jadwal bentrok dengan ${clash.id} (${clash.jamMulai}-${clash.jamSelesai}).`, 'error');
        }
        booking.status = st;
        if (reason) booking.alasan = reason;
        if (['Selesai', 'Tidak Digunakan'].includes(st)) {
            booking.closedAt = new Date().toISOString();
            booking.closedBy = me().name;
        }
        const description = st === 'Disetujui'
            ? `Booking ${id} disetujui: ${booking.ruang}, ${booking.tglMulai} pukul ${booking.jamMulai}-${booking.jamSelesai}.`
            : st === 'Ditolak' ? `Booking ${id} ditolak: ${reason}`
                : st === 'Selesai' ? `Booking ${id} selesai: ${booking.ruang}, ${booking.tglMulai} pukul ${booking.jamMulai}-${booking.jamSelesai}.`
                    : st === 'Tidak Digunakan' ? `Booking ${id} ditandai tidak digunakan oleh Admin.`
                        : `Booking ${id} dibatalkan oleh Admin.`;
        const finished = ['Selesai', 'Tidak Digunakan'].includes(st);
        notifyUser(booking.nim, `Booking ${st.toLowerCase()}`, description, 'booking', st === 'Disetujui' || st === 'Selesai' ? 'fa-circle-check' : 'fa-circle-xmark', st === 'Disetujui' || st === 'Selesai' ? 'text-green-600 bg-green-50' : finished ? 'text-gray-600 bg-gray-50' : 'text-rose-600 bg-rose-50');
        log(`Booking ${id} -> ${st}`); save(); render(); showToast('Booking ' + st.toLowerCase());
    };
    if (st === 'Ditolak') return formModal('Tolak booking ' + id, [{ k: 'alasan', l: 'Alasan penolakan', type: 'textarea' }], o => {
        if (!o.alasan) return showToast('Alasan penolakan wajib diisi.', 'error'), false;
        return apply(o.alasan);
    }, 'Tolak');
    if (!confirm(`${st} booking ${id}?`)) return;
    apply('');
}

// ================= DENDA & SANKSI =================
V.fines = () => {
    const fines = db.fines.filter(fine => ui.ff === 'Semua' || fine.status === ui.ff), sum = status => db.fines.filter(fine => fine.status === status).reduce((total, fine) => total + fine.nominal, 0);
    const rows = fines.map(fine => `<tr><td class="font-mono text-xs">${fine.id}</td><td><b class="text-gray-800">${esc(fine.nama)}</b><br><span class="sub">${esc(fine.nim)} | ${fine.loanId}</span></td><td>${esc(fine.alat)}<br><span class="sub">${fine.hari} hari kerja</span></td><td>${rp(fine.nominal)}</td><td>${fine.bukti ? `<a href="${esc(fine.bukti)}" target="_blank" rel="noopener" class="text-teal-700 underline">Lihat bukti</a>` : fine.metode === 'Tunai' ? 'Tunai' : '-'}</td><td>${badge(fine.status)}${fine.metode ? `<br><span class="sub">${esc(fine.metode)}</span>` : ''}${fine.catatan ? `<br><span class="sub">${esc(fine.catatan)}</span>` : ''}</td>
        <td><div class="flex gap-1">${['Belum Dibayar', 'Menunggu Verifikasi'].includes(fine.status) ? ib('fa-check', 'Tandai lunas', `fineOk('${fine.id}')`, 'ok') + ib('fa-hand-holding-heart', 'Bebaskan denda', `fineWaive('${fine.id}')`, 'warn') : ''}${fine.status === 'Menunggu Verifikasi' ? ib('fa-xmark', 'Tolak bukti pembayaran', `fineReject('${fine.id}')`, 'bad') : ''}</div></td></tr>`).join('');
    return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">${stat('Belum Dibayar', rp(sum('Belum Dibayar')), 'text-rose-500')}${stat('Menunggu Verifikasi', rp(sum('Menunggu Verifikasi')), 'text-amber-500')}${stat('Terkumpul (Lunas)', rp(sum('Lunas')), 'text-teal-600')}</div>
    ${tabs('ff', ['Semua', 'Berjalan', 'Belum Dibayar', 'Menunggu Verifikasi', 'Lunas', 'Dibebaskan'], ui.ff)}${tbl(['ID', 'Peminjam', 'Alat', 'Jumlah', 'Bukti', 'Status', 'Aksi'], rows, 'Belum ada denda.')}
    <div class="card"><h3 class="font-bold text-gray-800 text-sm mb-2">Akun Dibekukan / Blacklist</h3>${db.users.filter(u => ['Dibekukan', 'Blacklist'].includes(u.status)).map(u => `<div class="flex justify-between items-center border-b border-gray-50 py-2 text-sm"><span>${esc(u.name)} <span class="sub">${esc(u.nim)}</span> ${badge(u.status)}</span>${(() => { const t = db.fines.filter(f => f.nim === u.nim && ['Belum Dibayar', 'Menunggu Verifikasi'].includes(f.status)).length; return `<button class="btn btn-teal" onclick="${t ? `showToast('Masih ada ${t} denda belum lunas.','error')` : `setUser('${esc(u.nim)}','Aktif')`}">Cabut sanksi</button>`; })()}</div>`).join('') || '<p class="text-xs text-gray-400">Tidak ada akun bersanksi.</p>'}</div>`;
};
function fineOk(id) {
    const fine = db.fines.find(item => item.id === id);
    if (!fine || !['Belum Dibayar', 'Menunggu Verifikasi'].includes(fine.status)) return showToast('Denda ini tidak menunggu verifikasi atau pembayaran.', 'error');
    if (!confirm(`Tandai ${id} lunas (${rp(fine.nominal)})?`)) return;
    fine.status = 'Lunas'; fine.metode ||= 'Tunai di lab'; fine.dikonfirmasiAt = new Date().toISOString();
    notifyUser(fine.nim, 'Pembayaran denda diverifikasi', `Pembayaran denda ${id} sebesar ${rp(fine.nominal)} telah disetujui.`, 'sanksi', 'fa-circle-check', 'text-green-600 bg-green-50');
    log(`Denda ${id} lunas`); save(); render();
}
function fineWaive(id) {
    formModal('Bebaskan ' + id, [{ k: 'alasan', l: 'Alasan (tercatat di audit log)', type: 'textarea' }], o => {
        const fine = db.fines.find(item => item.id === id);
        if (!fine || !['Belum Dibayar', 'Menunggu Verifikasi'].includes(fine.status))
            return showToast('Denda ini tidak lagi dapat dibebaskan melalui tindakan ini.', 'error'), false;
        if (!o.alasan) return showToast('Alasan pembebasan wajib diisi.', 'error'), false;
        fine.status = 'Dibebaskan'; fine.catatan = o.alasan;
        notifyUser(fine.nim, 'Denda dibebaskan', `Denda ${id} telah dibebaskan oleh Admin.`, 'sanksi', 'fa-circle-check', 'text-green-600 bg-green-50');
        log(`Bebaskan denda ${id}: ${o.alasan}`); save(); render();
    }, 'Bebaskan');
}
function fineReject(id) {
    const current = db.fines.find(item => item.id === id);
    if (!current || current.status !== 'Menunggu Verifikasi') return showToast('Denda ini tidak menunggu verifikasi pembayaran.', 'error');
    formModal('Tolak bukti pembayaran ' + id, [{ k: 'alasan', l: 'Alasan penolakan (akan ditampilkan kepada pengguna)', type: 'textarea' }], o => {
        const fine = db.fines.find(item => item.id === id);
        if (!fine || fine.status !== 'Menunggu Verifikasi')
            return showToast('Status pembayaran sudah berubah.', 'error'), false;
        if (!o.alasan) return showToast('Alasan penolakan wajib diisi.', 'error'), false;
        const rejectedAt = new Date().toISOString();
        fine.riwayatVerifikasi ||= [];
        fine.riwayatVerifikasi.push({ status: 'Ditolak', alasan: o.alasan, t: rejectedAt, oleh: me().name });
        fine.status = 'Belum Dibayar';
        fine.bukti = '';
        fine.metode = '';
        fine.catatan = `Bukti ditolak: ${o.alasan}`;
        delete fine.dibayarAt;
        notifyUser(fine.nim, 'Bukti pembayaran ditolak', `Bukti pembayaran denda ${id} ditolak: ${o.alasan}. Silakan periksa alasan tersebut dan kirim ulang bukti pembayaran.`, 'sanksi', 'fa-circle-xmark', 'text-rose-600 bg-rose-50');
        log(`Tolak bukti pembayaran denda ${id}: ${o.alasan}`); save(); render();
        showToast('Bukti pembayaran ditolak. Pengguna dapat mengirim ulang.');
    }, 'Tolak bukti');
}

// ================= LAPORAN KENDALA =================
V.issues = () => {
    const reports = db.laporan.filter(issue => ui.isf === 'Semua' || TAHAP[issue.tahap] === ui.isf);
    const rows = reports.map(issue => {
        const resolution = issue.penyelesaian && typeof issue.penyelesaian === 'object'
            ? `${issue.penyelesaian.metode} (${issue.penyelesaian.jumlah} unit): ${issue.penyelesaian.catatan}`
            : issue.penyelesaian;
        const repaired = issue.jumlahDipulihkan || 0;
        const repairProgress = issue.jenis !== 'Alat / Komponen Hilang' && issue.tahap >= 2
            ? `<br><span class="sub">Unit pulih ${repaired}/${issue.jumlah}</span>` : '';
        return `<tr><td class="font-mono text-xs">${issue.id}</td><td><b class="text-gray-800">${esc(issue.toolName)}</b><br><span class="sub">${esc(issue.nama)} | ${issue.tgl}</span></td><td>${esc(issue.jenis)} <span class="badge b-gray">${esc(issue.tingkat)}</span><br><span class="sub">${esc(issue.deskripsi)}</span>${resolution ? `<br><span class="sub text-green-700">Penyelesaian: ${esc(resolution)}</span>` : ''}</td><td>${badge(TAHAP[issue.tahap])}${repairProgress}${issue.biaya ? `<br><span class="sub">Biaya ${rp(issue.biaya)}</span>` : ''}</td><td><div class="flex gap-1">${issue.tahap < 3 ? ib('fa-forward-step', 'Tahap berikutnya: ' + TAHAP[issue.tahap + 1], `issueNext('${issue.id}')`, 'ok') : ''}</div></td></tr>`;
    }).join('');
    return `${tabs('isf', ['Semua', ...TAHAP], ui.isf)}${tbl(['ID', 'Aset / Pelapor', 'Masalah', 'Status', 'Aksi'], rows, 'Tidak ada laporan.')}`;
};
function issueNext(id) {
    const issue = db.laporan.find(item => item.id === id); if (!issue || issue.tahap >= 3) return;
    const nextStage = issue.tahap + 1, lost = issue.jenis === 'Alat / Komponen Hilang';
    const fields = [];
    if (nextStage === 3 && lost) {
        fields.push(
            { k: 'metodePenyelesaian', l: 'Jenis penyelesaian', opts: ['Penggantian unit setara', 'Kompensasi / penyelesaian administratif'], v: 'Penggantian unit setara' },
            { k: 'jumlahPenyelesaian', l: `Jumlah unit yang diselesaikan (dari ${issue.jumlah})`, type: 'number', v: issue.jumlah, min: issue.jumlah, max: issue.jumlah, step: 1 },
            { k: 'catatan', l: 'Catatan penyelesaian / penggantian', type: 'textarea' }
        );
    } else {
        if (nextStage === 3) {
            const remaining = Math.max(0, issue.jumlah - (issue.jumlahDipulihkan || 0));
            fields.push(
                { k: 'jumlahPulih', l: `Jumlah unit yang selesai diperbaiki (sisa ${remaining})`, type: 'number', v: remaining, min: 1, max: remaining, step: 1 },
                { k: 'biaya', l: 'Biaya perbaikan tahap ini (Rp)', type: 'number', v: 0, min: 0 }
            );
        }
        fields.push({ k: 'catatan', l: 'Catatan perkembangan', type: 'textarea', req: false });
    }
    formModal(`Perbarui ${id}: ${TAHAP[nextStage]}`, fields, values => {
        if (issue.tahap !== nextStage - 1) return showToast('Tahap laporan sudah berubah.', 'error'), false;
        const note = String(values.catatan || '').trim();
        const storedAsset = db.assets.find(item => item.id === issue.toolId);
        if (lost && nextStage === 3 && !note)
            return showToast('Catatan penyelesaian atau penggantian wajib diisi sebelum laporan kehilangan ditutup.', 'error'), false;
        if (nextStage === 2 && !storedAsset)
            return showToast('Aset laporan tidak ditemukan; jumlah stok tidak dapat diperbarui.', 'error'), false;
        if (nextStage === 2 && lost && !issue.applied) {
            const countable = storedAsset.total - (storedAsset.rusak || 0) - (storedAsset.hilang || 0);
            if (!Number.isInteger(issue.jumlah) || issue.jumlah < 1 || countable < issue.jumlah)
                return showToast('Jumlah unit hilang melebihi stok yang dapat dicatat. Sesuaikan data aset sebelum melanjutkan.', 'error'), false;
            storedAsset.hilang = (storedAsset.hilang || 0) + issue.jumlah;
            issue.applied = true;
        }
        if (nextStage === 2 && !lost && !issue.applied) {
            const countable = storedAsset.total - (storedAsset.rusak || 0) - (storedAsset.hilang || 0);
            if (!Number.isInteger(issue.jumlah) || issue.jumlah < 1 || countable < issue.jumlah)
                return showToast('Jumlah unit rusak melebihi stok yang dapat dicatat. Sesuaikan data aset sebelum melanjutkan.', 'error'), false;
            storedAsset.rusak = (storedAsset.rusak || 0) + issue.jumlah;
            issue.jumlahDipulihkan ||= 0;
            issue.applied = true;
        }
        let completed = nextStage !== 3;
        if (nextStage === 3 && lost) {
            if (!storedAsset) return showToast('Aset laporan tidak ditemukan; penyelesaian stok tidak dapat dicatat.', 'error'), false;
            if (!Number.isInteger(values.jumlahPenyelesaian) || values.jumlahPenyelesaian !== issue.jumlah)
                return showToast('Jumlah penyelesaian harus sesuai dengan jumlah unit yang dilaporkan.', 'error'), false;
            if (!issue.applied) {
                const countable = storedAsset.total - (storedAsset.rusak || 0) - (storedAsset.hilang || 0);
                if (!Number.isInteger(issue.jumlah) || issue.jumlah < 1 || countable < issue.jumlah)
                    return showToast('Jumlah unit hilang melebihi stok yang dapat dicatat. Sesuaikan data aset sebelum menutup laporan.', 'error'), false;
                storedAsset.hilang = (storedAsset.hilang || 0) + issue.jumlah;
                issue.applied = true;
            }
            if (values.metodePenyelesaian === 'Penggantian unit setara') storedAsset.total += values.jumlahPenyelesaian;
            issue.penyelesaian = {
                metode: values.metodePenyelesaian, jumlah: values.jumlahPenyelesaian, catatan: note,
                t: new Date().toISOString(), oleh: me().name
            };
            completed = true;
        } else if (nextStage === 3) {
            if (!storedAsset) return showToast('Aset laporan tidak ditemukan; jumlah pemulihan tidak dapat dicatat.', 'error'), false;
            const remaining = issue.jumlah - (issue.jumlahDipulihkan || 0);
            if (!Number.isInteger(values.jumlahPulih) || values.jumlahPulih < 1 || values.jumlahPulih > remaining)
                return showToast('Jumlah unit pulih harus bilangan bulat dan tidak melebihi sisa unit yang belum diperbaiki.', 'error'), false;
            if (!issue.applied) {
                const countable = storedAsset.total - (storedAsset.rusak || 0) - (storedAsset.hilang || 0);
                if (!Number.isInteger(issue.jumlah) || issue.jumlah < 1 || countable < issue.jumlah)
                    return showToast('Jumlah unit rusak melebihi stok yang dapat dicatat. Sesuaikan data aset sebelum melanjutkan.', 'error'), false;
                storedAsset.rusak = (storedAsset.rusak || 0) + issue.jumlah;
                issue.applied = true;
            }
            if (storedAsset.rusak < values.jumlahPulih)
                return showToast('Jumlah unit rusak pada data aset lebih kecil daripada jumlah yang akan dipulihkan.', 'error'), false;
            issue.jumlahDipulihkan = (issue.jumlahDipulihkan || 0) + values.jumlahPulih;
            storedAsset.rusak -= values.jumlahPulih;
            issue.biaya = (issue.biaya || 0) + values.biaya;
            storedAsset.servis = (storedAsset.servis || 0) + values.biaya;
            completed = issue.jumlahDipulihkan === issue.jumlah;
            issue.released = completed;
        }
        issue.tahap = completed ? nextStage : nextStage - 1;
        const status = TAHAP[issue.tahap];
        issue.riwayat.push({
            tahap: status, t: new Date().toISOString(), oleh: me().name,
            catatan: note, ...(nextStage === 3 && !lost ? { jumlahPulih: values.jumlahPulih } : {})
        });
        const description = lost && nextStage === 3
            ? `${issue.toolName} - ${issue.penyelesaian.metode}, ${issue.penyelesaian.jumlah} unit. ${note}`
            : nextStage === 3 && !completed
                ? `${issue.toolName} - ${issue.jumlahDipulihkan} dari ${issue.jumlah} unit telah pulih; sisanya masih dalam perbaikan. ${note}`
                : `${issue.toolName} - ${note || 'Status laporan diperbarui Admin.'}`;
        notifyUser(issue.nim, `Laporan ${id}: ${status}`, description, 'pelaporan', completed ? 'fa-circle-check' : 'fa-screwdriver-wrench', completed ? 'text-green-600 bg-green-50' : 'text-indigo-600 bg-indigo-50');
        log(`Laporan ${id} -> ${status}${nextStage === 3 && !lost ? ` (${values.jumlahPulih} unit pulih)` : ''}`); save(); render();
    }, nextStage === 3 ? 'Selesai' : 'Simpan');
}

// ================= PENGUMUMAN =================
V.announce = () => `<div class="card"><h3 class="font-bold text-gray-800 text-sm mb-3">Buat Pengumuman untuk Pengguna</h3><form onsubmit="addAnn(event)" class="space-y-3"><input id="an-j" required class="inp" placeholder="Judul"><textarea id="an-i" required rows="3" class="inp" placeholder="Isi pengumuman"></textarea><button class="btn btn-teal">Terbitkan</button></form></div>
    ${tbl(['Tanggal', 'Pengumuman', 'Aksi'], db.pengumuman.map(a => `<tr><td>${a.tgl}</td><td><b class="text-gray-800">${esc(a.judul)}</b><br><span class="sub">${esc(a.isi)}</span></td><td>${ib('fa-trash', 'Hapus', `delAnn(${a.id})`, 'bad')}</td></tr>`).join(''), 'Belum ada pengumuman.')}`;
function addAnn(e) {
    e.preventDefault();
    const announcement = { id: Date.now(), judul: $('an-j').value.trim(), isi: $('an-i').value.trim(), tgl: todayISO() };
    db.pengumuman.unshift(announcement);
    db.users.filter(user => user.role !== 'Admin').forEach(user => notifyUser(user.nim, announcement.judul, announcement.isi, 'dashboard', 'fa-bullhorn', 'text-sky-600 bg-sky-50'));
    log('Terbitkan pengumuman'); save(); render(); showToast('Pengumuman terbit.');
}
function delAnn(id) { if (!confirm('Hapus pengumuman?')) return; db.pengumuman = db.pengumuman.filter(a => a.id !== id); save(); render(); }
````
