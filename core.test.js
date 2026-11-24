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

test('a valid user loan request starts in the admin confirmation queue', () => {
    const context = createCoreContext();
    const nim = evaluate(context, "db.users.find(user => user.role === 'Mahasiswa' && user.status === 'Aktif').nim");
    evaluate(context, 'db.loans = []; db.fines = []; db.laporan = []');
    const result = JSON.parse(evaluate(context, `(() => {
        const user = getUser('${nim}');
        const asset = db.assets.find(item => tersedia(item) > 0 && item.harga < db.policy.ambangTinggi);
        const tglAmbil = nextKerja(addDays(todayISO(), 3));
        const request = {
            user, items: [{ toolId: asset.id, qty: 1 }],
            tujuanJenis: 'Mata Kuliah / Praktikum', tujuan: 'Uji konfirmasi admin',
            tglAmbil, jamAmbil: '09:00', tglKembali: tambahHariKerja(tglAmbil, 1), jamKembali: '15:00'
        };
        const error = cekPengajuan(request);
        if (error) return JSON.stringify({ error });
        const loan = buatLoan(request, ST.MENUNGGU);
        return JSON.stringify({ id: loan.id, status: loan.status });
    })()`));

    assert.equal(result.error, undefined);
    assert.match(result.id, /^TRX-/);
    assert.equal(result.status, 'Menunggu Persetujuan');
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
