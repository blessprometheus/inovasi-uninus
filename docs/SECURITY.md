# SECURITY — Inovasi UNINUS

Status: **DRAFT Fase 3.** Angka batas bertanda **[USULAN]** menunggu OQ-06. Dokumen ini diverifikasi ulang terhadap implementasi di Fase 6.

> **ADR-008 (2026-11-04):** SSO dihapus; kita kini menyimpan kata sandi operator dan bertanggung jawab atasnya. Kontrolnya ada di §2 dan sudah diimplementasikan serta diuji. Formulir kolaborasi tidak ada. Data dosen yang diinput operator: lihat OQ-28.

## 1. Aset dan Ancaman Utama

| Aset | Ancaman | Kontrol utama |
|---|---|---|
| Sesi dosen/operator | Pencurian cookie, CSRF, fixation | Cookie `__Host-`/HttpOnly/Secure/SameSite, sesi opaque di DB, token CSRF + cek Origin, rotasi sesi saat login |
| Data inovasi belum terbit | Akses oleh pihak tak berhak (IDOR) | `authorize()` di server pada setiap akses, 404 untuk milik orang lain, tes otorisasi otomatis |
| File upload | Malware, polyglot, path traversal, stored XSS | Magic-byte + MIME, batas ukuran, nama acak, re-encode gambar, di luar web root, `nosniff` |
| Data pihak luar (form kolaborasi) | Kebocoran, spam | Rate limit, honeypot, akses hanya operator, masa simpan |
| Integritas workflow | Loncat status | State machine di server, tabel transisi, audit |
| Akun admin | Eskalasi hak, penyalahgunaan | Super Admin via CLI, audit pemberian role, pemisahan tugas verifikasi |
| Server bersama | Dampak ke aplikasi lain | Pengguna OS terpisah, batas memori proses, tanpa layanan tambahan |

## 2. Autentikasi

- **Login lokal email + kata sandi untuk operator dan super admin** (ADR-008). Tanpa SSO. Dosen dan pengunjung tidak login.
  - **Hash argon2id** (paket `argon2`; 19 MiB, 2 iterasi, 1 jalur, parameter OWASP minimum, sengaja kecil karena server bersama). Parameter tertanam di hash, jadi bisa dinaikkan tanpa mematahkan hash lama. Kata sandi tidak pernah disimpan, dicatat, atau dikirim polos; audit log dan respons API tidak memuatnya.
  - **Kebijakan:** 12 sampai 128 karakter, bukan hanya spasi, minimal 5 karakter berbeda, tidak sama dengan email dan tidak memuat bagian depan email (bila 4 karakter atau lebih). Tanpa aturan komposisi (huruf besar/simbol) karena panjang lebih berguna. Tanpa 2FA untuk sekarang (keputusan 2026-11-04).
  - **Semua kegagalan terlihat sama** bagi klien (401 dengan satu pesan): email tidak ada, sandi salah, akun nonaktif, akun tanpa sandi, dan akun terkunci. Alasan sebenarnya hanya di audit log. Waktu respons disamakan dengan memverifikasi terhadap hash palsu, sehingga email yang terdaftar tidak bisa diketahui dari waktu respons.
  - **Penguncian akun:** 5 kegagalan beruntun mengunci akun 15 menit (hitungan atomik di database). Setelah masa kunci lewat, hitungan mulai dari nol. Kegagalan memasukkan "sandi saat ini" pada fitur ganti sandi dihitung sama. Risiko yang diterima: orang yang tahu email operator dapat mengunci akun itu 15 menit berulang kali; pengawasannya lewat audit log (`auth.account_locked`).
  - **Pembatas laju** di memori (per proses): 10 percobaan/menit per email dan 60/menit total, supaya argon2 tidak membebani server yang sudah padat (OQ-01). Pembatas per IP belum ada karena IP klien di balik proxy belum bisa dipercaya (OQ-20).
  - **Sandi sementara:** akun baru dan atur ulang oleh super admin memakai sandi acak 16 karakter yang tampil sekali. Pemilik akun **wajib** menggantinya: sebelum itu semua API (kecuali `/auth/me`, `/auth/csrf`, `/auth/logout`, `/auth/password`) menjawab `PASSWORD_CHANGE_REQUIRED` dan semua halaman dialihkan ke halaman ganti sandi. Pemeriksaan ada di server.
  - **Mengganti sandi** (sendiri atau diatur ulang) mencabut sesi lain milik akun itu; menonaktifkan akun atau mengubah perannya mencabut semua sesinya seketika.
  - **Akun pertama:** `npm run admin:create` dari server (sandi diketik tersembunyi atau lewat `ADMIN_PASSWORD`). Tidak ada akun bawaan atau sandi bawaan.
  - **Pencegahan terkunci total:** minimal satu super admin aktif harus tersisa; tidak boleh mengubah, menonaktifkan, atau mengatur ulang akun sendiri lewat antarmuka kelola akun.
  - **Belum ada:** "lupa kata sandi" mandiri (butuh email, OQ-14); pemulihan lewat super admin atau CLI `--reset`.
