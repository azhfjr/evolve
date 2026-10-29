# Task attachments, multi-item Cost, Activity dan Settings

17 Oktober 2026 · Asia/Bangkok. Antarmuka English, komunikasi Bahasa Indonesia. Pilihan pengguna: **total otomatis terpisah per mata uang**. Format input tetap `1,250,000.50` sesuai keputusan sebelumnya. Setelah audit ini, pemilik menyetujui rilis produksi dan migrasi 0008–0010 berhasil diterapkan. Lihat [bukti rilis produksi](RELEASE_2026_10_17.md) untuk status terkini; uraian audit berikut mempertahankan konteks pra-rilis.

## Hasil yang dapat ditinjau

| Kebutuhan                    | Perilaku akhir                                                                                                                                                               | Bukti / batas                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attachment saat membuat task | Tombol Attachments di dekat Checklist/Labels membuka pemilih file. Pengguna juga dapat menjatuhkan beberapa file, melihat status, menghapus atau mengulang unggahan.         | Browser privat menguji unggah, kegagalan sementara, retry, reload draft, dan pemulihan respons pembuatan task yang terputus tanpa duplikasi. Demo menampilkan kebutuhan login; tidak berpura-pura mengunggah ke organisasi. |
| Lampiran sebelum simpan      | File distaging secara privat untuk pengunggah, lalu dikaitkan ke task dalam transaksi pembuatan task.                                                                        | Anggota lain mendapat 404 untuk file draft dan baru dapat membacanya setelah task dibuat. Claim memeriksa pemilik, UUID draft, status ready, umur file, dan daftar ID unik. Claim yang gagal membatalkan pembuatan task.    |
| Beberapa Cost per proyek     | Setiap item memiliki judul, mata uang IDR/USD dan Amount; dapat ditambah, diedit atau dihapus melalui form proyek/Manage costs.                                              | Maksimal 50 item, ID unik, judul maksimal 120 karakter, validasi server dan konflik versi. Draft mempertahankan baris yang belum lengkap.                                                                                   |
| Total otomatis               | Total Cost diperbarui ketika mengetik dan disimpan secara tepat per mata uang.                                                                                               | Penjumlahan minor-unit BigInt: USD 0.10 + USD 0.20 = USD 0.30. IDR tidak ditambahkan ke USD; tidak ada kurs tersembunyi. Total tiap mata uang maksimal 999,999,999,999.99.                                                  |
| Data pengeluaran lama        | Cost breakdown merupakan rincian rencana; Recorded expenses mempertahankan ledger pengeluaran dengan judul, mata uang, tanggal, kategori, payee, void/restore dan riwayat.   | Pengeluaran juga dapat memilih mata uang tiap item. Total dihitung dari seluruh ledger di PostgreSQL, termasuk halaman lain; entri void dikecualikan. Tidak menggabungkan rencana dan pengeluaran sebagai satu nominal.     |
| Penggantian istilah          | Investment budget pada form kini menjadi **Amount**. Detail proyek memakai **Cost**, **Total Cost**, **Cost breakdown** dan **Recorded expenses**.                           | Nilai tunggal proyek lama tetap tampil sebagai satu item “Project cost”; tidak dihapus atau dikonversi dengan kurs.                                                                                                         |
| Activity                     | Toolbar dan date filters sejajar; filter 4 kolom desktop/2 kolom sempit; avatar 32 px, teks utama 14 px, metadata waktu/jenis berada dalam satu baris yang dapat membungkus. | Pencarian, filter, pagination dan pembukaan task tetap diperiksa. Data demo berjenis task tidak lagi ditandai General bila memiliki taskId.                                                                                 |
| Settings                     | Hierarki judul 18 px, gap form 14 px, margin bertumpuk pada Workspace dibuang; navigasi menjadi tab horizontal pada layar sempit.                                            | Input desktop 38 px/ponsel minimal 44 px; teks input 14 px/ponsel minimal 16 px. Mode Large tetap mengikuti token lebih besar. Empat tab, penyimpanan profil/workspace, keyboard, upload gambar dan pembatasan admin diuji. |

