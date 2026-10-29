# Peninjauan tahap UI/UX Evolve

17 Oktober 2026, waktu pengguna (Asia/Bangkok). Tahap ini menerapkan dua pilihan pengguna: **tampilan seimbang** dan **editor task sebagai halaman dalam workspace**. Percakapan menggunakan Bahasa Indonesia; antarmuka tetap berbahasa Inggris.

**Revisi terbaru:** pengguna menilai ukuran font dan kolom terlalu besar. Skala kini dipadatkan per jenis halaman; lihat [audit menyeluruh dan revisi proporsi](COMPREHENSIVE_AUDIT_2026_10_17.md). Bukti 26 keadaan dan screenshot `native-review` di bawah mendokumentasikan iterasi awal; bukti revisi proporsi dicatat dalam audit terbaru.

## Perubahan untuk ditinjau

| Area                    | Perilaku baru                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login ponsel            | Kartu Google sign-in muncul sebelum cerita dan ilustrasi. Teks dan bagian penjelas menyesuaikan lebar layar.                                                                                                                                                                                                                                                        |
| Navigasi                | Sidebar mengikuti ukuran layar: sekitar 216 px pada desktop 1.440 px, deretan ikon 72 px pada tablet, dan panel menu pada ponsel. Pengaturan admin kini menjelaskan lebar maksimum sidebar.                                                                                                                                                                         |
| Tipografi               | Teks isi 14 px, label formulir 13 px, dan input 14 px pada desktop/minimal 16 px pada ponsel menggunakan skala bersama. Mode teks besar juga menjangkau komponen di portal, termasuk menu dan dialog.                                                                                                                                                               |
| Editor task             | Editor berada di area utama workspace. Isi dan properti berdampingan pada layar lebar, lalu tersusun vertikal pada layar sempit. Tombol simpan tetap terlihat saat menggulir.                                                                                                                                                                                       |
| Navigasi dan draft task | Pembuatan task memiliki URL yang dapat dimuat ulang dan konteks awal yang tervalidasi. Escape/Back menyimpan draft pembuatan; meninggalkan pengeditan atau komentar yang belum disimpan memerlukan keputusan. Keluar akun juga meminta keputusan sebelum membuang draft.                                                                                            |
| Formulir proyek         | Bagian tujuan, penanggung jawab/jadwal, dan investasi dikelompokkan. Aksi simpan berada di luar area gulir. Draft pembuatan pulih setelah ditutup/dimuat ulang; pengeditan dilindungi konfirmasi.                                                                                                                                                                   |
| Kontrol pilihan         | Satu komponen digunakan pada task, proyek, filter, template, dan pengaturan. Penutupan menu menghormati fokus yang sudah dipindahkan ke kolom berikutnya. Menu memakai warna/permukaan Evolve, pilihan aktif, ikon yang relevan, penempatan sesuai viewport, serta Arrow keys/typeahead/Enter/Escape. Kontrol latar tidak dapat menerima fokus ketika menu terbuka. |
| Overview dan investasi  | Nama Overview dikembalikan dengan dukungan tautan lama. Ringkasan portfolio keuangan dihapus dari Overview/Projects. Investment cost dan ledger tetap berada dalam proyek terkait.                                                                                                                                                                                  |

Draft disimpan per akun dan terpisah antara demo/workspace, hanya di session storage browser, dengan masa pemulihan hingga 24 jam. Draft bukan hasil simpan ke database dan dibersihkan saat keluar akun. Penyimpanan browser yang tidak tersedia tidak boleh menyebabkan perubahan dibuang tanpa keputusan. Pemeriksaan izin, konflik versi, dan retry idempoten di server tetap berlaku.

## Pernyataan penerimaan

