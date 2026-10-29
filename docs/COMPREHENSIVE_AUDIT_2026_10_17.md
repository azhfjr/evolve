# Audit menyeluruh dan revisi proporsi Evolve

**Status terbaru (18 Oktober 2026):** revisi proporsi popup telah dirilis ke produksi dari sumber `c3f8bb0611cd52842214794be5458fa74586ba30`. Tindak lanjut audit dan implementasi hapus task/project, termasuk perlindungan lampiran serta antrean penghapusan Calendar, dicatat di [review penghapusan](ENTITY_DELETION_REVIEW.md). Fitur penghapusan dan migrasi 0011 merupakan perubahan baru yang menunggu tinjauan/rilis tersendiri; bagian di bawah adalah riwayat audit, bukan status rilis terbaru.

**Tahap terbaru:** attachment saat membuat task, Cost multi-item/mata uang, serta koreksi lanjutan Activity/Settings dicatat di [audit dan bukti penerimaan terbaru](TASK_COSTS_REVIEW.md). Data dan angka di bagian berikut merupakan riwayat iterasi sebelumnya.

**Pembaruan setelah tinjauan pengguna:** revisi lanjutan Settings/sidebar, Cost dengan pemisah ribuan, label proyek dan Connection kini diimplementasikan pada draft PR #4. Lihat [bukti dan batas rilis terbaru](CONNECTIONS_REVIEW.md). Audit di bawah merekam baseline sebelumnya; grafik Connection baru menunjukkan label bersama, sedangkan dependency pemblokiran dan template admin tetap merupakan pekerjaan terpisah.

17 Oktober 2026 · Asia/Bangkok. Audit membedakan **produksi yang sedang aktif**, **implementasi UI pada draft PR #4**, dan **fitur yang masih direncanakan**. Revisi ini mengikuti permintaan terbaru: ukuran font dan kolom lebih kecil serta proporsional terhadap fungsi masing-masing halaman. Editor task tetap berupa halaman dalam workspace; percakapan Bahasa Indonesia dan antarmuka berbahasa Inggris.

## Kesimpulan

Alur kerja inti sudah memiliki penyimpanan PostgreSQL, pemeriksaan izin, perlindungan konflik versi, draft, dan pengujian integrasi. Namun, Evolve **belum memenuhi seluruh cakupan produk yang diminta**. UI sebelumnya terlalu lapang untuk pekerjaan harian; dependency dan pengelolaan template admin merupakan kekurangan fungsi yang nyata. Keberhasilan tes tidak menghapus kekurangan tersebut atau membuktikan aplikasi bebas bug.

## Cakupan pemeriksaan

- Sembilan halaman workspace: Overview, Projects, Inbox, My tasks, All tasks, Archive, People, Activity, Settings; juga login, editor task/proyek, serta tab Appearance, Google Calendar, dan Workspace.
- Baseline tampilan: 90 keadaan halaman pada lebar 1440, 1280, 1024, 768, 390, dan 320 px, tinggi viewport 900 px, dengan data sintetis demo yang terpisah dari organisasi. Font dan animasi terbatas ditunggu sebelum pengukuran.
- Penelusuran sumber: komponen formulir dan navigasi, API privat, autentikasi, otorisasi, validasi, transaksi, pagination, lampiran, Calendar, konfigurasi deployment, serta dokumen status.
- Smoke produksi tanpa perubahan data: health, tujuh endpoint privat tanpa sesi aplikasi, dan penolakan mutasi dengan origin asing. Pengujian fungsi yang memerlukan penulisan memakai database lokal disposable.

## Temuan dan keputusan