## Lifecycle dan pemulihan file

File draft menggunakan penyimpanan privat yang sama dengan attachment biasa, beserta validasi nama, tipe, ukuran dan signature. Maksimal 10 file saat membuat task, 25 MB per file, dengan kuota workspace dan rate limit yang sudah ada. Batas ini bukan pemindaian malware.

Referensi unggahan ready disimpan pada draft browser yang dipisahkan per akun/konteks. File yang belum berhasil diunggah tetap berada di tab dan harus diulang atau dihapus sebelum Create task diaktifkan. Navigasi diblokir selama unggahan aktif; keluar dari tab memperingatkan jika masih ada unggahan yang belum tersimpan. Pengguna yang memaksa reload saat file gagal perlu memilihnya kembali.

File draft kedaluwarsa 24 jam setelah diunggah dan tidak dapat diklaim/dibaca setelahnya. Cleanup fisik dijalankan saat maintenance/unggahan berikutnya; ini bukan janji penghapusan fisik tepat pada detik ke-24 jam. Draft yang dibuang mencoba menghapus unggahan secara aman. Penghapusan dari konteks draft memeriksa bahwa file masih merupakan draft: file yang sudah dikaitkan ke task tidak ikut terhapus ketika respons pembuatan task sebelumnya terputus.

Pembuatan task memakai idempotency key yang sama dengan UUID draft. Retry permintaan yang identik mengembalikan task yang sama. Lampiran yang hilang/kedaluwarsa menimbulkan pesan untuk menghapus lalu mengunggah ulang; referensi 404 dapat dihapus dari draft. File yang sudah terpasang menggunakan izin workspace yang sudah berlaku.

## Model data dan kompatibilitas

- `0009_project_cost_items.sql` menambahkan kolom nullable `project.cost_items` JSONB dan constraint array maksimal 50; **null** mempertahankan arti nilai proyek lama, sedangkan **[]** berarti pengguna secara eksplisit menghapus semua item.
- Amount kompatibilitas `project.budget` hanya berisi jumlah item pada mata uang default proyek. Server menghitungnya sendiri, sehingga nilai total yang dipalsukan klien tidak dipercaya. Update klien lama yang menghilangkan costItems mempertahankan rincian; perubahan nominal/currency oleh klien lama ditolak dengan instruksi reload bila proyek sudah memakai rincian baru.
- `0010_task_draft_attachments.sql` memperluas CHECK entity_type agar mendukung taskDraft, dalam transaksi migrasi. Semua tipe attachment lama tetap diterima. Tidak ada penghapusan data atau backfill nominal.
- Claim dan cleanup memakai advisory lock yang sama dengan transaksi perubahan workspace, sehingga cleanup tidak menghapus file yang sedang dikaitkan ke task. Pemeriksaan owner/status/draft ID juga berada di transaksi claim.
- Health memeriksa kolom baru serta catatan migrasi 0010. Seluruh migrasi 0001–0010 diterapkan pada development dan database tes disposable. Pada audit pra-rilis, produksi masih pada 0001–0007; kandidat ini juga memerlukan migrasi 0008 dari iterasi sebelumnya. Ketiganya kini telah diterapkan sesuai catatan rilis.

## Audit dan pengujian

**80 unit/integrasi PostgreSQL lulus**, tanpa skip. Cakupan baru mencakup batas/precision Cost, normalisasi input, draft parsial, preservasi data lama, kontrol admin, konflik versi, currency default, idempotensi pengeluaran, agregasi lintas 81 entri, privasi file sebelum/sesudah claim, kegagalan claim atomik, expiry dan operational pause.

Suite browser berisi **81 tes**. Alur kritis task/Cost serta regresi workspace diperiksa ulang setelah temuan diperbaiki; hasil suite final dan CI pada SHA rilis dicatat di PR #4. Pemeriksaan menggunakan sesi sintetis di database disposable, bukan pertukaran Google OAuth produksi.

