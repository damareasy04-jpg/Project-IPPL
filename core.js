/* =====================================================================
   KOMPAS Lab - core.js
   Database bersama untuk user.html dan admin.html (server SQLite dengan cache lokal).
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
    if (mode !== 'admin' && mode !== 'shared' && u.role === 'Admin') return { msg: 'Akun admin masuk lewat Panel Admin (admin.html).' };
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
