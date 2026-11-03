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
| Skema database | Email huruf kecil dan unik, slug unik, batas tahun, satu ketua per inovasi, satu sampul per inovasi, sumber berkas sesuai jenis, tautan hanya http/https, cascade hapus, pencarian teks dan trigram | Integrasi |
| Seed RBAC | Sesuai `USER_ROLES.md`, pemisahan hak role, idempotent | Integrasi |

## 4. Wajib Ditambahkan Seiring Modul

- **Otorisasi:** untuk setiap permission, role yang tidak berhak mendapat 403, resource milik orang lain mendapat 404, tanpa sesi mendapat 401.
- **API:** validasi input, format error, rate limit.
- **Upload:** ukuran, MIME, magic bytes, ekstensi berbahaya.
- **E2E:** katalog, detail, pengajuan, verifikasi, kolaborasi.
- **Aksesibilitas dan responsif:** otomatis + pemeriksaan manual di 375, 768, 1024, 1440 px.
- **Bug fix:** wajib disertai tes yang mereproduksi bug.
