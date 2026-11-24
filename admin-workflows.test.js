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
