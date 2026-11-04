# DECISIONS — Keputusan & Open Questions

Status: **Fase 0–4 disetujui pengguna (2026-11-03). ADR-001 sampai ADR-006 disetujui. Siap masuk Fase 5 (Development) setelah repo GitHub dibuat.**

## Keputusan yang sudah dikonfirmasi pengguna (2026-11-03)

| # | Topik | Keputusan | Catatan |
|---|---|---|---|
| D-01 | Pemilik/pengelola platform | Pengguna (web@uninus.ac.id) | Risiko ketergantungan satu orang, lihat R-06 di PRD. |
| D-02 | Autentikasi | Diintegrasikan ke SSO UNINUS (OAuth2/OIDC, Laravel Passport, login Google `@uninus.ac.id`) | Tidak ada password lokal. |
| D-03 | Data awal | Mulai dari kosong (0 data) | Tidak ada migrasi data. Tidak ada seed produksi. |
| D-04 | Identitas visual | Logo UNINUS + acuan SSO: hijau `#008F4F`, emas `#FBC02D`, font Plus Jakarta Sans | Kontras aksesibilitas tetap harus diuji di Fase 4. |
| D-05 | Domain | `inovasi.uninus.ac.id` | |
| D-06 | Verifikasi | Satu tingkat | Operator/admin memeriksa, lalu Approved → Published. |
| D-07 | Hosting | VPS Ubuntu 24 + aaPanel (4 core, 7,7 GB RAM, disk 154 GB). Node.js, PostgreSQL, SSH tersedia | Server dipakai bersama website lain yang dikelola pengguna. |
| D-08 | Profil peneliti | Bersumber dari SSO | Detail field yang tersedia di SSO: OQ-02. |
| D-09 | Kolaborasi tim | Rekan pengguna (admin SSO) bergabung di git setelah tampilan website ada | Repo git belum dibuat, lihat OQ-08. |
| D-10 | Penyederhanaan stack | Pengguna mengizinkan usulan penyederhanaan | Lihat ADR-001 (disetujui). |
| D-11 | Palet dan aturan pemakaian warna | Disetujui: `#008F4F` identitas, `#00703E` untuk teks/tombol, emas hanya aksen, lihat `UI_UX_GUIDELINES.md` §2 | Hasil uji kontras WCAG |
| D-12 | Wireframe Fase 4 | Disetujui | |
| D-13 | Logo | `brand/logo-uninus.png` dari pengguna (73×100 px, resolusi sangat kecil) | Lihat OQ-04 |
| D-14 | Repositori | GitHub milik pengguna, dibuat pengguna. Rekan (admin SSO) ikut berkolaborasi | Menggantikan OQ-08 |

## ADR-001 — Bentuk arsitektur aplikasi (Disetujui 2026-11-03)

- **Konteks:** server bersama, load tinggi, inode penuh (lihat OQ-01). Dua proses Node.js terpisah menambah RAM dan jumlah file.
- **Opsi A:** Next.js (App Router, SSR) + Fastify terpisah + PostgreSQL (sesuai master prompt).
- **Opsi B (direkomendasikan):** satu aplikasi Next.js (UI + API lewat route handler dengan lapisan service terpisah) + PostgreSQL. Satu proses, satu deploy.
- **Alasan Opsi B:** sumber daya server terbatas, tim kecil, dan SEO/SSR sudah ditangani Next.js. Lapisan service dan validasi dipisah dari route handler supaya backend bisa dipecah ke Fastify nanti tanpa menulis ulang logika.
- **Konsekuensi:** kontrak API tetap didokumentasikan (`docs/API_DOCUMENTATION.md`). ORM (Prisma atau Drizzle) dipilih di Fase 3.
- **Keputusan final:** menunggu persetujuan pengguna (Fase 3). Rincian di `SYSTEM_ARCHITECTURE.md`.