1. Pada lebar 320/390 px, tombol Google terlihat dalam viewport setinggi 740 px, dan halaman tidak melebar horizontal.
2. Editor task merupakan region di dalam `main`, dengan navigasi workspace tetap tersedia dan aksi simpan terlihat pada viewport yang diuji.
3. Draft task dapat dimuat ulang bersama konteksnya; browser Back, perpindahan menu, dan Quick find melindungi perubahan pengeditan; keluar akun tidak diam-diam membuang draft.
4. Draft proyek mempertahankan input yang belum lengkap dan identitas permintaan. Formulir tetap memvalidasi data final dan memerlukan keputusan sebelum membuang pengeditan.
5. Pilihan dapat dioperasikan menggunakan keyboard, mengembalikan fokus setelah ditutup, dan tidak menyisakan kontrol yang dapat difokuskan di latar tersembunyi.
6. Skala teks, dark mode, reduced motion, dan tata letak pada desktop/tablet/ponsel diperiksa bersama fungsi simpan, filter, CSV, berkas, Calendar, dan izin yang sudah ada.
7. Overview/Projects tidak menampilkan portfolio budget atau Investment cost global. Data investasi masing-masing proyek tetap dapat dicatat dan dibaca kembali.

## Cakupan tahap berikutnya

Fitur Archive yang lebih lengkap, dependency task/proyek dan grafik hubungan, pengelolaan template task/proyek khusus admin, serta fungsi Overview tambahan belum termasuk penyelesaian tahap ini. Cakupan dan aturan fitur tersebut dibahas setelah pengguna meninjau UI/UX.

Pratinjau menggunakan workspace demo yang terpisah dari data organisasi. Pengujian backend memakai database PostgreSQL sekali pakai. Pemeriksaan Google OAuth nyata, pengiriman reminder pada perangkat, browser/perangkat fisik lain, dan beban produksi tidak dapat disimpulkan dari pratinjau visual ini.

## Bukti dan pemeriksaan

Build produksi lokal berhasil. TypeScript, lint tanpa peringatan, format, dan audit dependency produksi lulus (0 kerentanan). Sebanyak 68 pengujian unit/integrasi PostgreSQL lulus. Pemeriksaan terarah terhadap formulir dan navigasi lulus, termasuk regresi Quick find; pemeriksaan lain mencakup formulir di tiga lebar, menu terbuka, pemulihan draft/keyboard, konfirmasi keluar akun, dan pengembalian fokus. Regresi yang lebih luas dijalankan melalui CI pada pull request peninjauan; status CI dan URL pratinjau dicatat di sana.

Pemeriksaan visual terhadap build lokal mencakup 26 pengamatan pada lebar 1.440, 768, 390, dan 320 px: login, Overview, editor task, menu Priority terbuka, editor proyek, dan editor dark mode pada dua ukuran. Setelah font dan animasi masuk selesai, aturan axe yang dipilih tidak melaporkan pelanggaran, tidak ada pelebaran horizontal, dan tidak ada pageerror pada alur tersebut. Hasil ini berlaku pada keadaan Chromium yang diperiksa, bukan sertifikasi aksesibilitas atau bukti pengiriman Google pada perangkat. [Data pemeriksaan](audit-data/native-ui-review-2026-10-17.json).

Halaman login pada build lokal/pratinjau menampilkan keterangan konfigurasi jika OAuth tidak tersedia di lingkungan itu. Pemeriksaan visual tersebut tidak mengubah konfigurasi Google produksi.

- Login ponsel: [390 px](screenshots/native-review/login-390.png), [320 px](screenshots/native-review/login-320.png).
- Editor task: [desktop](screenshots/native-review/task-1440.png), [tablet](screenshots/native-review/task-768.png), [ponsel](screenshots/native-review/task-390.png), [dark mode](screenshots/native-review/task-dark-1440.png).
- [Menu pilihan Priority](screenshots/native-review/picker-1440.png).
- Formulir proyek: [desktop](screenshots/native-review/project-1440.png), [ponsel](screenshots/native-review/project-390.png).
- Overview: [desktop](screenshots/native-review/overview-1440.png), [tablet](screenshots/native-review/overview-768.png).

Pemeriksaan kompatibilitas tambahan memakai Chromium 156 yang digunakan CI: 20 alur UI lulus, termasuk perpindahan dari pilihan Currency ke nominal, draft dengan nominal kosong, ledger, dan kontras ponsel. Nominal menggunakan input teks desimal dengan validasi domain; permukaan teks tampil dengan kontras penuh sejak awal.
