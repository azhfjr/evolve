# Settings, Cost, dan Connection — bukti peninjauan

**Riwayat iterasi:** perilaku Cost dan rencana rollback di dokumen ini digantikan oleh [review task attachments dan multi-item Cost](TASK_COSTS_REVIEW.md). Rilis yang mendukung draft privat dan beberapa mata uang harus mempertahankan pemeriksaan izin draft serta perhitungan per mata uang saat rollback.

17 Oktober 2026 · Asia/Bangkok. Implementasi lanjutan pada draft PR #4, setelah pengguna menyetujui arah visual dan meminta penyempurnaan Settings/sidebar, format Cost, label proyek serta Connection. Format yang dipilih: **`1,250,000.50`**. Percakapan Bahasa Indonesia; antarmuka tetap English.

## Perilaku yang diimplementasikan

| Kebutuhan                   | Implementasi / jalur utama                                                                                                                        | Bukti penerimaan lokal                                                                                                                                                             | Status       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Settings lebih proporsional | `connection-workspace.css`: area maksimum 1020 px, navigasi 156 px, judul detail 20/18 px, padding 20/16 px, section Workspace dipisahkan divider | Empat tab diperiksa di enam lebar; persistensi profil, branding dan pembatasan admin diperiksa tes browser PostgreSQL                                                              | Teruji lokal |
| Sidebar native              | `sidebar-navigation.tsx`: scrollbar bertema, fade tepi, tombol naik/turun, active item tetap terlihat, scroll terisolasi                          | Viewport pendek 1440×600: menu Management dapat dicapai tanpa menggerakkan halaman; reduced motion didukung                                                                        | Teruji lokal |
| Cost otomatis               | `money-input.tsx`, `money-input.ts`, project/expense forms                                                                                        | Mengetik `1250000.5` menjadi `1,250,000.5`; `.50` tetap dua digit. Kursor, Backspace di pemisah, paste, batas nominal, simpan/reload ledger diuji                                  | Teruji lokal |
| Label proyek                | `labels.ts`, `label-input.tsx`, validasi bersama, kolom JSONB proyek                                                                              | Tambah/hapus, suggestion, draft, simpan/reload, admin-only dan update klien lama tidak menghapus label                                                                             | Teruji lokal |
| Connection                  | `/api/connections`, `connections.ts`, model dan UI tree/list                                                                                      | Label case-insensitive, NFKC/whitespace dinormalisasi; proyek↔proyek dan proyek↔task; pencarian, filter jenis, pagination, arsip opsional, buka item, retry dan akses privat diuji | Teruji lokal |
| Overview native             | Ringkasan Connection setelah metrik, tiga cabang label dengan jumlah proyek/task, tautan menuju peta                                              | Klik label membuka map dan konteks yang benar; tetap terbaca pada ponsel                                                                                                           | Teruji lokal |
| Proporsi lintas halaman     | Perbaikan `flex-basis` judul pada ponsel dan penyembunyian area aksi kosong                                                                       | Tinggi judul tidak lagi dipaksa 310 px saat layout berubah menjadi kolom; pemeriksaan responsif dan tidak ada overflow                                                             | Teruji lokal |

Label yang sama merupakan **hubungan pengelompokan**, bukan urutan kerja, dependency pemblokiran, atau izin akses. Menambah label tidak otomatis mengubah label pada item lain. Setiap item menerima maksimal 10 label, masing-masing 30 karakter. Proyek tanpa label lama tetap tanpa label; tidak ada hubungan produksi yang dibuat dari data demo.

Peta memakai HTML button dan garis SVG, dengan zoom, pan mouse, scroll sentuh, tombol pan keyboard, Map/List tabs dan reduced motion. Area sempit memakai akar di atas dan cabang di bawah, agar pengguna langsung melihat konteks. Hasil dibatasi 24 item per halaman agar peta tetap ringan; seluruh hasil tersedia melalui pagination. Mode List menyediakan cara membaca hubungan tanpa menggeser kanvas.

Cost memformat teks saat mengetik, tanpa konversi floating point. Input menolak digit desimal ketiga dan format ambigu dengan pesan yang terlihat; tidak membulatkan diam-diam. Penyimpanan tetap minor-unit/numeric dua digit sesuai skema lama. Mata uang ledger dan pemeriksaan idempotensi/versi tetap berlaku.

## Database, keamanan, dan kapasitas