## ADR-002 — Penyederhanaan skema database (Disetujui 2026-11-03)

Menunda `research_projects`/`research_members`, menggabungkan media dan dokumen menjadi `innovation_files`, menambah `innovation_types`, `sessions`, `role_permissions`. Alasan dan tabel evaluasi di `DATABASE_DESIGN.md` §1.

## ADR-003 — ORM: Drizzle (Disetujui 2026-11-03)

- **Opsi:** Prisma vs Drizzle.
- **Keputusan:** Drizzle. Tanpa engine biner terpisah (hemat RAM/disk di server bersama), SQL eksplisit untuk query pencarian (`tsvector`, `pg_trgm`) dan indeks parsial, migrasi berbasis SQL yang mudah ditinjau rekan satu tim.
- **Konsekuensi:** ekosistem dan tooling lebih kecil dari Prisma, tim perlu nyaman menulis SQL.

## ADR-004 — Sesi di database + OIDC client (Disetujui 2026-11-03)

Sesi opaque di tabel `sessions` (bukan JWT di browser), SSO sebagai OIDC provider (Authorization Code + PKCE). Alasan: bisa dicabut, tanpa Redis, tanpa token sensitif di browser. Rincian di `SYSTEM_ARCHITECTURE.md` §4.

## ADR-005 — Penyimpanan file lokal dengan `StorageAdapter` (Disetujui 2026-11-03)

File di sistem file server di luar web root, dilayani lewat izin aplikasi, dengan antarmuka adapter agar bisa pindah ke S3-compatible. Tidak menambah layanan (MinIO) di server yang sudah jenuh. Strategi cegah inode habis di `SYSTEM_ARCHITECTURE.md` §7.

## ADR-006 — Teks panjang sebagai teks biasa (Disetujui 2026-11-03)

Tidak ada editor rich-text/HTML di MVP. Mengurangi permukaan XSS dan kompleksitas sanitasi. Dapat dievaluasi ulang (mis. Markdown terbatas) bila ada kebutuhan.

## ADR-007 — Versi Next.js 16 dengan Cache Components (Disetujui 2026-11-03)

- **Konteks:** `create-next-app` terbaru memasang Next.js 16.4.4 dengan `cacheComponents` dan `partialPrefetching` aktif (default framework, akan menjadi standar di versi mayor berikutnya).
- **Keputusan:** mengikuti default. Cocok dengan rencana cache berbasis tag (`use cache` + `cacheTag`) di `SYSTEM_ARCHITECTURE.md` §6. Konsekuensi: akses data runtime (cookies/session) harus di dalam batas `Suspense`.
- **Tambahan:** `output: 'standalone'`. Build awal menghasilkan ±1.450 file di `.next/standalone` (acuan pemantauan inode, lihat `DEPLOYMENT.md`).
- **Peringatan agent:** versi ini berbeda dari pengetahuan umum. Baca `node_modules/next/dist/docs/` sebelum menulis kode Next.js (tercatat di `AGENTS.md`).

## Open Questions