| Prioritas | Temuan terverifikasi                                                                                                                                              | Dampak dan penanganan                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1        | Skala visual terlalu besar: judul halaman 32 px, baris task 72 px, properti task 320 px, dialog proyek 940 px.                                                    | Direvisi pada tahap UI ini: teks isi 14 px; judul 26 px desktop/24 px ponsel; baris desktop sekitar 56 px; properti 280 px; dialog proyek maksimal 800 px. Ukuran teks besar tetap tersedia.                                                  |
| P1        | Form Settings membungkus banyak field dalam kartu tambahan dengan padding; checkbox Reduce interface motion mewarisi layout kolom sehingga terpisah dari teks.    | Hilangkan pembungkus dekoratif per field, rapatkan section, dan kembalikan checkbox/label ke satu baris. Label dan helper tetap terlihat.                                                                                                     |
| P1        | Kalender memakai opacity 0,6 untuk tanggal bulan lain serta warna penanda hari ini yang tidak cukup kontras (rasio terukur 3,71 dan 3,21; batas teks normal 4,5). | Ditemukan lewat audit state kalender di luar cakupan axe suite sebelumnya. Opacity teks dihapus; penanda memakai warna tema dengan foreground yang sesuai. Pengujian alur board/calendar kini menyertakan pemeriksaan aksesibilitas kalender. |
| P1        | Dependency baru ditolak oleh schema `dependencies.max(0)`; belum ada dependency proyek/grafik. Relasi lama dipertahankan sebagai data historis.                   | Masih terbuka untuk tahap fitur. Perlu pilihan cakupan relasi, pencegahan siklus, dan aturan penyelesaian. Subtask tidak diaktifkan kembali secara otomatis.                                                                                  |
| P1        | Anggota dapat menyimpan template task; hanya pembuat/admin dapat mengarsipkan. Tidak tersedia edit template maupun template proyek.                               | Belum memenuhi kebijakan template yang dikelola admin. Tahap fitur perlu mencakup pemeriksaan server, bukan hanya menyembunyikan tombol.                                                                                                      |
| P2        | Kartu proyek 318 px dan banner Overview 217 px pada baseline desktop; panel ringkasan serta formulir panjang.                                                     | Padatkan secara kontekstual. Grid proyek menyesuaikan ruang yang tersedia; formulir Settings memiliki batas lebar sendiri; daftar task tetap memakai area kerja luas.                                                                         |
| P2        | Archive sudah memiliki search/filter/restore/Undo/ekspor dan bulk edit, tetapi belum ada arsip proyek atau kolom waktu/pelaku pengarsipan.                        | Kekurangan pengelolaan arsip tetap terbuka. Jangan mengisi tanggal arsip lama dari `updatedAt`, karena artinya berbeda.                                                                                                                       |
| P2        | Bulk edit menawarkan 100 task pertama dari tampilan; CSV maksimal 100 task dan 500 KB per impor.                                                                  | Batas operasional, bukan pengelolaan tanpa batas. UI sudah menyebut batas. Toolbar seleksi lintas halaman dapat dibahas pada tahap fitur.                                                                                                     |
| P2        | Picker mendukung keyboard/typeahead dan scroll, tetapi tidak memiliki pencarian teks khusus untuk daftar panjang.                                                 | Masih dapat digunakan; pencarian assignee/proyek perlu dipertimbangkan jika daftar organisasi tumbuh.                                                                                                                                         |
| P2        | Seluruh command workspace memakai satu advisory transaction lock; pool koneksi tiap proses maksimal lima.                                                         | Menjaga konsistensi untuk organisasi kecil, tetapi kapasitas penulisan bersamaan belum dibuktikan. Jangan menyatakan throughput tinggi tanpa load test.                                                                                       |
| P2        | Koneksi Git Vercel belum aktif; rilis memakai snapshot sumber melalui API.                                                                                        | Push tidak otomatis mengubah produksi. SHA sumber, digest, status deployment, dan alias harus diverifikasi pada setiap rilis.                                                                                                                 |
| P2        | README masih menyebut bilingual, subtask/dependency aktif, lima migrasi, dan consent Calendar belum selesai.                                                      | Diselaraskan dengan keadaan yang terbukti: UI English-only, tujuh migrasi produksi, Calendar sudah dikonfirmasi terhubung; fitur UI baru masih berada di preview.                                                                             |

## Penilaian setiap area

