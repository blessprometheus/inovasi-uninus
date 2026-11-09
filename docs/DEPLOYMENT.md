# DEPLOYMENT — Inovasi UNINUS

Status: **DRAFT arsitektur Fase 3.** Belum ada deployment. Dilarang mengubah server produksi tanpa persetujuan eksplisit pengguna (`AGENTS.md` §12). Panduan langkah-demi-langkah dilengkapi di Fase 7.

> **ADR-008 (2026-11-04):** variabel klien OIDC (`SSO_*`) dan `INITIAL_SUPER_ADMIN_EMAIL` tidak lagi diperlukan. `RESEARCHER_PORTAL` (default tidak diset = mati) menyalakan portal dosen. **Flag ini dibaca saat build untuk halaman `/dosen` (rute API membacanya saat request)**, jadi mengubahnya berarti build ulang. Biarkan mati di produksi.
>
> **Urutan menyiapkan akun pertama di server:** `npm run db:migrate`, `npm run db:seed`, lalu `npm run admin:create -- --email <email> --name "<nama>"` (sandi diketik tersembunyi). Perintah yang sama dengan `--reset` mengatur ulang sandi bila terkunci total. Jangan memakai login dev (`DEV_LOGIN` harus mati).
>
> **`argon2` dan `sharp` adalah modul native:** jalankan `npm ci` dan `npm run build` di server (Linux x64) supaya prebuild yang benar terpasang. Jangan menyalin `.next/standalone` yang dibangun di Windows ke server.
>
> **Berkas unggahan:** folder `STORAGE_PATH` wajib masuk jadwal backup bersama database (bagian Backup di SECURITY.md; satu tanpa yang lain tidak bisa dipulihkan), dan dipantau pemakaian disk dan inodenya (OQ-01). Setiap gambar menghasilkan 2 berkas, setiap PDF 1.

## 1. Lingkungan Target

VPS Ubuntu 24 dengan aaPanel (4 core, 7,7 GB RAM, disk 154 GB), dikelola pengguna, **dipakai bersama website lain**. Domain produksi `inovasi.uninus.ac.id`.

Kondisi yang harus beres **sebelum** go-live (temuan screenshot 2026-11-03):

| # | Temuan | Syarat |
|---|---|---|
| 1 | Load average ±7 pada 4 core | Identifikasi penyebab, pastikan ada ruang CPU |
| 2 | Inode 100% | Bersihkan/perluas hingga ada ruang aman (target di bawah 80%) |
| 3 | `/www/backup` kosong | Backup terjadwal + uji restore berhasil |
| 4 | Peringatan kerentanan PHP | Pengelola server memperbarui (di luar platform ini, tetap risiko bersama) |

## 2. Topologi

```
Internet → Nginx (aaPanel, TLS Let's Encrypt, limit_req, header keamanan)
        → 127.0.0.1:<port> Next.js standalone (PM2, pengguna OS khusus)
        → PostgreSQL (hanya listen localhost, pengguna DB khusus aplikasi)
        → /var/lib/inovasi/storage (file upload, di luar web root)
```

- Pengguna OS dan pengguna DB khusus aplikasi ini, hak minimum, tidak berbagi dengan website lain.
- PostgreSQL tidak membuka port ke luar. Akses admin lewat SSH/aaPanel.
- Nginx melayani file upload lewat `internal` location setelah izin diberikan aplikasi.

## 3. Lingkungan

| Lingkungan | Tujuan | Catatan |
|---|---|---|
| Lokal | Pengembangan | Login pengembangan hanya di sini, data `[DUMMY]` |
| Staging **[ASUMSI]** subdomain terpisah | Uji SSO, uji beban kecil, persetujuan | Butuh client OAuth sendiri di SSO, DB terpisah, tanpa data nyata |
| Produksi | `inovasi.uninus.ac.id` | Client OAuth produksi |

Staging memakai server yang sama akan menambah beban (OQ-01). Alternatif: staging hanya berjalan saat dibutuhkan.