- **OQ-01 (kritis):** Kapasitas server. Screenshot aaPanel (2026-11-03): load average 7,11/7,75/7,73 pada 4 core ("High"), **inode 100%**, `/www/backup` 0 GB (belum ada backup), peringatan kerentanan PHP belum ditangani. Perlu ditelusuri sebelum deployment: proses apa yang memakai CPU dan inode terbanyak, dan bagaimana rencana backup.
- **OQ-02 (kritis):** Detail integrasi SSO. Field apa yang dikembalikan endpoint UserInfo (nama, email, NIDN/NIP, unit kerja/fakultas, role)? Apakah ada fakultas dan program studi? Rekan admin SSO perlu menyediakan contoh respons nyata dan mendaftarkan client OAuth (redirect URI untuk staging dan produksi).
- **OQ-03:** Pemetaan role SSO (`super-admin`, `admin`, `dosen`, `staff`, `mahasiswa`) ke role platform (Super Admin, Operator, Dosen). Usulan: dosen otomatis dari SSO, Operator ditetapkan lokal oleh Super Admin.
- **OQ-04:** Logo di `brand/logo-uninus.png` hanya 73×100 px, terlalu kecil untuk header (buram di layar retina) dan untuk Open Graph. Versi besar ada di proyek lain (mis. `sso-uninus/public/img/logo-uninus.png`, 1863×2560 px) tetapi belum disalin. Perlu keputusan sumber resmi, idealnya SVG, dan panduan penggunaan logo.
- **OQ-05:** Integrasi SINTA/Google Scholar: perlu, ditunda, atau tidak? Usulan: di luar MVP.
- **OQ-06:** Perkiraan volume (jumlah inovasi, dosen, ukuran file) untuk batas upload dan storage.
- **OQ-07:** Siapa yang menerima dan melayani permintaan kolaborasi (operator, atau diteruskan ke email peneliti)?
- ~~**OQ-08:**~~ Terjawab (D-14). Sisa: nama repo, visibilitas (privat/publik), dan kapan `git init` dijalankan.
- **OQ-09:** Kebijakan dokumen: siapa yang menentukan dokumen mana yang boleh diunduh publik (peneliti saat mengajukan, atau operator saat verifikasi)?
- **OQ-10:** Mahasiswa sebagai peneliti/anggota tim: apakah anggota non-dosen perlu ditampilkan di halaman inovasi?
- **OQ-11:** Bahasa konten: hanya Indonesia, atau perlu versi Inggris untuk mitra internasional?
- **OQ-12:** Daftar awal jenis inovasi, kategori, dan status HKI/paten (jangan dikarang, perlu dari pengguna/institusi). Juga daftar resmi fakultas dan program studi.
- **OQ-13:** Cara dosen mengubah inovasi yang sudah terpublikasi. Rekomendasi: operator mengembalikan ke draft (lihat `WORKFLOW.md` §4).
- **OQ-14:** Layanan email (SMTP) yang tersedia untuk notifikasi dan formulir kolaborasi, dan alamat pengirim resmi.
- **OQ-15:** Perlu staging di server yang sama (menambah beban) atau cukup lokal + produksi?
- **OQ-16:** Batas ukuran upload final dan estimasi volume (lihat OQ-06). Usulan awal: gambar 5 MB, PDF 20 MB.
- **OQ-17:** Slug yang tidak ada di `/inovasi/{slug}` saat ini tampil sebagai halaman 404 dengan `noindex`, tetapi status HTTP-nya 200 (soft 404), karena konten dirender dalam `Suspense` sesuai aturan Cache Components Next 16. Untuk 404 sungguhan perlu pengecekan slug di `proxy.ts` (memakai database) atau `generateStaticParams`. Putuskan setelah katalog terhubung ke database.
- **OQ-18:** Anggota tim yang profilnya tidak publik (`researchers.is_public = false`) tetap tampil namanya di halaman inovasi, tetapi tanpa tautan profil. Alasan: nama anggota adalah bagian dari inovasi yang sudah diverifikasi. Konfirmasi apakah peneliti boleh menyembunyikan namanya sama sekali.
- **OQ-19:** Sampul inovasi (`coverUrl`) masih `null` di provider PostgreSQL sampai modul penyimpanan berkas (StorageAdapter) dibuat; kartu memakai pengganti netral.
- **OQ-20:** Kolom `ip` di `sessions` dan `audit_logs` sengaja dibiarkan kosong. Di balik proxy aaPanel/nginx, IP klien ada di `X-Forwarded-For`, dan header itu hanya boleh dipercaya bila proxy yang mengaturnya. Perlu diputuskan saat deployment (dan konfigurasi proxy dipastikan menimpa header itu), karena IP dari header yang bisa dipalsukan di log audit menyesatkan.
