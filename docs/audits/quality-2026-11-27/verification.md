# Audit kualitas Evolve · 27 November 2026

Audit dimulai dari sumber aplikasi produksi `2046c10`. Vercel mengonfirmasi alias produksi mengarah ke deployment `dpl_9RoGY5F9PRsGffUw7GyQk4qH6BwS`. Perubahan dikerjakan dalam worktree terpisah. Seluruh pengujian yang menulis data memakai PostgreSQL 17 dan penyimpanan file lokal sekali pakai.

| Temuan                                                                                                               | Dampak                                                                                             | Perbaikan                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Batang grafik kapasitas punya tinggi minimum meski kapasitas nol                                                     | Grafik menampilkan nilai nol seperti pengukuran positif                                            | Tinggi batang mengikuti data. Tabel mempertahankan nilai nol, tahun COD, unit, jumlah catatan, dan tombol untuk menelusuri hasil.           |
| Tabel tahap memakai nama yang bisa berulang sebagai identitas baris                                                  | Nama yang sah dapat menyebabkan kunci React duplikat dan tombol ambigu                             | Nomor tahap menentukan identitas dan membedakan label tombol yang bisa dipilih dengan keyboard.                                             |
| Judul Board Room dan aksi bersaing untuk ruang pada ponsel. Tombol strip tahap dan tahun tersebar di beberapa baris. | Judul dan deskripsi terpecah sempit, sementara pengguna menggulir lebih jauh sebelum mencapai data | Aksi berada di bawah judul pada ponsel. Kontrol navigasi bersebelahan dengan tinggi sentuh 44 px. Tabel ringkasan membungkus label panjang. |
| ZIP memotong ekstensi nama panjang dan dapat menghasilkan komponen jalur Unicode yang terlalu besar untuk ekstraksi  | Nama hasil unduh kehilangan tipe file, atau sebagian entri gagal diekstrak                         | Batasi komponen berdasarkan panjang UTF-8, pertahankan ekstensi, dan potong di batas karakter.                                              |
| Dialog ZIP menampilkan galat dua kali dan tidak punya aksi menyegarkan manifest setelah file dihapus                 | Pengguna menerima pengumuman ganda dan tombol coba ulang terus memakai daftar kedaluwarsa          | Tampilkan satu peringatan dan sediakan aksi menyegarkan daftar dari dialog.                                                                 |
| Demo menampilkan kontrol aktif sebelum kode browser siap                                                             | Ketukan pertama dapat hilang pada jaringan lambat                                                  | Kontrol menunggu pemulihan state lokal sebelum bisa ditekan. Regresi menahan JavaScript dan memastikan aksi bekerja setelah pemuatan.       |
| Pemindaian dependensi produksi menandai advisory moderat Next.js 16.4.1                                              | Versi runtime masuk rentang advisory yang dipublikasikan                                           | Pin Next.js ke 16.4.6. Pemindaian ulang dependensi produksi melaporkan nol temuan.                                                          |

Pemeriksaan produksi bersifat baca saja. Health, Board Room, Locker Room, Workspace, dan demo merespons HTTP 200. API privat Board Room dan Workspace merespons HTTP 401 tanpa sesi. Pengukuran waktu dari satu rangkaian HTTP hanya menunjukkan kondisi saat pemeriksaan dan tidak dipakai sebagai tolok ukur produksi.

## Hasil pengujian

- Perbaikan kesiapan demo lulus 4/4 pada build terakhir, termasuk regresi koneksi lambat, penyimpanan lokal tanpa mutasi API privat, font besar, dan kontras kedua tema.
- Build mode produksi dengan Next.js 16.4.6 berhasil, termasuk pemeriksaan TypeScript. Lint, format, dan pemeriksaan diff lulus. Pemindaian dependensi produksi melaporkan nol kerentanan.
- Suite domain dan integrasi lulus 352/352. Enam regresi grafik dan ZIP lulus pada rerun setelah perubahan terakhir di komponen tersebut.
- Suite Chromium untuk dokumen, pengelolaan file, dialog, dan Locker Room lulus 38/38. Cakupan mencakup pembuatan dan penyuntingan tugas, komentar, kalender, pencarian, ekspor, arsip dan pemulihan, navigasi seluler, isi ZIP, pembatalan transfer, percobaan ulang, penghapusan, dan privasi.
- Pemeriksaan Locker Room dengan 1.000 tugas menyelesaikan pagination, pencarian, dan ekspor. Sampel lokal mencatat 160 ms untuk API halaman awal dan 1.484 ms untuk metrik render tes. Ini satu sampel fixture lokal, bukan hasil p95 produksi.
- Suite Board Room dan koneksi lulus 24/25 pada putaran awal. Kasus izin yang tersisa menggunakan ekspektasi lama untuk Data Quality. Tes kini memeriksa bahwa anggota dapat membaca dengan header no-store, pengguna tanpa sesi ditolak, dan transisi serta perubahan aset tetap dibatasi. Aplikasi tidak mengubah izin. Pengujian ulang batas akses lulus 1/1 pada build aplikasi yang sama.
- Firefox lulus 5/5 untuk pemilihan tahap mobile, kontras demo, pembuatan tugas lintas aplikasi, revisi dokumen privat, dan koneksi ulang realtime.
- Pemeriksaan Chromium mencakup enam lebar dari 320 hingga 1.920 px, dua tema, font besar, reduced motion dan keyboard. Dialog juga diuji pada posisi lanskap 568 × 320. Peta Kalimantan menampilkan lima poligon nyata, merekonsiliasi jumlah, mendukung filter keyboard, serta menjaga hasil ekspor sesuai filter. Tidak ada perubahan data peta.

## Batas verifikasi

WebKit terblokir saat peluncuran karena pustaka sistem belum tersedia. Pengujian seluler memakai simulasi browser, tanpa iPhone atau Android fisik. OAuth diuji hingga inisiasi, tanpa persetujuan akun Google sungguhan. Tidak semua rangkaian browser repositori dijalankan dalam sesi ini. Akses log runtime produksi ditolak oleh Vercel dengan HTTP 403. Alur yang menulis atau menghapus data diuji dengan fixture lokal, sedangkan pemeriksaan produksi dibatasi pada pembacaan.

## Preview dan serah terima

Preview Vercel `dpl_H4LRSiPFwq9QSxeqNsxHjMCP6RD8` dibuat dari commit aplikasi `da69371`. Demo terverifikasi pada simulasi layar sentuh 390 × 844. Proyek terbuka dan tugas tindak lanjut dibuat di browser tanpa overflow atau galat runtime pada alur tersebut. Akses verifikasi sementara dicabut. Preview meminta login Vercel.

Regresi kesiapan demo dan kontras juga lulus 2/2 saat diuji ulang di Firefox pada build terakhir. [GitHub CI untuk build aplikasi](https://github.com/azhfjr/evolve/actions/runs/45962947709) menjalankan matriks lengkap secara terpisah. Perubahan belum dipromosikan ke produksi.

[Draft PR](https://github.com/azhfjr/evolve/pull/1) · [Preview demo](https://evolve-37erd8kpp-jarjirjor777-5316.vercel.app/demo)
