# DECISIONS — Keputusan & Open Questions

Status: **Fase 0–4 disetujui pengguna (2026-11-03). ADR-001 sampai ADR-007 disetujui. Fase 5 (Development) berjalan.**
**Perubahan arah 2026-11-04 (ADR-008, D-15 s/d D-20): operator sebagai satu-satunya penginput dan satu-satunya pengguna yang login. ADR-008 dan dokumen turunannya menunggu persetujuan pengguna sebelum kode diubah.**

## Keputusan yang sudah dikonfirmasi pengguna (2026-11-03)

| # | Topik | Keputusan | Catatan |
|---|---|---|---|
| D-01 | Pemilik/pengelola platform | Pengguna (web@uninus.ac.id) | Risiko ketergantungan satu orang, lihat R-06 di PRD. |
| D-02 | Autentikasi | ~~Diintegrasikan ke SSO UNINUS~~ **Digantikan D-16 (2026-11-04):** tanpa SSO | Semula: tanpa password lokal. |
| D-03 | Data awal | Mulai dari kosong (0 data) | Tidak ada migrasi data. Tidak ada seed produksi. |
| D-04 | Identitas visual | Logo UNINUS + acuan SSO: hijau `#008F4F`, emas `#FBC02D`, font Plus Jakarta Sans | Kontras aksesibilitas tetap harus diuji di Fase 4. |
| D-05 | Domain | `inovasi.uninus.ac.id` | |
| D-06 | Verifikasi | ~~Satu tingkat~~ **Digantikan D-17 (2026-11-04):** tanpa tahap verifikasi, Draft → Terbit | Semula: Operator/admin memeriksa, lalu Approved → Published. |
| D-07 | Hosting | VPS Ubuntu 24 + aaPanel (4 core, 7,7 GB RAM, disk 154 GB). Node.js, PostgreSQL, SSH tersedia | Server dipakai bersama website lain yang dikelola pengguna. |
| D-08 | Profil peneliti | ~~Bersumber dari SSO~~ **Digantikan D-15 (2026-11-04):** diinput operator | Semula: detail field SSO di OQ-02 (kini tidak berlaku). |
| D-09 | Kolaborasi tim | Rekan pengguna (admin SSO) bergabung di git setelah tampilan website ada | Repo git belum dibuat, lihat OQ-08. |
| D-10 | Penyederhanaan stack | Pengguna mengizinkan usulan penyederhanaan | Lihat ADR-001 (disetujui). |
| D-11 | Palet dan aturan pemakaian warna | Disetujui: `#008F4F` identitas, `#00703E` untuk teks/tombol, emas hanya aksen, lihat `UI_UX_GUIDELINES.md` §2 | Hasil uji kontras WCAG |
| D-12 | Wireframe Fase 4 | Disetujui | |
| D-13 | Logo | `brand/logo-uninus.png` dari pengguna (73×100 px, resolusi sangat kecil) | Lihat OQ-04 |
| D-14 | Repositori | GitHub milik pengguna, dibuat pengguna. Rekan (admin SSO) ikut berkolaborasi | Menggantikan OQ-08 |
| D-15 | Pengisi konten | Hanya operator. Dosen menyerahkan berkas fisik ke operator, operator menginput | Dosen tidak punya akun. Profil peneliti adalah data yang diketik operator (2026-11-04) |
| D-16 | Autentikasi | Tanpa SSO (hasil diskusi pengguna dengan pihak terkait). Hanya operator/super admin yang login | Mekanisme login pengganti: ADR-008, menunggu persetujuan (2026-11-04) |
| D-17 | Alur status | Draft → Terbit (tanpa Diajukan/Ditinjau/Revisi/Disetujui). Tarik (Unpublished) tetap ada | Pengguna menjawab "pakai draft boleh"; ditafsirkan sebagai Draft → Published langsung, konfirmasi di ADR-008 (2026-11-04) |
| D-18 | Cakupan konten | Tetap katalog inovasi (bukan publikasi jurnal/prosiding) | 2026-11-04 |
| D-19 | Kolaborasi | Fitur permintaan kolaborasi dihapus dari cakupan | Tidak ada form publik, rute `/kolaborasi`, maupun penanganan permintaan (2026-11-04) |
| D-20 | Portal dosen | Dinonaktifkan, bukan dihapus (saran, menunggu persetujuan) | Kode dan skema tetap, ditutup feature flag, agar bisa dibuka lagi bila dosen kelak diberi akses |

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
- **Tambahan:** `output: 'standalone'`. Build awal menghasilkan ±1.450 file di `.next/standalone` (acuan pemantauan inode, lihat `DEPLOYMENT.md`). Setelah `argon2`, `sharp`, dan fitur admin/berkas (2026-11-09): ±2.300 file (node_modules 1.430, `.next` 860). Jalur `STORAGE_PATH` diberi `/*turbopackIgnore*/` supaya Next tidak menelusuri seluruh proyek ke paket.
- **Peringatan agent:** versi ini berbeda dari pengetahuan umum. Baca `node_modules/next/dist/docs/` sebelum menulis kode Next.js (tercatat di `AGENTS.md`).