- Sesi: ID acak 256-bit, hanya hash disimpan. Masa berlaku absolut **[USULAN]** 8 jam, idle 60 menit, dicabut saat logout atau saat akun dinonaktifkan.
- Pengguna yang dinonaktifkan ditolak di setiap request (status akun diperiksa saat membaca sesi), bukan hanya saat login.
- Tidak ada akun/backdoor "dev" di produksi. Mode login pengembangan (`POST /api/v1/auth/dev-login`) hanya aktif bila `DEV_LOGIN=1` **dan** `APP_ENV=development` **dan** bukan mode produksi. Bila `DEV_LOGIN=1` ditemukan di luar itu, hook `instrumentation` melempar galat: proses Next.js tetap hidup tetapi menjawab 500 untuk semua request (diverifikasi), jadi jalur dev tidak pernah terjangkau dan penyebabnya tercatat di log. Tanpa `DEV_LOGIN`, rute itu menjawab 404.

## 3. Otorisasi

RBAC berbasis permission (`USER_ROLES.md`). Setiap rute memanggil `authorize()`; tidak ada pemeriksaan otorisasi yang hanya ada di UI. Tes otorisasi otomatis untuk setiap permission dan rute.

## 4. Validasi Input dan Output

- Semua input divalidasi schema (Zod) di server; field tak dikenal ditolak.
- Query database hanya lewat Drizzle/parameter terikat. Dilarang menyusun SQL dari string input.
- Teks panjang disimpan sebagai **teks biasa**; dirender sebagai teks (React meng-escape). Tidak ada `dangerouslySetInnerHTML` pada konten pengguna.
  - **Satu-satunya pengecualian** adalah `JsonLd` (data terstruktur schema.org). Isinya JSON yang diserialisasi lewat `serializeJsonLd`, yang meng-escape `<`, `>`, `&`, dan pemisah baris Unicode sehingga judul seperti `</script><script>…` tidak bisa menutup tag skrip. Dijaga tes unit dan diperiksa ulang di HTML server nyata.
- URL publikasi/video divalidasi `http`/`https` saja, dirender dengan `rel="noopener noreferrer nofollow"`. Video hanya dari daftar domain yang diizinkan, ditentukan kemudian.
- Slug dibuat dari judul dengan normalisasi, dan dicek unik. Parameter `sort`/`filter` hanya dari daftar putih.

## 4a. Header dan Transport

HTTPS wajib (HSTS). Header: `Content-Security-Policy` ketat (tanpa `unsafe-eval`, sumber CDN dibatasi), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `frame-ancestors 'none'`. CORS tertutup (same-origin).

## 5. Upload