| Area                      | Yang sudah tersedia                                                                                                    | Hasil audit / batas praktis                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login dan akses           | Google-only, email terverifikasi, invite-only, admin berasal dari email konfigurasi.                                   | Produksi auth configured; endpoint privat menolak pengguna tanpa sesi. Login ponsel mendahulukan akses Google pada draft UI. Tes lokal tidak menggantikan Google consent nyata yang sudah dikonfirmasi pengguna. |
| Navigasi                  | Sidebar, rail tablet, drawer ponsel, quick find, URL/history, guard perubahan.                                         | Sidebar diperkecil dengan teks tetap terbaca; nama panjang dibatasi di dalam area kontrol. Guard dan pemulihan draft harus tetap lulus setelah revisi.                                                           |
| Overview                  | Metrik, tren, distribusi status, beban kerja, tenggat dan project pulse.                                               | Font dan kartu diringkas; biaya global telah dihapus pada draft UI. Fungsi tambahan yang dapat ditindaklanjuti masih menunggu tahap fitur.                                                                       |
| Daftar task               | List, board, calendar, filter/sort/query database, saved views, snapshot CSV export.                                   | Baris/kolom desktop dirapatkan; ponsel tetap memakai kartu. Tabel/board dapat bergulir di area internal; halaman tidak boleh melebar. Pengujian 1.000 task menilai pagination, bukan kapasitas beban produksi.   |
| Pembuatan/pengeditan task | Halaman workspace, draft, context defaults, checklist/label, pengulangan, komentar, lampiran, retry dan konflik versi. | Area menulis dan properti lebih proporsional; judul task 20 px; aksi simpan sticky tetap dipertahankan. Pemeriksaan keyboard, kegagalan simpan, dan perpindahan tugas diperlukan.                                |
| Proyek dan investasi      | Pemilik, tujuan, jadwal, status, mata uang, budget dan ledger investasi berizin.                                       | Grid dan modal lebih ringkas. Biaya tetap hanya pada detail proyek. Aritmetika minor-unit, idempotensi, serta mata uang terkunci setelah ledger pertama dipertahankan.                                           |
| Archive                   | Task archive/restore, pencarian global, Undo dan konteks task dipertahankan.                                           | Bukan halaman tanpa fungsi. Pengelolaan proyek dan metadata arsip masih kurang.                                                                                                                                  |
| People/admin              | Undangan per email, revokasi akses/sesi, profil, proteksi admin tunggal.                                               | Operasi administrasi diperiksa di server. Seluruh anggota memiliki akses pada pekerjaan workspace bersama; produk ini satu organisasi, bukan multi-tenant dengan izin proyek privat.                             |
| Inbox/activity            | Notifikasi in-app, status baca, activity filter/cursor, perubahan via SSE dan PostgreSQL notifications.                | Inbox memuat 100 notifikasi terbaru; bootstrap activity 100, diskusi hingga 500 komentar. SSE merupakan distribusi pembaruan, bukan kolaborasi teks bersama.                                                     |
| Settings                  | Profil, tampilan, teks besar, kepadatan, sidebar, zona waktu, pengaturan workspace, Calendar.                          | Form lebih ringkas dan checkbox diperbaiki. Pengaturan admin tetap dibatasi di server.                                                                                                                           |
| Lampiran                  | Penyimpanan privat, validasi tipe/signature, preview/download berizin, penghapusan owner/admin.                        | Dokumen maksimal 25 MB; kuota workspace 1 GB. Validasi header bukan pemindaian malware.                                                                                                                          |
| Google Calendar           | Sinkronisasi satu arah per akun, scope assigned/all, reminder, token terenkripsi dan antrean retry.                    | API aktif dan akun terhubung menurut pengguna; bukti rilis terdahulu mencatat event tersinkron. Pengiriman notifikasi pada perangkat belum diamati pada audit ini.                                               |

## Proporsi yang diterapkan

| Peran                     | Desktop/tablet                               | Ponsel                                                         |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Teks isi / label / helper | 14 / 13 / 12 px                              | 14 / 13 / 12 px                                                |
| Input dan picker          | 14 px                                        | Minimal 16 px untuk mencegah focus zoom                        |
| Judul halaman             | 26 px                                        | 24 px                                                          |
| Judul section/kartu       | 16–21 px sesuai hierarki                     | Menyesuaikan hierarki yang sama                                |
| Kontrol utama             | Sekitar 38–40 px                             | Minimal 44 px; pointer coarse juga mendapat target lebih besar |
| Sidebar                   | `clamp(208px, 15vw, configuredMaximum)`      | Drawer; tablet memakai rail 72 px                              |
| Editor task               | Maksimal 1120 px, properti 280 px, gap 18 px | Satu kolom, input dan aksi tetap terjangkau                    |
| Settings                  | Maksimal 1120 px, navigasi 172 px            | Tab horizontal dan formulir satu kolom                         |
| Grid proyek/people        | Kolom otomatis dengan minimum 250 px         | Satu kolom sesuai ruang yang tersedia                          |

Skala Large tetap menaikkan body ke 17 px dan input ke 18 px. Ukuran tidak diperkecil memakai `zoom` atau `transform: scale`, sehingga area klik dan pengaturan aksesibilitas tetap bermakna.

## Perbandingan terukur dan bukti revisi

