# KOMPAS Lab

KOMPAS Lab adalah prototipe aplikasi inventaris laboratorium berbasis HTML, CSS, dan JavaScript. Halaman utama `user.html` memuat login bersama dan kedua dashboard.

## Menjalankan aplikasi

1. Buka folder proyek di Visual Studio Code.
2. Jalankan server web lokal dari folder proyek, misalnya menggunakan ekstensi Live Server.
3. Buka `user.html` melalui server lokal sebagai halaman login bersama dan aplikasi utama. Akun admin akan masuk ke panel admin, sedangkan akun pengguna akan masuk ke panel pengguna.
4. Data contoh dibuat otomatis saat aplikasi pertama kali dibuka.

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
