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
    const adminSession = (() => {
        try { return JSON.parse(localStorage.getItem('active_admin')); } catch { return null; }
    })();
    const admin = adminSession && getUser(adminSession.nim);
    if (admin && admin.role === 'Admin' && admin.status === 'Aktif') {
        window.location.replace('user.html?mode=admin');
        return;
    }
    if (adminSession) localStorage.removeItem('active_admin');
    const nim = localStorage.getItem(SES_U); me = nim ? getUser(nim) : null;
    if (me && (me.role === 'Admin' || ['Nonaktif', 'Blacklist'].includes(me.status))) { localStorage.removeItem(SES_U); me = null; }
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
function handleLogin(e) {
    e.preventDefault();
    const r = tryLogin($('login-email').value, $('login-password').value, 'shared');
    if (!r.ok) return showAuthAlert(r.msg, 'error');
    me = r.user;
    if (me.role === 'Admin') {
        localStorage.removeItem(SES_U);
        localStorage.setItem('active_admin', JSON.stringify({ name: me.name, nim: me.nim }));
    } else {
        localStorage.removeItem('active_admin');
        localStorage.setItem(SES_U, me.nim);
    }
    log(me.role === 'Admin' ? 'Login admin' : 'Login user');
    showAuthAlert('Login berhasil! Memuat dashboard...', 'success');
    if (me.role === 'Admin') {
        setTimeout(() => window.location.replace('user.html?mode=admin'), 400);
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
function handleLogout() { if (me) log('Logout user'); localStorage.removeItem(SES_U); me = null; checkSession(); }

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
