# Mengaktifkan Google Calendar untuk Evolve

Gunakan project Google Cloud dan OAuth Web client **yang sudah dipakai untuk login Evolve**. Client ID dan client secret yang telah disimpan di Vercel tetap digunakan. Tidak perlu membuat client baru.

1. Buka [Google Cloud Console](https://console.cloud.google.com/) menggunakan akun pemilik project. Klik pemilih project di bagian atas dan pilih project Evolve yang berisi OAuth client login.
2. Buka [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com). Pastikan project yang dipilih benar, kemudian klik **Enable / Aktifkan**. Jika tombolnya **Manage / Kelola**, API sudah aktif.
3. Buka [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients). Alternatif: **APIs & Services → Credentials → OAuth 2.0 Client IDs**. Pilih client bertipe **Web application** yang dipakai Evolve.
4. Pada **Authorized redirect URIs**, klik **Add URI** dan tambahkan tepat:

   ```text
   https://evolve-rensist.vercel.app/api/calendar/callback
   ```

5. Pertahankan URI login berikut pada daftar yang sama:

   ```text
   https://evolve-rensist.vercel.app/api/auth/callback/google
   ```

   Origin JavaScript tetap `https://evolve-rensist.vercel.app`. Jangan menambahkan slash di akhir URI callback, mengganti `/api/calendar/callback` dengan callback login, atau menghapus callback login.

6. Klik **Save / Simpan**. Perubahan konfigurasi Google kadang memerlukan beberapa menit untuk berlaku.
7. Buka [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience). Jika status aplikasi masih **Testing**, buka **Test users → Add users**. Tambahkan `jarjirjor777@gmail.com` dan email anggota yang akan mencoba Calendar, lalu simpan. Persetujuan email anggota di Evolve dan daftar test users Google merupakan dua pengaturan berbeda.
8. Pada **Data Access**, bila diminta mengatur scope consent screen, pilih **Add or remove scopes** dan cari `calendar.app.created` setelah Calendar API aktif. Evolve meminta izin ini ketika pengguna menghubungkan kalender: membuat dan mengelola kalender yang dibuat aplikasi. Pertahankan scope login `openid`, email, dan profil. Jangan menambahkan akses penuh semua kalender untuk alur ini.
9. Setelah pembaruan Evolve tersedia pada deployment yang telah dikonfigurasi, masuk ke Evolve → **Settings → Google Calendar → Hubungkan Google Calendar**. Pilih akun Google **yang sama dengan email login Evolve**, lalu setujui izin tambahan. Setiap anggota menghubungkan akunnya sendiri.
10. Pilih **Task yang ditugaskan kepada saya** atau **Seluruh task aktif workspace**, lalu atur pengingat dan simpan. Buat task uji dengan tanggal dan jam tenggat, kemudian periksa kalender khusus **Evolve** di Google Calendar. Izinkan notifikasi pada aplikasi Calendar dan perangkat agar pengingat dapat tampil.

Saat Google OAuth masih Testing, izin Calendar/refresh token umumnya berakhir setelah tujuh hari. Untuk pemakaian organisasi secara rutin, atur status publikasi melalui Audience dan selesaikan persyaratan Google yang ditampilkan untuk aplikasi serta scope tersebut. Memublikasikan consent screen tidak membuat workspace Evolve terbuka: login Evolve tetap memerlukan undangan.

## Jika muncul kesalahan

| Pesan / keadaan                                     | Pemeriksaan                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                             | Buka client yang benar, tambahkan callback Calendar persis seperti langkah 4, simpan, lalu coba lagi setelah beberapa menit. |
| `access_denied` / aplikasi masih diuji              | Tambahkan email akun yang dipakai ke **Test users** di project Google yang sama.                                             |
| Calendar API belum pernah digunakan / dinonaktifkan | Aktifkan API pada project yang memiliki OAuth client tersebut.                                                               |
| Akun Google berbeda                                 | Hubungkan dengan email yang sama dengan identitas login Evolve.                                                              |
| Tidak ada tombol Hubungkan di situs saat ini        | Pembaruan Calendar belum berada pada deployment yang sedang dibuka. Pengaturan Google Cloud bisa diselesaikan lebih dahulu.  |
| Perlu dihubungkan ulang                             | Izin telah dicabut atau kedaluwarsa. Gunakan Hubungkan kembali di pengaturan Calendar.                                       |
| Event ada tetapi pengingat tidak tampil             | Periksa jam/zona waktu task, kalender Evolve, izin notifikasi Google Calendar, dan pengaturan perangkat.                     |

Jangan kirim client secret, kode otorisasi, atau token ke chat. Tidak perlu mengubah variabel Google di Vercel ketika hanya menambahkan URI pada client yang sama.
