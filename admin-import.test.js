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
