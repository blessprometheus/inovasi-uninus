# TESTING — Inovasi UNINUS

Status: **berjalan (Fase 5).** Dokumen ini mencerminkan tes yang benar-benar ada. Jangan menyatakan fitur selesai bila tesnya belum lulus.

## 1. Lapisan Tes

| Lapisan | Alat | Lokasi | Perintah | Butuh database |
|---|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` | `npm test` | Tidak |
| Integrasi | Vitest + PostgreSQL asli | `src/**/*.int.test.ts` | `npm run test:integration` | Ya (`DATABASE_URL_TEST`) |
| E2E | Playwright | belum ada | belum | Ya |
| Statis | ESLint, TypeScript | semua | `npm run lint`, `npm run typecheck` | Tidak |

Tes integrasi memakai PostgreSQL **asli**, bukan mock, supaya constraint, indeks parsial, dan kolom ter-generate benar-benar diuji.

## 2. Database Tes

- Wajib database terpisah, namanya **berakhiran `_test`**, dan berbeda dari `DATABASE_URL`. Pembantu `setupTestDb()` menolak jalan bila syarat ini tidak terpenuhi, sehingga tes tidak akan pernah mengosongkan data pengembangan atau produksi.
- Setiap tes diawali pengosongan semua tabel aplikasi. Jangan taruh data berharga di database ini.
- Setup lokal: buat role dan dua database (`inovasi_dev`, `inovasi_test`), isi `.env.local` dari `.env.example`.

## 3. Cakupan Saat Ini

| Area | Tes | Jenis |
|---|---|---|
| State machine workflow | Matriks lengkap setiap pasangan status × aktor, pemisahan tugas, catatan wajib, penguncian edit, visibilitas publik | Unit (9 tes) |
| Otorisasi inovasi | Tanpa sesi dan orang lain selalu NOT_FOUND, pemilik dibatasi status, operator, anggota tim hanya baca, role dicabut | Unit (13 tes) |
| Slug | Normalisasi, karakter berbahaya/path traversal, batas panjang, keunikan | Unit (10 tes) |
| Token sesi dan CSRF | Token acak dan hash, masa berlaku idle/absolut, cek Origin, token CSRF terikat sesi | Unit (9 tes) |
| Validasi inovasi | Field wajib, trim dan null, penolakan field terlarang (status/slug/pemilik), tahun, UUID, tim peneliti, tautan hanya http/https, kelengkapan pengajuan | Unit (13 tes) |
| Validasi kolaborasi dan format respons API | Persetujuan wajib, normalisasi email, telepon, honeypot, detail galat tanpa nilai input, pemetaan status HTTP | Unit (10 tes) |
| Provider katalog | Urutan pilihan dummy, PostgreSQL, kosong; dummy tidak pernah di produksi, teks dummy berawalan [DUMMY], paginasi, detail per slug (`getBySlug`) | Unit (9 tes) |
| Provider peneliti | Urutan pilihan dummy, PostgreSQL, kosong; tanpa NIDN/NIP di data dummy, pencarian dan paginasi | Unit (7 tes) |
| Konfigurasi situs (`APP_URL`, `APP_ENV`) | URL dasar dinormalkan dan menolak skema non-http(s); hanya `APP_ENV=production` yang boleh diindeks | Unit (3 tes) |
| Sitemap | Hanya halaman statis bila kosong, URL inovasi/peneliti dengan lastModified dari data, tidak pernah memuat rute admin/dosen/api | Unit (3 tes) |
| Parameter daftar (`?q=&page=`) | Default, pemangkasan q, nilai berulang, halaman tidak valid dan batas atas | Unit (4 tes) |
| Provider PostgreSQL (katalog) | Hanya published dan tidak terhapus (pencarian, detail, sitemap, beranda), pencarian judul/ringkasan, `%`/`_` bukan wildcard, input SQL aneh aman, paginasi, unggulan vs terbaru, statistik, detail lengkap | Integrasi (9 tes) |
| Provider PostgreSQL (peneliti) | Hanya profil publik dan tidak terhapus, NIDN/NIP tidak keluar, jumlah dan daftar inovasi hanya yang terbit, tautan eksternal hanya http/https | Integrasi (7 tes) |
| Skema database | Email huruf kecil dan unik, slug unik, batas tahun, satu ketua per inovasi, satu sampul per inovasi, sumber berkas sesuai jenis, tautan hanya http/https, cascade hapus, pencarian teks dan trigram | Integrasi |
| Seed RBAC | Sesuai `USER_ROLES.md`, pemisahan hak role, idempotent | Integrasi |

## 4. Wajib Ditambahkan Seiring Modul

- **Otorisasi:** untuk setiap permission, role yang tidak berhak mendapat 403, resource milik orang lain mendapat 404, tanpa sesi mendapat 401.
- **API:** validasi input, format error, rate limit.
- **Upload:** ukuran, MIME, magic bytes, ekstensi berbahaya.
- **E2E:** katalog, detail, pengajuan, verifikasi, kolaborasi.
- **Aksesibilitas dan responsif:** otomatis + pemeriksaan manual di 375, 768, 1024, 1440 px.
- **Bug fix:** wajib disertai tes yang mereproduksi bug.