| Aturan | Nilai [USULAN] |
|---|---|
| Gambar | JPEG/PNG/WebP, maks 5 MB (`UPLOAD_MAX_IMAGE_MB`), maks 40 juta piksel, **di-re-encode** dengan `sharp` ke WebP (EXIF/GPS dan muatan tersembunyi hilang; orientasi diterapkan dulu) dengan dua varian: 1600 px dan 480 px. **Sudah diimplementasikan dan diuji** |
| Dokumen | PDF, maks 20 MB (`UPLOAD_MAX_DOC_MB`). Disimpan apa adanya (tanpa pemindaian). Bawaan `restricted`; operator yang menetapkan mana yang publik (menutup OQ-09) |
| Jumlah per inovasi | maks 20 file |
| Validasi | Ekstensi **dan** MIME **dan** magic bytes harus konsisten, daftar putih saja |
| Penyimpanan | Nama acak (UUIDv7) buatan server, folder dua karakter, `STORAGE_PATH` di luar web root, mode berkas 0640. Kunci divalidasi dengan pola ketat dan diperiksa tetap di dalam folder dasar (anti path traversal); nama berkas dari pengguna tidak pernah dipakai sebagai path |
| Penyajian | Lewat rute aplikasi (bukan folder statis): `Content-Type` dari database, `nosniff`, `Content-Security-Policy: sandbox` (menetralkan JavaScript dalam PDF), `Cross-Origin-Resource-Policy`, `no-cache` + `ETag`. Otorisasi diperiksa sebelum 304. Berkas `restricted`, milik draft, ditarik, atau dihapus: 404 yang sama |
| Pemindaian virus | Tidak aktif di MVP (ClamAV memakai ±1 GB RAM, tidak muat di server saat ini). Dicatat sebagai risiko residual; PDF dari pengguna terautentikasi dan diverifikasi operator sebelum publik |

## 6. Rate Limiting dan Anti-Spam

Dua lapis: Nginx `limit_req` (utama, bertahan saat restart) dan limiter dalam proses untuk rute sensitif. Batas ada di `API_DOCUMENTATION.md` §7. Formulir kolaborasi: honeypot, batas panjang, validasi email, penyimpanan `ip_hash` (bukan IP mentah).

## 7. Rahasia dan Konfigurasi

- Semua secret (DB, `AUTH_SECRET`, kunci penandatanganan) di environment variable, tidak di repo. `.env.example` hanya berisi nama variabel.
- `.env` produksi hak akses `600`, dimiliki pengguna OS aplikasi.
- Aplikasi gagal start bila variabel wajib tidak ada.
- Secret tidak pernah muncul di log, respons, atau pesan error.

## 8. Logging, Audit, dan Error

- Audit log (append-only) untuk: login/logout, transisi status, perubahan role, perubahan data inovasi oleh operator, hapus/unggah file, perubahan pengaturan, percobaan transisi/otorisasi yang gagal.
- Log aplikasi terstruktur, tanpa data pribadi berlebih. Rotasi dan masa simpan ditetapkan di `DEPLOYMENT.md`.
- Respons error ke pengguna generik, detail hanya di log dengan request id.

## 9. Data Pribadi

- Data pihak luar (formulir kolaborasi): kumpulkan seminimal mungkin, tampilkan teks persetujuan, simpan dengan `consent_at`, akses terbatas operator/super admin. **Masa simpan [USULAN]: 12 bulan lalu dihapus/dianonimkan.**
- `identifier` (NIDN/NIP) peneliti tidak ditampilkan publik kecuali diputuskan lain.
- Perlu ditinjau terhadap UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi oleh pihak yang berwenang di UNINUS.

## 10. Backup dan Pemulihan

Backup `pg_dump` harian + salinan file, disimpan **di luar server aplikasi**, terenkripsi, dengan uji restore berkala. Backup dan uji restore adalah **syarat go-live** (kondisi saat ini: `/www/backup` kosong).

## 11. Dependensi dan Rantai Pasok

Versi dikunci (`lockfile`), audit dependensi (`npm audit`) di CI, pembaruan keamanan ditinjau berkala. Menambah dependensi utama memerlukan persetujuan (`AGENTS.md` §12).

## 12. Risiko Residual yang Diketahui

- Tanpa pemindaian antivirus (lihat §5).
- Server bersama dan peringatan kerentanan PHP milik aplikasi lain di server (di luar kendali platform ini, OQ-01).
- Keamanan akun operator kini sepenuhnya bergantung pada kekuatan kata sandi dan kehati-hatian penyampaian sandi sementara (belum ada 2FA).