Audit render terakhir memeriksa **126 keadaan pada enam lebar** (1440/1280/1024/768/390/320 px): seluruh halaman utama, empat tab Settings, Connection Map/List, task creation/attachment, Cost multi-item, detail biaya dan form expense; juga dark mode, teks Large dan reduced motion. Tidak ditemukan overflow halaman, pageerror, atau pelanggaran pada aturan axe WCAG 2 A/AA, 2.1 AA dan 2.2 AA yang dipilih setelah font/transisi selesai. Penanda urutan form gelap dan interpolasi warna kalender diperbaiki dari temuan audit. Data: [hasil per keadaan](audit-data/task-costs-2026-10-17.json).

Bukti visual dengan data sintetis:

- Activity [desktop](screenshots/task-costs/activity-1440.png) / [ponsel](screenshots/task-costs/activity-390.png).
- Settings [Account](screenshots/task-costs/settings-account-1440.png), [Workspace desktop](screenshots/task-costs/settings-workspace-1440.png) / [ponsel](screenshots/task-costs/settings-workspace-390.png).
- Cost [editor](screenshots/task-costs/cost-editor-1440.png), [dark + Large](screenshots/task-costs/cost-editor-dark-large-1440.png), [detail desktop](screenshots/task-costs/cost-detail-1440.png) / [ponsel](screenshots/task-costs/cost-detail-390.png).
- Task dengan bagian attachment [desktop](screenshots/task-costs/task-attachments-1440.png) / [ponsel](screenshots/task-costs/task-attachments-390.png). Upload nyata diuji pada browser privat/database tes, bukan demo.

Build produksi lokal, TypeScript, lint tanpa peringatan, formatting, audit dependency produksi dan CI harus lulus sebelum kandidat diserahkan. Snapshot preview mencatat SHA/digest sumber; backend Google/Neon/Blob produksi tidak disalin ke preview demo.

## Rilis, mitigasi dan rollback

Pada tahap audit pra-rilis, alias, migrasi, file dan data organisasi produksi belum diubah. Pelaksanaan rilis yang kemudian disetujui dicatat terpisah. Prosedur untuk rilis berikutnya: pastikan CI SHA kandidat lulus, terapkan migrasi 0008–0010 melalui koneksi yang dikelola aman, deploy sumber yang sama, periksa health/alias, lalu verifikasi satu alur upload→create task→readback dan Cost dua mata uang menggunakan data yang disetujui. Pantau log kegagalan claim/upload, error simpan, konflik dan latensi ledger. Jangan membuat fixture otomatis pada data pelanggan.

**Jangan langsung mengembalikan alias ke aplikasi lama yang tidak memahami taskDraft dan ledger multi-currency.** Backend rollback harus mempertahankan pemeriksaan owner draft serta pemisahan mata uang. Kode lama dapat salah menampilkan pengeluaran lintas mata uang dan tidak memiliki batas akses draft yang baru. Pertahankan kolom/constraint baru serta rincian asli; jangan menghapus migrasi yang sudah diterapkan.

Mitigasi awal untuk masalah unggahan baru: set `EVOLVE_DISABLE_TASK_DRAFT_UPLOADS=1` di konfigurasi aman dan deploy ulang kandidat yang mempertahankan guard privasi. Upload sebelum pembuatan dihentikan dengan pesan; file task yang sudah tersimpan tetap dapat diakses. Roll forward dengan perbaikan teruji, atau siapkan build rollback kompatibel yang mempertahankan layanan domain/guard baru. Kembali ke versi lama hanya boleh dilakukan setelah evaluasi data draft/mata uang dan persetujuan pemilik, bukan sebagai rollback otomatis.

## Batas evaluasi

Hasil ini membuktikan alur yang dieksekusi pada Chromium dan PostgreSQL tes, bukan jaminan bebas bug. Belum merupakan load test produksi, uji Safari/Firefox/perangkat fisik, pemulihan backup, audit penetrasi, atau verifikasi upload baru ke Blob produksi. Google login/Calendar yang sebelumnya dikonfirmasi pengguna tidak diulang. Dependency pemblokiran, subtask dan template khusus admin tetap di luar perubahan ini.