## 4. Konfigurasi (environment variable)

Nilai asli tidak pernah di repo. `.env.example` memuat nama berikut:

`APP_ENV`, `APP_URL`, `DATABASE_URL`, `AUTH_SECRET` (min. 32 karakter acak, beda per lingkungan), `STORAGE_PATH` (path absolut **di luar** folder aplikasi dan web root, dapat ditulis pengguna proses Node), `UPLOAD_MAX_IMAGE_MB` (bawaan 5), `UPLOAD_MAX_DOC_MB` (bawaan 20), `SMTP_*` (P1), `RESEARCHER_PORTAL` (opsional, biarkan kosong).

## 5. Build dan Rilis

1. Build di luar server (lokal/CI): `next build` dengan `output: 'standalone'`. Ini memangkas `node_modules` menjadi sebagian kecil dan **menghemat inode**.
2. Kirim artefak (tar) ke server, ekstrak ke direktori rilis bertanggal, atur symlink `current`.
3. Jalankan migrasi database (tahap terpisah dan eksplisit, dengan backup sebelumnya).
4. Reload PM2 (zero-downtime reload), cek `/api/health`.
5. **Rollback:** arahkan symlink ke rilis sebelumnya + reload. Migrasi harus kompatibel mundur satu rilis (expand/contract), atau punya skrip balik teruji.
6. Simpan maksimum 3 rilis terakhir (mengendalikan inode).

## 6. Backup dan Pemulihan

| Apa | Frekuensi | Tujuan | Retensi [USULAN] |
|---|---|---|---|
| `pg_dump` | Harian | Di luar server | 14 harian + 8 mingguan |
| Folder file | Harian (inkremental) | Di luar server | Sama |
| Uji restore | Bulanan + sebelum go-live | Lingkungan staging | Catat hasil |

## 7. Pemantauan dan Log

- `/api/health` + cek uptime eksternal.
- Pemantauan load, RAM, disk, **inode** di aaPanel dengan peringatan ambang.
- Log aplikasi JSON ke file dengan `logrotate` (maks 14 hari **[USULAN]**).
- Batas memori proses: `--max-old-space-size` dan `max_memory_restart` PM2.

## 8. Keamanan Operasional

HTTPS dengan pembaruan sertifikat otomatis, firewall hanya membuka 80/443/SSH (SSH berbasis kunci), `fail2ban` bila belum ada, akses aaPanel tidak dibagikan lewat tautan/screenshot yang memuat token sesi.

## 9. Go-Live Checklist (dilengkapi di Fase 7)

- [ ] Empat syarat di §1 beres
- [ ] Super Admin pertama dibuat lewat `npm run admin:create`; masuk lewat `/masuk` berhasil; operator uji dibuat dari halaman Akun dan wajib mengganti sandi sementara
- [ ] Backup + uji restore berhasil
- [ ] Header keamanan, HTTPS, rate limit terverifikasi
- [ ] Seluruh tes (unit, integrasi, E2E, otorisasi, aksesibilitas) lulus
- [ ] Pratinjau berbagi (Open Graph/Twitter) dicek di URL produksi dengan alat validator platform (Facebook Sharing Debugger, validator schema.org). Gambar berbagi masih logo kecil 73x100 (OQ-04); ganti saat logo besar tersedia
- [ ] Sitemap, robots, metadata diverifikasi di URL produksi (`/robots.txt` harus `Allow: /` dan berisi `Sitemap:`; `/sitemap.xml` memakai domain produksi). Pastikan `APP_ENV=production` dan `APP_URL` terisi di server.
- [ ] `AUTH_SECRET` terisi; `DEV_LOGIN` **tidak** ada di environment staging/produksi (bila ada, semua request menjawab 500)
- [ ] Rencana pengisian awal oleh operator siap (katalog kosong saat awal), termasuk formulir persetujuan dosen (OQ-28)
- [ ] Persetujuan tertulis pengguna untuk rilis produksi
