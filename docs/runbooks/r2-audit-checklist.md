# Checklist audit penyimpanan Evolve

Audit membandingkan kandidat R2 pada PR #2 dengan build produksi berbasis `2046c10`. Semua pemeriksaan yang menulis data menggunakan fixture lokal. Pengujian kompatibilitas berkas lokal dan verifikasi kontrak penandatanganan belum membuktikan perilaku layanan Cloudflare.

## Tampilan, alur, dan kompatibilitas

- [x] Bandingkan perubahan tampilan dengan baseline. Tema, stylesheet, shell, rute, navigasi, tata letak dashboard, dan kontrol interaksi tetap sama pada source diff. Perubahan tampilan terbatas pada nilai kuota, satuan, dan penjelasan penyimpanan.
- [x] Verifikasi sidebar Board Room pada desktop, penyimpanan preferensi, respons yang tertunda, dan navigasi drawer pada layar kecil.
- [x] Verifikasi Files di Shared Settings dan kedua aplikasi, termasuk label dan tipografi tabel, nama dokumen panjang, mode terang/gelap, dan akses keyboard pada lebar 320, 390, dan 1.440 px.
- [x] Verifikasi pembuatan proyek dengan dokumen, pembatalan dan percobaan ulang, pemulihan unggahan parsial, dan isi ZIP serta indeks tujuan dokumen.
- [x] Verifikasi pembatasan origin dan sesi pada API dokumen serta penghapusan massal admin. Pastikan dokumen privat dan draft pengguna lain tetap terlindungi.
- [x] Verifikasi kuota Blob tetap 1 GiB dan kuota R2 ditampilkan sebagai 9 GB desimal. Rekonsiliasi rincian kedua aplikasi dan aset bersama, termasuk reservasi aktif, revisi, dan file yang menunggu penghapusan.
- [ ] Bandingkan tampilan isi file nyata dan unduhan dari kedua provider pada preview staging berizin dengan browser desktop dan mobile.

## Migrasi, integritas, dan kegagalan

- [x] Uji skema aditif pada PostgreSQL lokal. Rujukan provider per lampiran mempertahankan ID dan URL. Reservasi lama menyimpan provider asal ketika tujuan unggahan baru berubah.
- [x] Uji dua reservasi bersamaan pada batas 9 GB. Hanya satu yang dapat memakai sisa kuota. Saat laporan inventaris tidak valid, reservasi R2 baru ditolak.
- [x] Uji tanda tangan yang mengikat objek, MIME, ukuran, dan kondisi tanpa penimpaan. Masa berlaku paling lama lima menit dan dibatasi umur reservasi.
- [x] Uji checksum, ukuran yang salah, dan pemulihan dari respons yang hilang di antara penyalinan dan perubahan rujukan. Arsip tetap menolak perubahan nama atau isi.
- [x] Uji laporan inventaris untuk objek tanpa catatan, ukuran salah, dan file siap yang hilang. Jika hasil pertama tidak cocok, pemindai mengecek ulang sebelum menjeda unggahan. Kegagalan pemindaian tetap menutup reservasi R2.
- [x] Verifikasi dari kode bahwa penghapusan memakai provider baris serta penanda salinan. Skrip pensiun Blob memerlukan rekonsiliasi dan latihan pemulihan, masa simpan 14 hari, serta verifikasi ulang checksum tujuan.
- [ ] Buktikan di bucket uji bahwa PUT browser 25 MiB berhasil, panjang atau MIME berbeda ditolak, PUT ulang ditolak, dan objek tidak terbuka bagi pengguna anonim. Jalankan probe Chromium dan Firefox.
- [ ] Uji alur Evolve dari reservasi hingga finalisasi R2 menggunakan database, Blob privat, dan bucket R2 terpisah. Periksa dokumen Board Room, tugas Locker Room, revisi, logo, dan foto profil.
- [ ] Uji copy, rekonsiliasi, baca file lama dan baru saat unggahan dijeda, pemulihan rujukan Blob, serta penghapusan kedua salinan terhadap provider nyata.
- [ ] Siapkan cadangan PostgreSQL dan file, ukur durasi pemulihan, lalu verifikasi isi dan metadata setelah pengembalian.
- [ ] Setelah demo produksi siap ditinjau dan syarat rilis terpenuhi, promosikan build yang diuji. Periksa health dan batas akses produksi dengan operasi baca. Jangan menghapus sumber sampai seluruh pemeriksaan retensi terpenuhi.

## Status rilis

Produksi tetap membaca dan menyimpan file melalui Vercel Blob. Lingkungan ini belum memiliki kredensial bucket R2 uji yang dibutuhkan untuk menyelesaikan pemeriksaan provider. [Panduan pelaksanaan](r2-storage-migration.md)
