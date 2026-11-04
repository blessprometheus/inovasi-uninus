# DEPLOYMENT — Inovasi UNINUS

Status: **DRAFT arsitektur Fase 3.** Belum ada deployment. Dilarang mengubah server produksi tanpa persetujuan eksplisit pengguna (`AGENTS.md` §12). Panduan langkah-demi-langkah dilengkapi di Fase 7.

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

`APP_ENV`, `APP_URL`, `DATABASE_URL`, `AUTH_SECRET` (min. 32 karakter acak, beda per lingkungan), `SSO_ISSUER_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI`, `STORAGE_PATH`, `UPLOAD_MAX_IMAGE_MB`, `UPLOAD_MAX_DOC_MB`, `SMTP_*` (P1), `INITIAL_SUPER_ADMIN_EMAIL`.

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
- [ ] Client OAuth produksi terdaftar di SSO, redirect URI diuji
- [ ] Super Admin pertama dibuat lewat CLI
- [ ] Backup + uji restore berhasil
- [ ] Header keamanan, HTTPS, rate limit terverifikasi
- [ ] Seluruh tes (unit, integrasi, E2E, otorisasi, aksesibilitas) lulus
- [ ] Sitemap, robots, metadata diverifikasi di URL produksi (`/robots.txt` harus `Allow: /` dan berisi `Sitemap:`; `/sitemap.xml` memakai domain produksi). Pastikan `APP_ENV=production` dan `APP_URL` terisi di server.
- [ ] `AUTH_SECRET` terisi; `DEV_LOGIN` **tidak** ada di environment staging/produksi (bila ada, semua request menjawab 500)
- [ ] Rencana onboarding dosen siap (katalog kosong saat awal)
- [ ] Persetujuan tertulis pengguna untuk rilis produksi
