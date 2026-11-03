# SECURITY — Inovasi UNINUS

Status: **DRAFT Fase 3.** Angka batas bertanda **[USULAN]** menunggu OQ-06. Dokumen ini diverifikasi ulang terhadap implementasi di Fase 6.

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

- Tanpa password lokal. Login hanya lewat SSO UNINUS (Authorization Code + PKCE, `state` dan `nonce` divalidasi, redirect URI persis sama dengan yang terdaftar).
- Sesi: ID acak 256-bit, hanya hash disimpan. Masa berlaku absolut **[USULAN]** 8 jam, idle 60 menit, dicabut saat logout atau saat akun dinonaktifkan.
- Pengguna yang dinonaktifkan di platform ini ditolak walau SSO menerima.
- Tidak ada akun/backdoor "dev" di produksi. Mode login pengembangan hanya aktif bila `APP_ENV=development` dan gagal start bila aktif di produksi.

## 3. Otorisasi

RBAC berbasis permission (`USER_ROLES.md`). Setiap rute memanggil `authorize()`; tidak ada pemeriksaan otorisasi yang hanya ada di UI. Tes otorisasi otomatis untuk setiap permission dan rute.

## 4. Validasi Input dan Output

- Semua input divalidasi schema (Zod) di server; field tak dikenal ditolak.
- Query database hanya lewat Drizzle/parameter terikat. Dilarang menyusun SQL dari string input.
- Teks panjang disimpan sebagai **teks biasa**; dirender sebagai teks (React meng-escape). Tidak ada `dangerouslySetInnerHTML` pada konten pengguna.
- URL publikasi/video divalidasi `http`/`https` saja, dirender dengan `rel="noopener noreferrer nofollow"`. Video hanya dari daftar domain yang diizinkan, ditentukan kemudian.
- Slug dibuat dari judul dengan normalisasi, dan dicek unik. Parameter `sort`/`filter` hanya dari daftar putih.

## 4a. Header dan Transport

HTTPS wajib (HSTS). Header: `Content-Security-Policy` ketat (tanpa `unsafe-eval`, sumber CDN dibatasi), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, `frame-ancestors 'none'`. CORS tertutup (same-origin).

## 5. Upload

| Aturan | Nilai [USULAN] |
|---|---|
| Gambar | JPEG/PNG/WebP, maks 5 MB, dimensi dibatasi, **di-re-encode** dengan `sharp` (menghapus metadata/EXIF dan muatan tersembunyi) |
| Dokumen | PDF, maks 20 MB |
| Jumlah per inovasi | maks 20 file |
| Validasi | Ekstensi **dan** MIME **dan** magic bytes harus konsisten, daftar putih saja |
| Penyimpanan | Nama acak (UUID), di luar web root, folder tidak dapat dieksekusi |
| Penyajian | `Content-Disposition`, `X-Content-Type-Options: nosniff`, domain/path tanpa eksekusi skrip |
| Pemindaian virus | Tidak aktif di MVP (ClamAV memakai ±1 GB RAM, tidak muat di server saat ini). Dicatat sebagai risiko residual; PDF dari pengguna terautentikasi dan diverifikasi operator sebelum publik |

## 6. Rate Limiting dan Anti-Spam

Dua lapis: Nginx `limit_req` (utama, bertahan saat restart) dan limiter dalam proses untuk rute sensitif. Batas ada di `API_DOCUMENTATION.md` §7. Formulir kolaborasi: honeypot, batas panjang, validasi email, penyimpanan `ip_hash` (bukan IP mentah).

## 7. Rahasia dan Konfigurasi

- Semua secret (client secret SSO, DB, kunci enkripsi/penandatanganan) di environment variable, tidak di repo. `.env.example` hanya berisi nama variabel.
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
- Ketergantungan pada keamanan SSO dan akun Google Workspace dosen.
