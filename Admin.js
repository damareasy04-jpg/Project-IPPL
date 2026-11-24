// ================= HELPER & DATA =================
const KEY = 'kompas_db_v2', LEGACY_KEY = 'kompas_admin_db', LEGACY_BACKUP_KEY = 'kompas_admin_db_backup', SES = 'active_admin';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const localISODate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const todayISO = () => localISODate(new Date());
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
    const active = load(SES, null);
    const admin = active && db?.users.find(user => user.nim === active.nim && user.role === 'Admin' && user.status === 'Aktif');
    if (!admin) { localStorage.removeItem(SES); checkSession(); return; }
    render();
});

function checkSession() {
    const a = load(SES, null);
    const user = a && db.users.find(x => x.nim === a.nim && x.role === 'Admin' && x.status === 'Aktif');
    if (a && !user) localStorage.removeItem(SES);
    if (!user) { window.location.replace('user.html'); return; }
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
function handleLogout() { log('Logout admin'); localStorage.removeItem(SES); checkSession(); }

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
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <li>Pengguna membuka <a class="text-teal-700 font-semibold underline" href="user.html" target="_blank" rel="noopener">halaman login bersama</a>, lalu masuk memakai NPM/NIP atau email dan kata sandi sementara.</li>
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
const hasPendingReturn = pengembalianMenungguCek;
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