## ADR-008 — Operator sebagai satu-satunya penginput dan pengguna login (Disetujui 2026-11-04)

- **Konteks:** setelah berdiskusi dengan pihak terkait, tidak ada SSO, dan pada tahap awal dosen tidak login. Dosen menyerahkan berkas fisik, operator yang menginput (D-15 s/d D-19).
- **Keputusan yang sudah dari pengguna:** D-15 sampai D-19. **Yang diusulkan agent, perlu persetujuan:** butir 1–4 di bawah.
- **Status implementasi:** butir 2, 3, dan 4 sudah dikodekan dan diuji (alur Draft → Terbit, CRUD peneliti, flag `RESEARCHER_PORTAL`, kolaborasi tidak dibuat). **Butir 1 (login lokal) juga sudah**: argon2id (paket `argon2`, disetujui pengguna 2026-11-04), minimal 12 karakter, tanpa 2FA, penguncian 15 menit setelah 5 gagal, sandi diatur ulang hanya oleh super admin atau CLI, sandi sementara wajib diganti, halaman Akun untuk super admin, `npm run admin:create` untuk akun pertama. Rincian kontrol di `SECURITY.md` §2.
- **Usulan:**
  1. **Login lokal** email + kata sandi untuk operator/super admin. Hash argon2id, rate limiting dan penguncian sementara setelah gagal berulang, pesan error generik, sesi opaque yang sudah ada tetap dipakai (ADR-004), CSRF dan cookie tidak berubah. Akun dibuat oleh super admin; super admin pertama lewat perintah CLI sekali jalan. Atur ulang kata sandi oleh super admin (tanpa email, karena SMTP belum ada, OQ-14). Login dev tetap hanya untuk development.
  2. **Alur status:** `draft → published`, `published → unpublished`, `unpublished → published`, `unpublished → draft`. Nilai enum lama (`submitted`, `under_review`, `approved`, `revision_required`) dibiarkan di database supaya tidak ada migrasi destruktif, tetapi tidak bisa dicapai lewat state machine. Syarat terbit: field wajib sama seperti syarat "ajukan" sebelumnya (judul, ringkasan, kategori, ketua peneliti).
  3. **Dosen/peneliti = data, bukan akun.** Operator mengelola peneliti (CRUD) dan memilih ketua/anggota dari data itu. `researchers.user_id` nullable. Peran `researcher` dan portal `/dosen` ditutup feature flag `RESEARCHER_PORTAL` (default mati) alih-alih dihapus (D-20).
  4. **Kolaborasi dihapus** dari MVP (D-19).
- **Alasan:** satu jalur masuk lebih kecil permukaan serangannya dan lebih cepat dibangun. Menutup lewat flag lebih murah daripada menghapus lalu menulis ulang bila dosen kelak diberi akses.
- **Konsekuensi dan risiko:**
  - Kata sandi lokal berarti kita yang bertanggung jawab atas penyimpanannya (SECURITY.md diperbarui). Mengharuskan dependensi hashing baru (OQ-27), jadi menunggu persetujuan.
  - Pemisahan tugas dan tinjauan dua orang hilang. Kontrol kualitas kini bergantung pada operator dan audit log.
  - Data dosen diketik pihak ketiga: butuh dasar persetujuan (OQ-28).
