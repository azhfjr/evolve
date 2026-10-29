# Audit kualitas Evolve dan arah perbaikan

Audit 17 Oktober 2026 (waktu pengguna; pengukuran 16 Oktober UTC) terhadap [situs aktif](https://evolve-rensist.vercel.app). Urutan yang dipilih pengguna: **audit → UI/UX → fitur → pengujian dan rilis**, dengan pilihan pengguna sebelum setiap tahap utama. Percakapan menggunakan Bahasa Indonesia; antarmuka aplikasi tetap berbahasa Inggris.

## Kesimpulan

Fondasi transaksi, akses, dan penyimpanan sudah tersedia. Kesenjangan terbesar ada pada kemudahan penggunaan, proporsi ruang, konsistensi komponen, dan fitur perencanaan yang diminta kembali. Lulus pengujian fungsional belum berarti pengalaman penggunaan sudah memuaskan. Tidak ada skor kualitas buatan atau klaim bebas bug.

Audit ini belum merilis perubahan aplikasi. Draft perbaikan yang sudah ada di cabang kerja masih memerlukan penyelesaian dan peninjauan.

## Dasar pemeriksaan

- Alias produksi dikonfirmasi masih menunjuk `dpl_HZJwavCzgJtCZaq8PPvx8fX525Sh`, aplikasi dari commit `e4079b7ac72a018bb1eab757ee9e360219da4db5`.
- Login, ringkasan, editor task/proyek, dan Archive diperiksa dengan Chromium pada lebar 1.440, 1.024, 768, 390, dan 320 px, dengan tinggi viewport 900 px.
- Sembilan halaman utama diperiksa pada 1.440 dan 390 px: Dashboard, Projects, Inbox, My tasks, All tasks, Archive, People, Activity, dan Settings. Pemeriksaan mencakup reflow dan axe dengan aturan WCAG 2 A/AA, 2.1 AA, dan 2.2 AA; editor task juga dipindai pada kedua ukuran.
- Interaksi menggunakan `/demo` yang menyimpan data sintetis di browser. Pemeriksaan HTTP produksi hanya membaca health/API atau mengirim permintaan tanpa sesi dengan origin tidak valid. Tidak ada akun, sesi, task, proyek, atau biaya contoh yang dibuat di database organisasi.
- Kode layanan, validasi, skema, izin, formulir, query, dan pengujian rilis sebelumnya ikut ditinjau. Temuan kode dibandingkan dengan perilaku browser bila dapat diamati melalui demo.
- [Data pengukuran](audit-data/native-ux-2026-10-16.json) menyimpan cakupan dan hasil yang dapat diperiksa kembali.

## Temuan prioritas

P1 berarti menghambat penggunaan utama atau tidak memenuhi kebutuhan yang dinyatakan pengguna. P2 berarti mengurangi kejelasan, efisiensi, atau kelengkapan. Temuan berikut tidak semuanya merupakan kerusakan fungsi.

| Prioritas | Area                    | Bukti dan dampak                                                                                                                                                                                     | Arah perbaikan                                                                                                                                                               |
| --------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1        | Login ponsel            | Pada lebar 390 px, tombol Google dimulai pada y=914 px; pada 320 px, y=1.117 px. Meta viewport sudah benar dan halaman tidak melebar, tetapi cerita, kutipan, dan ilustrasi mendahului akses masuk.  | Tampilkan identitas singkat dan kartu login lebih dahulu pada ponsel. Letakkan konten penjelas setelahnya.                                                                   |
| P1        | Proporsi navigasi       | Sidebar 296 px pada layar 1.024 px menyisakan 728 px. Pada 768 px, sidebar 250 px menyisakan 518 px, atau 67,4% layar, untuk konten.                                                                 | Sidebar desktop lebih ringkas; navigasi tablet dapat menyusut; ponsel memakai panel navigasi yang dibuka sesuai kebutuhan.                                                   |
| P1        | Keterbacaan             | Deskripsi halaman 12 px di desktop dan 11 px di ponsel; label metrik 11/10 px; kontrol editor task 14 px di desktop/tablet.                                                                          | Tetapkan satu skala tipografi, hierarki heading, dan ukuran kontrol; verifikasi juga mode teks besar dan zoom.                                                               |
| P1        | Editor task             | Dialog desktop 920 px, dengan area menulis dan properti yang panjang. Beberapa pengaturan memerlukan gulir meski layar cukup lebar. Footer simpan sudah terlihat pada ukuran yang diuji.             | Pilih bentuk editor bersama pengguna; kelompokkan informasi utama, penugasan/jadwal, dan pengaturan tambahan; pertahankan aksi simpan yang terlihat.                         |
| P1        | Kehilangan draft proyek | Isi nama proyek hilang setelah formulir ditutup dan dibuka lagi, pada desktop dan ponsel. Penutupan tidak menawarkan keputusan mempertahankan perubahan.                                             | Pemulihan draft pembuatan proyek dan konfirmasi sebelum membuang perubahan pengeditan, mengikuti kemampuan yang sudah dimiliki editor task.                                  |
| P1        | Template                | Template task bisa disimpan dan diterapkan, tetapi anggota biasa juga dapat membuatnya. Tidak ada pengeditan template di tempat atau template proyek.                                                | Pengelolaan template task/proyek oleh admin, penerapan oleh anggota, dan pemeriksaan izin di server. Tetapkan cakupan template pada tahap fitur.                             |
| P1        | Dependency              | API saat ini menolak dependency baru; hubungan lama tetap disimpan tetapi tidak menghambat penyelesaian. Tidak ada dependency proyek atau visualisasi hubungan.                                      | Rancang ulang model relasi dan pencegahan siklus, aturan penyelesaian, serta grafik/daftar hubungan setelah pilihan tahap fitur.                                             |
| P1        | Penempatan biaya        | Produksi masih menampilkan IDR portfolio dan ringkasan biaya di luar detail proyek. Ini tidak sesuai arahan pengguna terbaru.                                                                        | Hapus ringkasan keuangan global; tampilkan **Investment cost** hanya di proyek terkait, dengan mata uang aslinya.                                                            |
| P2        | Archive                 | Pencarian, filter, restore, Undo, dan bulk edit task sudah tersedia. Belum ada arsip proyek, tanggal/pelaku pengarsipan khusus, atau tampilan pengelolaan arsip yang berbeda dari daftar task biasa. | Perjelas keadaan kosong, tindakan pemulihan, dan konteks arsip. Putuskan cakupan proyek dan metadata pada tahap fitur. Jangan menyebut waktu edit sebagai waktu pengarsipan. |
| P2        | Overview                | Ringkasan saat ini bernama Dashboard dan sudah memiliki metrik, tren, distribusi status, beban kerja, tenggat, dan project pulse. Banyak panel membuat halaman panjang pada tablet.                  | Kembalikan nama **Overview**, utamakan tindakan dan informasi yang perlu perhatian; pertahankan tautan lama. Grafik hubungan baru mengikuti fitur dependency.                |
| P2        | Kontrol dan formulir    | Project, assignee, status, priority, dan beberapa pengaturan memakai select HTML standar; form proyek dan Settings memiliki hierarki dan ukuran teks berbeda.                                        | Komponen pilihan yang seragam dengan identitas Evolve; pencarian untuk daftar panjang, navigasi keyboard, label, dan posisi menu yang sesuai viewport.                       |
| P2        | Pekerjaan massal        | Bulk edit memakai dialog dengan daftar pemilihan ulang dan maksimal 100 task pertama dari tampilan. Impor CSV memiliki pratinjau dan validasi, tetapi bukan impor tanpa batas.                       | Perjelas batas dan cakupan seleksi; pertimbangkan toolbar seleksi langsung pada daftar sesuai keputusan tahap fitur.                                                         |

## Fitur yang sudah tersedia dan perlu dipertahankan

| Kelompok                  | Kemampuan saat ini                                                                                                                     | Catatan kualitas                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task                      | List, board, calendar; pemilik, prioritas, deadline dan zona waktu, checklist, label, komentar, pengulangan, draft task, keyboard save | Perombakan visual harus mempertahankan pemulihan draft, penanganan kegagalan simpan, dan konflik versi. Subtask tidak diaktifkan kembali otomatis hanya karena dependency diminta.    |
| Pencarian dan pengelolaan | Query/filter/sort di database, saved views pribadi, ekspor CSV snapshot, impor dengan pratinjau, bulk edit atomik                      | Hasil tidak terbatas pada 500 task bootstrap. Bulk/impor dibatasi 100 task per perintah; batas harus jelas di UI.                                                                     |
| Proyek dan investasi      | Tujuan, referensi, lokasi, pemilik, status, jadwal, mata uang, budget, ledger, void/restore                                            | Izin admin, aritmetika desimal, kunci mata uang setelah ledger pertama, serta retry idempoten perlu dipertahankan saat istilah/tampilan berubah.                                      |
| Kolaborasi                | Inbox, activity dengan filter/pagination, komentar, notifikasi dalam aplikasi, pembaruan melalui SSE                                   | Bukan editor teks bersama atau presence. Inbox memuat 100 notifikasi terbaru; diskusi memuat hingga 500 komentar.                                                                     |
| Berkas                    | Lampiran task/proyek dan gambar profil/workspace privat, preview/download berizin                                                      | Validasi tipe/signature bukan pemindaian malware. Batas dokumen 25 MB dan kuota workspace 1 GB.                                                                                       |
| Akun dan administrasi     | Google login invite-only, satu admin, profil, pengaturan tampilan/zona waktu, kelola anggota dan sesi                                  | Template admin-only adalah perubahan kebijakan yang masih harus diterapkan di server.                                                                                                 |
| Calendar                  | Sinkronisasi satu arah per akun, pilihan task, reminder Google, retry dan antrean tahan gangguan                                       | Pengguna sudah mengonfirmasi API aktif dan akun terhubung. Bukti rilis sebelumnya menunjukkan event tersinkron dan antrean selesai; notifikasi pada perangkat belum diamati langsung. |

## Hasil pemeriksaan dan batasnya

- Health produksi `200`: database terhubung, skema current, autentikasi configured.
- Enam endpoint privat yang diperiksa mengembalikan `401` tanpa sesi dan `private, no-store`. Mutasi dari origin asing ditolak `403`.
- Tidak ditemukan pelebaran horizontal pada sembilan halaman di dua viewport yang dipindai, maupun login/editor task pada lima lebar yang diukur. Tidak ada `pageerror` selama alur audit tersebut.
- Pemindaian otomatis pada 18 keadaan halaman dan dua keadaan editor task tidak melaporkan pelanggaran pada aturan yang dipilih. Temuan font kecil, urutan konten, dan pemulihan draft tetap ada: hasil axe bukan penilaian keseluruhan UX atau sertifikasi aksesibilitas.
- Bukti rilis sebelumnya mencatat 65 pengujian unit/integrasi PostgreSQL dan 53 pengujian browser lulus. Ini adalah bukti versi produksi, bukan pengujian lengkap ulang terhadap rancangan mendatang.
- Pada audit awal, pengujian draft sebelum pilihan UI/UX menghasilkan 54 lulus dan 4 gagal dari 58. Kegagalan mencakup font kontrol desktop/tablet dan mode teks besar, serta ukuran target tombol penutup toast di ponsel. Draft awal tersebut belum siap dirilis. Pemeriksaan implementasi setelah pilihan pengguna dicatat dalam [peninjauan UI/UX](NATIVE_UI_REVIEW.md).
- Audit ini tidak mengukur beban pengguna bersamaan, Core Web Vitals lapangan, Safari/Firefox/perangkat fisik, pembaca layar, pemulihan backup, atau alarm operasional. Kunci transaksi workspace membantu konsistensi, tetapi batas throughput di produksi belum dibuktikan dengan load test.
- README dan beberapa dokumen lama masih menyebut bilingual, dependency/subtask aktif, lima migrasi, dan consent Calendar belum dilakukan. Dokumentasi perlu diselaraskan pada rilis berikutnya; kondisi terkini juga dijelaskan di `POWER_PLANNING.md`.

## Usulan tahap UI/UX untuk dipilih

Usulan dasar menggunakan identitas Evolve saat ini: aksen hijau, permukaan netral, Inter untuk teks aplikasi, jarak dan radius yang konsisten. Teks isi 15–16 px, input minimal 16 px, label formulir 14 px, dan kontrol sentuh utama minimal 44 px. Sidebar desktop sekitar 232–248 px dengan mode ringkas; tablet mendapat navigasi ringkas; konten ponsel memakai lebar penuh. Pengaturan teks besar, dark mode, keyboard, dan reduced motion tetap didukung.

Login ponsel mendahulukan Google sign-in. Overview, Projects, task, Archive, People, Activity, dan Settings memakai komponen dan skala teks yang sama. Biaya hanya ditampilkan dalam detail proyek sebagai Investment cost. Seluruh bentuk editor tetap menyediakan aksi simpan yang terlihat dan perlindungan draft.

Pilihan pengguna untuk tahap ini: **tampilan seimbang** dan **editor task sebagai halaman dalam workspace**. Implementasi sedang berjalan; belum dirilis. Dua pilihan yang diajukan adalah:

1. **Kepadatan tampilan:** seimbang untuk penggunaan harian (disarankan), padat untuk lebih banyak baris, atau lapang untuk lebih banyak ruang visual.
2. **Bentuk editor task:** halaman di dalam workspace dengan area isi/properti dan navigasi kembali (disarankan untuk permintaan editor mengikuti halaman), panel lebar di tengah, atau drawer dari kanan.

Pilihan Archive, cakupan dependency/aturan penyelesaian, dan kemampuan template dibahas pada tahap fitur setelah rancangan UI/UX ditinjau. Rilis dilakukan setelah pemeriksaan fungsi, izin, migrasi bila diperlukan, dan tampilan yang disetujui lulus.

## Bukti tampilan produksi

- [Login ponsel 390 px](screenshots/native-audit/login-390.png)
- [Editor task desktop](screenshots/native-audit/task-1440.png)
- [Editor proyek desktop](screenshots/native-audit/project-1440.png)
- [Ringkasan pada tablet 768 px](screenshots/native-audit/overview-768.png)
- [Archive dengan task sintetis](screenshots/native-audit/archive-populated-1440.png)