- Migrasi additive `0008_project_labels.sql`: `project.labels` JSONB, default `[]`, constraint array maksimal 10. Migrasi sudah diterapkan pada database development dan disposable test; belum pada produksi.
- Endpoint Connection mewajibkan sesi dan anggota aktif, mengirim `private, no-store`, dan hanya mengembalikan metadata yang diperlukan. Anonymous `401`, outsider `403`, error/retry, dan validasi cursor diperiksa. Tidak ada data keuangan, deskripsi privat tambahan, atau token di respons.
- Query Connection mengagregasi di PostgreSQL lalu melakukan pagination, terpisah dari bootstrap 500 task. Fixture 510 task aktif + satu proyek menghasilkan **511 item unik** lintas halaman; arsip opsional menambah satu. Cursor terikat pada filter dan ditolak bila filter berubah.
- Respons dibatasi maksimum 50 item oleh API (UI 24). Query mengurai label dan mengagregasi workspace; kapasitas produksi dan banyak pengguna bersamaan belum dibuktikan. Index/struktur materialisasi perlu ditentukan dari pengukuran beban nyata, bukan klaim throughput.

## Audit keseluruhan dan batas yang masih ada

Pemeriksaan meliputi Overview, Projects, Connection Map/List, Inbox, My tasks, All tasks, Archive, People, Activity, seluruh tab Settings, task/project editor, ledger dan navigasi. Bukti sebelumnya pada [audit menyeluruh](COMPREHENSIVE_AUDIT_2026_10_17.md) tetap berlaku sesuai tanggal dan cakupannya.

Pemeriksaan otomatis lokal: **75 tes unit/integrasi PostgreSQL dan 73 tes browser lulus**. Setelah revisi terakhir peta sempit, suite Connection dijalankan ulang. Build produksi lokal, TypeScript, lint tanpa peringatan, format, dan audit dependency juga diperiksa sebelum preview final.

Audit visual enam lebar (1440/1280/1024/768/390/320 px) mencatat **90 keadaan**: delapan halaman inti, empat tab Settings, Connection Map/List, serta Connection dark dengan teks besar dan reduced motion. Hasil per keadaan ada di [data audit](audit-data/connections-2026-10-17.json). Aturan axe WCAG 2 A/AA, 2.1 AA, 2.2 AA diperiksa; ini bukan sertifikasi aksesibilitas atau penggunaan pembaca layar secara manual.

Belum termasuk: dependency pemblokiran, subtask berizin, template khusus admin, metadata arsip proyek, pengujian Safari/Firefox/perangkat fisik, load test produksi, pemulihan backup, dan penerimaan reminder Calendar pada perangkat. Akun Google/Calendar produksi telah dikonfirmasi pengguna sebelumnya; tes ini tidak mengulangi pertukaran Google OAuth nyata.

Bukti visual memakai data sintetis demo, terpisah dari organisasi:

- Settings [desktop](screenshots/connections/settings-account-1440.png) / [ponsel](screenshots/connections/settings-account-390.png), [Appearance](screenshots/connections/settings-appearance-1440.png), [Workspace](screenshots/connections/settings-workspace-1440.png).
- Connection [desktop](screenshots/connections/connection-map-1440.png) / [ponsel](screenshots/connections/connection-map-390.png) / [dark + large text](screenshots/connections/connection-dark-1440.png).
- [Overview dengan Connection](screenshots/connections/overview-1440.png).

## Rencana rilis dan rollback

Perubahan tetap berada pada draft PR #4 dan preview. Produksi `evolve-rensist.vercel.app` belum diubah. Preview demo membuktikan interaksi UI; backend PostgreSQL dibuktikan terpisah dalam lingkungan lokal. Preview tidak memiliki kredensial Google/database produksi.

Setelah persetujuan produksi: pastikan CI pada SHA final lulus, terapkan migrasi 0008 melalui koneksi produksi yang dikelola aman, build/deploy snapshot sumber yang sama, periksa health (kini juga memeriksa kolom labels), verifikasi alias, sesi anggota/admin dan satu alur label→Connection→baca ulang memakai data pengujian yang disetujui. Pantau error/latensi query dan kegagalan simpan. Jangan menyisipkan fixture otomatis ke organisasi.

Rollback aplikasi dapat memakai deployment sebelumnya; kolom baru additive kompatibel dengan kode lama dan harus dipertahankan agar label yang sudah ditulis tidak hilang. Jangan menjatuhkan kolom atau mengubah migrasi yang sudah diterapkan. Migrasi memakai transaction dan advisory lock; kegagalan harus menghentikan rilis sebelum alias dipindahkan. Jika verifikasi sesudah rilis gagal, kembalikan alias dan catat kegagalan konkret.