- **Dampak dokumen:** PRD, USER_ROLES, WORKFLOW diperbarui bersama ADR ini. SYSTEM_ARCHITECTURE §4, SECURITY, API_DOCUMENTATION, DATABASE_DESIGN, DEPLOYMENT, dan UI_UX_GUIDELINES diberi catatan dan akan disesuaikan saat kodenya diubah.

## Open Questions

**Ditutup/tidak berlaku oleh ADR-008 (dan OQ-09 kini juga diimplementasikan: visibilitas per berkas oleh operator):** OQ-02 (SSO), OQ-03 (pemetaan role SSO), OQ-05 (tetap di luar MVP), OQ-07 (kolaborasi dihapus), OQ-09 (operator yang menentukan dokumen publik), OQ-13 (operator mengedit langsung), OQ-21 dan OQ-25 (tidak ada dosen yang login). OQ-14 (SMTP) tidak lagi menghalangi, karena tidak ada notifikasi ke dosen maupun form kolaborasi.

- ~~**OQ-27**~~ **Dijawab 2026-11-04:** `argon2` (argon2id); minimal 12 karakter; tanpa 2FA dulu (dapat dievaluasi lagi setelah ada email/SMTP, OQ-14); atur ulang oleh super admin tanpa email. Konsekuensi yang diterima: akun bisa dikunci 15 menit oleh pihak lain yang tahu emailnya, dan pembatas laju hanya per proses (tanpa per IP sampai OQ-20 beres).
- **OQ-28:** Dasar menerbitkan data dosen yang diketik operator. Perlu formulir persetujuan tertulis dari dosen (berkas fisik yang diserahkan sekaligus menjadi bukti), siapa yang menyimpan arsipnya, dan apa yang dilakukan bila dosen meminta data dihapus (UU PDP). NIDN/NIP tetap tidak pernah tampil di publik; usul: tidak disimpan sama sekali kecuali memang dibutuhkan.
- **OQ-29:** Kerja input satu orang: perlu impor CSV/Excel untuk data awal dalam jumlah besar? Dan pemindaian berkas fisik: siapa yang memindai, format (PDF), batas ukuran (terkait OQ-16, OQ-19).

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
- **OQ-12:** Daftar awal jenis inovasi, kategori, dan status HKI/paten (jangan dikarang, perlu dari pengguna/institusi). Juga daftar resmi fakultas dan program studi. **Dampak nyata:** pengajuan mewajibkan minimal satu kategori, jadi selama tabel `categories` kosong tidak ada inovasi yang bisa diajukan. Tes memakai kategori `[DUMMY]`; di lingkungan nyata data ini harus diisi (lewat modul admin taksonomi atau seed dari daftar resmi) sebelum dosen mulai.
- **OQ-13:** Cara dosen mengubah inovasi yang sudah terpublikasi. Rekomendasi: operator mengembalikan ke draft (lihat `WORKFLOW.md` §4).
- **OQ-14:** Layanan email (SMTP) yang tersedia untuk notifikasi dan formulir kolaborasi, dan alamat pengirim resmi.
- **OQ-15:** Perlu staging di server yang sama (menambah beban) atau cukup lokal + produksi?
- ~~**OQ-16**~~ **Dijawab 2026-11-09:** gambar 5 MB, PDF 20 MB, 20 berkas per inovasi; dapat diubah lewat `UPLOAD_MAX_IMAGE_MB` dan `UPLOAD_MAX_DOC_MB`. Estimasi volume (OQ-06) masih perlu untuk perencanaan disk.
- **OQ-17:** Slug yang tidak ada di `/inovasi/{slug}` saat ini tampil sebagai halaman 404 dengan `noindex`, tetapi status HTTP-nya 200 (soft 404), karena konten dirender dalam `Suspense` sesuai aturan Cache Components Next 16. Untuk 404 sungguhan perlu pengecekan slug di `proxy.ts` (memakai database) atau `generateStaticParams`. Putuskan setelah katalog terhubung ke database.
- **OQ-18:** Anggota tim yang profilnya tidak publik (`researchers.is_public = false`) tetap tampil namanya di halaman inovasi, tetapi tanpa tautan profil. Alasan: nama anggota adalah bagian dari inovasi yang sudah diverifikasi. Konfirmasi apakah peneliti boleh menyembunyikan namanya sama sekali.
- ~~**OQ-19**~~ **Selesai 2026-11-09:** modul berkas dan sampul diimplementasikan (`StorageAdapter` lokal, `sharp`, halaman edit inovasi memuat bagian Berkas). Kartu tanpa sampul tetap memakai pengganti netral.
- **OQ-20:** Kolom `ip` di `sessions` dan `audit_logs` sengaja dibiarkan kosong. Di balik proxy aaPanel/nginx, IP klien ada di `X-Forwarded-For`, dan header itu hanya boleh dipercaya bila proxy yang mengaturnya. Perlu diputuskan saat deployment (dan konfigurasi proxy dipastikan menimpa header itu), karena IP dari header yang bisa dipalsukan di log audit menyesatkan.
- **OQ-21:** Pemilihan anggota/ketua tim: layanan menerima peneliti mana pun yang belum dihapus (termasuk profil non-publik), karena anggota bisa saja belum pernah login. Endpoint pencarian peneliti untuk pemilih di form belum ada; perlu diputuskan apakah dosen boleh mencari semua peneliti atau hanya yang publik, dan bagaimana menambah anggota yang belum punya profil (operator, atau dosen mengusulkan). **Diimplementasikan sementara (usulan, belum disetujui):** `GET /me/researchers?q=` hanya mencari profil publik; anggota yang belum punya profil publik belum bisa ditambahkan.
- **OQ-22:** Slug dibuat dari judul saat draft dibuat dan tidak berubah saat judul diedit (URL stabil). Konsekuensi: slug bisa tidak lagi mencerminkan judul final. Alternatif: operator dapat menyusun ulang slug sebelum publikasi pertama (slug baru terkunci pada `first_published_at`, WORKFLOW §3 aturan 5).
- **OQ-23:** Operator memakai izin `innovation.update_any` dan dapat mengedit inovasi yang sudah terbit; perubahannya langsung tampil di publik tanpa pemeriksaan ulang (hanya tercatat di audit log: nama field, bukan isi). Perlu diputuskan apakah suntingan atas inovasi terbit harus melalui tarik-lalu-terbit-ulang, atau disimpan dengan riwayat isi.
- **OQ-24:** Simpan otomatis formulir dan tes E2E browser ditunda. Simpan otomatis butuh keputusan perilaku saat validasi gagal di tengah pengetikan. Tes E2E butuh Playwright (dependensi baru + unduhan browser), jadi menunggu persetujuan; sampai itu, interaksi klien formulir belum teruji otomatis.
- **OQ-25:** Operator yang membuka `/dosen/inovasi/{id}` milik dosen melihat isi lengkap (hak baca-semua), tetapi halaman itu dirancang untuk pemilik. Halaman tinjau yang benar ada di `/admin/inovasi/{id}`. Perlu diputuskan apakah rute dosen harus menolak non-pemilik (404) atau dibiarkan.
- **OQ-26:** Kebijakan indeks mesin pencari: hanya halaman tanpa kata kunci, filter, atau halaman lanjutan yang diindeks (`/inovasi`, detail inovasi, profil peneliti, lewat `sitemap.xml`). Variasi `/inovasi?...` diberi `noindex,follow` dan canonical ke `/inovasi` agar tidak menimbun URL turunan. Konsekuensinya halaman filter populer (mis. per fakultas) tidak bisa muncul sendiri di Google. Perlu dikonfirmasi apakah halaman filter tertentu (kategori/fakultas) perlu dibuat indexable dengan URL bersih.
