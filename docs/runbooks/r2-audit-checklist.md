# Checklist audit penyimpanan Evolve

Audit membandingkan kandidat R2 pada PR #2 dengan build produksi berbasis `2046c10`. Semua pemeriksaan yang menulis data menggunakan fixture lokal. Pengujian kompatibilitas berkas lokal dan verifikasi kontrak penandatanganan belum membuktikan perilaku layanan Cloudflare.

## Tampilan, alur, dan kompatibilitas

- [x] Bandingkan perubahan tampilan dengan baseline. Tema, stylesheet, shell, rute, navigasi, tata letak dashboard, dan kontrol interaksi tetap sama pada source diff. Perubahan tampilan terbatas pada nilai kuota, satuan, dan penjelasan penyimpanan.
- [x] Periksa cakupan regresi umum Board Room. Termasuk proyek dan aset, impor/pemetaan CSV, tahapan dan review, laporan, peta, dan grafik dengan filter.
- [x] Periksa cakupan regresi umum Locker Room. Termasuk pembuatan dan perubahan tugas, draft, arsip, kalender dan consent, recurrence, template, pencarian, dan ekspor.
- [x] Periksa alur workspace bersama. Termasuk inisiasi login dan pemilih aplikasi, pemeriksaan peran, preferensi tema, serta navigasi dan pembaruan lintas aplikasi. Persetujuan OAuth sungguhan tidak termasuk dalam fixture browser.
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

## Bukti audit lanjutan

| Pemeriksaan                  | Hasil                                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regresi utama Chromium di CI | 294/295 lulus pada run sebelumnya. Satu pengukuran sidebar mengambil dimensi sebelum area siap. Tes kini menunggu sidebar desktop yang tepat dan pengukuran yang tersedia. Seluruh 4 skenario sidebar lulus pada rerun.     |
| Chromium lokal               | 18/18 untuk sidebar, dokumen, dan Files. 16/16 untuk workspace terhubung, draft, dan peta. Suite regional juga lulus 9/9 saat diulang lokal.                                                                                |
| Firefox lokal                | 22 skenario lulus, termasuk revisi privat, izin, data lintas aplikasi, tata letak pada enam lebar, dan peta. Sapuan rute yang semula memakai batas waktu lokal 60 detik lulus pada rerun dengan batas waktu asli 360 detik. |
| Penyimpanan dan batas        | 14/14 skenario kontrak penyimpanan dan dokumen. 3/3 skenario panduan kuota, satuan desimal, serta ambang peringatan.                                                                                                        |
| WebKit                       | Host lokal tidak memiliki pustaka grafis yang dibutuhkan. Job Connected dan Critical WebKit lulus di CI kandidat audit.                                                                                                     |

Audit kontras regional Chromium mendapati kontrol Next terlihat aktif saat opasitas transisi dari keadaan nonaktif masih berubah. Tes Axe kini memakai reduced motion dan menunggu kontrol tersedia. Pemeriksaan terfokus pada 390 dan 1.440 px tidak menemukan pelanggaran serius. CSS dan animasi aplikasi tidak diubah.

Preview Vercel untuk commit aplikasi `1248f3c` lulus smoke test proyek ke tugas pada simulasi layar sentuh 390 px tanpa overflow atau galat JavaScript. Akses pemeriksaan sementara dicabut. [Preview kandidat](https://evolve-kzt565zlp-jarjirjor777-5316.vercel.app/demo)

Tes Data Quality kini mengikuti aturan yang sudah ada. Anggota aktif boleh membaca, pengguna anonim tetap ditolak, dan perubahan aset serta transisi workspace tetap membutuhkan izin admin. Tidak ada perubahan kode izin.

[CI sebelum koreksi](https://github.com/azhfjr/evolve/actions/runs/45967252592) · [CI kandidat audit](https://github.com/azhfjr/evolve/actions/runs/45971385634) · [CI setelah stabilisasi pemeriksaan kontras](https://github.com/azhfjr/evolve/actions/runs/45972492154)

### Tindak lanjut CI

Run [45972980771](https://github.com/azhfjr/evolve/actions/runs/45972980771) meluluskan 19 dari 21 job. Job utama lulus untuk format, domain, suite browser lengkap, dan audit dependensi produksi. Skenario Saved Views di WebKit juga lulus.

- Job Expansion WebKit menangkap tombol tahap dan tahun di tengah perubahan opasitas. Pemeriksaan Axe kedua tema kini memakai reduced motion. Pemeriksaan terfokus lulus di Firefox.
- Instalasi Chromium pada job Refinement menerima HTTP 403 dari repositori paket runner Ubuntu 26.04. Matriks browser memakai Ubuntu 24.04 agar versi runner konsisten. Langkah instalasi dan cakupan pengujian tetap dijalankan.

Run [46015296981](https://github.com/azhfjr/evolve/actions/runs/46015296981) pada `c1f06c5` lulus **21 dari 21 job**, termasuk Expansion WebKit dan Refinement Chromium. Matriks juga meluluskan Connected, Regional, dan Costs di Chromium, Firefox, dan WebKit serta tiga job pengujian skala. Hasil ini menggunakan fixture dan tidak menggantikan pengujian R2 privat yang masih terbuka di atas.