Pengukuran berikut memakai demo yang sama pada desktop 1440 × 900 px. Tinggi dapat bertambah sesuai panjang konten.

| Elemen                       | Sebelum                      | Revisi                       |
| ---------------------------- | ---------------------------- | ---------------------------- |
| Sidebar                      | 240 px                       | 216 px                       |
| Judul halaman                | 32 px                        | 26 px                        |
| Baris task                   | 72 px                        | 56 px                        |
| Kolom properti task          | 320 px                       | 280 px                       |
| Tinggi kartu metrik Overview | 179 px                       | 123 px                       |
| Tinggi banner Overview       | 217 px                       | 164 px                       |
| Kolom kartu proyek           | 3                            | 4 sesuai ruang yang tersedia |
| Lebar maksimum Settings      | Mengikuti area kerja 1200 px | 1120 px, navigasi 172 px     |

Pemeriksaan build lokal setelah revisi mencakup **110 keadaan halaman** pada enam lebar layar. Selain baseline, cakupannya meliputi board, calendar, filter, bulk edit, impor CSV, quick find, detail proyek, task yang sudah ada, arsip berisi data, dan editor dark mode pada desktop/ponsel. Tidak ditemukan pelebaran horizontal halaman, `pageerror`, atau pelanggaran pada aturan axe yang dipilih. [Data sebelum dan sesudah](audit-data/proportions-2026-10-17.json).

Validasi fungsi: **68 unit/integrasi PostgreSQL dan 66 tes browser lulus**. Alur yang diperiksa mencakup izin admin/anggota/outsider, CSRF, simpan dan reload, draft dan keputusan membuang perubahan, konflik/retry, komentar, private uploads, impor/bulk, ledger, Calendar contract, navigasi keyboard/history, serta pagination/search/export 1.000 task. Setelah temuan kalender diperbaiki, alur board/calendar diperiksa lagi dengan axe pada mode terang dan gelap. Build, TypeScript, lint tanpa peringatan, formatting, dan audit dependency juga diperiksa; CI final tercatat pada [draft PR #4](https://github.com/azhfjr/evolve/pull/4).

Smoke 1.000 task pada lingkungan lokal disposable mencatat API 42 ms, render 668 ms, dan payload awal 266.548 byte untuk 500 task. Angka ini satu observasi pada mesin pengujian, bukan benchmark produksi atau SLA.

Bukti gambar revisi:

- [Overview desktop](screenshots/proportions/overview-1440.png), [Projects desktop](screenshots/proportions/projects-1440.png), [Settings desktop](screenshots/proportions/settings-1440.png).
- Editor task: [desktop](screenshots/proportions/task-editor-1440.png), [tablet](screenshots/proportions/task-editor-768.png), [ponsel](screenshots/proportions/task-editor-390.png).
- Formulir proyek: [desktop](screenshots/proportions/project-editor-1440.png), [ponsel](screenshots/proportions/project-editor-390.png).
- [Calendar desktop](screenshots/proportions/calendar-1440.png), [Activity ponsel](screenshots/proportions/activity-390.png).

## Bukti pemeriksaan produksi

Pada 17 Oktober 2026: `/api/health` mengembalikan `200`, database connected, schema current, authentication configured. Tujuh GET privat (`workspace`, `tasks`, `projects/:id/costs`, `activity`, `dashboard`, `administration`, `calendar`) mengembalikan `401` dengan `private, no-store`. POST workspace dari origin asing mengembalikan `403`.

Audit dependency produksi (`npm audit --omit=dev`) melaporkan **0 kerentanan yang diketahui** pada saat pemeriksaan. Ini bukan audit penetrasi atau jaminan tidak ada kerentanan.

## Batas audit dan urutan berikutnya

Audit ini tidak membuktikan kapasitas pengguna bersamaan, Core Web Vitals lapangan, pemulihan backup, alarm operasional, Safari/Firefox, perangkat fisik atau penggunaan pembaca layar. Pemeriksaan axe hanya meliputi aturan yang dipilih; baseline 90 keadaan tanpa pelanggaran tidak menghapus persoalan proporsi dan kegunaan yang dilaporkan pengguna.

Urutan tetap: **tinjau revisi UI → sepakati cakupan fitur → implementasi fitur → pengujian dan rilis**. Preview demo terpisah dari data organisasi. Revisi UI ini tidak mengubah skema, izin, kredensial, atau alias produksi.
