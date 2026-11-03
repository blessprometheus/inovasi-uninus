# PRD — Inovasi UNINUS

Status: **DRAFT untuk persetujuan (Fase 2).** Belum ada keputusan arsitektur final (lihat `DECISIONS.md`).
Pemilik produk: web@uninus.ac.id. Domain: `inovasi.uninus.ac.id`. Tagline awal: "Inovasi dan Karya untuk Masa Depan".

## 1. Tujuan

Menyediakan katalog digital terpusat untuk hasil penelitian dan inovasi dosen UNINUS yang mudah dicari publik, dikelola lewat alur verifikasi, dan membuka peluang kolaborasi.

Masalah yang diselesaikan: inovasi tersebar dan belum terdokumentasi terpusat, masyarakat sulit menemukannya, dan calon mitra tidak punya jalur kontak yang jelas.

**Tujuan terukur (usulan, perlu disetujui):**
- Dosen dapat mengajukan inovasi dan melihat statusnya sendiri tanpa bantuan operator.
- Pengunjung dapat menemukan inovasi lewat pencarian atau filter dalam kurang dari 3 interaksi.
- Setiap inovasi terpublikasi punya URL permanen yang dapat diindeks mesin pencari.

**Di luar cakupan versi pertama:** integrasi SINTA, pembayaran, aplikasi mobile, multi-bahasa, forum/komentar, AI recommendation. Semua dapat dipertimbangkan setelah MVP.

## 2. Kondisi Awal & Batasan

- Data awal kosong (D-03). Peluncuran tanpa konten, jadi perlu rencana onboarding dosen.
- Login hanya lewat SSO UNINUS (D-02). Akun non-`@uninus.ac.id` tidak bisa login. Pengunjung publik tidak perlu login.
- Hosting: VPS bersama dengan website lain, kapasitas terbatas (OQ-01). Aplikasi harus hemat sumber daya.
- Tim awal satu orang, kolaborator bergabung setelah tampilan tersedia (D-09).

## 3. Peran Pengguna

| Peran | Sumber akun | Ringkasan hak akses |
|---|---|---|
| Pengunjung | Tanpa login | Melihat dan mencari katalog, melihat profil peneliti, mengunduh dokumen publik, mengajukan permintaan kolaborasi |
| Dosen/Peneliti | SSO | Mengelola profil sendiri, membuat/mengedit/mengajukan inovasi miliknya, melihat status dan riwayat |
| Operator | Ditetapkan Super Admin | Mengelola data inovasi/peneliti/kategori, memverifikasi pengajuan, menangani permintaan kolaborasi |
| Super Admin | Ditetapkan lokal (bootstrap awal) | Semua hak Operator, plus pengguna dan role, pengaturan website, audit log |

RBAC dirancang berbasis permission (bukan hardcode role) agar role baru tidak mengubah arsitektur. Matriks lengkap dibuat di Fase 3 (`USER_ROLES.md`).

## 4. Alur Verifikasi (satu tingkat)

```
Draft → Submitted → Under Review → Approved → Published
                         ↓
                 Revision Required → (dosen revisi) → Submitted
```

Transisi yang diizinkan:

| Dari | Ke | Oleh |
|---|---|---|
| Draft | Submitted | Dosen pemilik |
| Submitted | Under Review | Operator/Super Admin |
| Under Review | Revision Required | Operator/Super Admin (wajib catatan) |
| Under Review | Approved | Operator/Super Admin |
| Revision Required | Submitted | Dosen pemilik |
| Approved | Published | Operator/Super Admin |
| Published | Draft/Unpublished | Operator/Super Admin (wajib alasan) |

> Sumber kebenaran alur ini adalah `WORKFLOW.md` (termasuk tarik-kembali oleh dosen dan pemisahan tugas). Bagian ini hanya ringkasan.

Aturan: transisi di luar tabel ditolak di server. Setiap transisi dicatat (siapa, kapan, dari-ke, catatan). Pengunjung hanya melihat status `Published`. Dosen tidak dapat mengedit saat `Submitted`/`Under Review`.

## 5. Sitemap

**Publik**
- `/` Beranda
- `/inovasi` Katalog (search, filter, sort, pagination)
- `/inovasi/{slug}` Detail inovasi
- `/peneliti` Direktori peneliti, `/peneliti/{slug}` profil
- `/kategori/{slug}`, `/fakultas/{slug}`
- `/tentang`, `/kolaborasi` (formulir permintaan kerja sama)
- `/sitemap.xml`, `/robots.txt`

**Dosen** `/dosen`: ringkasan, inovasi saya, tambah/edit pengajuan, upload dokumen/media, riwayat, profil.

**Admin** `/admin`: ringkasan, inovasi, verifikasi pengajuan, peneliti, fakultas, program studi, kategori, dokumen & media, permintaan kolaborasi, pengguna & role, audit log, pengaturan website.

## 6. Kebutuhan Fungsional dan Prioritas

Prioritas: **P0** = wajib MVP, **P1** = segera setelah MVP, **P2** = nanti.

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-01 | Login/logout via SSO, sesi aman, pembuatan akun lokal otomatis saat login pertama | P0 |
| FR-02 | RBAC berbasis permission pada setiap endpoint | P0 |
| FR-03 | CRUD inovasi dengan field opsional (hanya judul, kategori, peneliti, ringkasan yang wajib, usulan) | P0 |
| FR-04 | Alur verifikasi satu tingkat dengan riwayat | P0 |
| FR-05 | Katalog publik: search judul/deskripsi, filter kategori/fakultas/tahun/jenis, sort, pagination | P0 |
| FR-06 | Detail inovasi publik sesuai field di master prompt §6.A.3 | P0 |
| FR-07 | Upload gambar dan PDF dengan validasi ukuran, MIME, dan nama file | P0 |
| FR-08 | Dashboard dosen (inovasi saya, status, riwayat) | P0 |
| FR-09 | Dashboard admin: verifikasi, manajemen kategori/fakultas/prodi/peneliti | P0 |
| FR-10 | Formulir permintaan kolaborasi publik + penanganan oleh operator | P0 |
| FR-11 | SEO: metadata dinamis, Open Graph, sitemap XML, canonical, structured data | P0 |
| FR-12 | Audit log perubahan data penting | P0 |
| FR-13 | Direktori dan profil peneliti publik | P1 |
| FR-14 | Filter status HKI/paten dan prodi | P1 |
| FR-15 | Manajemen pengguna dan role dari UI | P1 |
| FR-16 | Pengaturan website (teks beranda, kontak, statistik) | P1 |
| FR-17 | Notifikasi email perubahan status | P1 |
| FR-18 | Statistik kunjungan dan sorting "terpopuler" | P1 |
| FR-19 | Integrasi SINTA | P2 |
| FR-20 | Video dan embed media | P2 |

## 7. Kebutuhan Non-Fungsional

- **Keamanan:** validasi input server-side, tanpa password lokal, secret via environment, rate limiting, upload aman, error tidak membocorkan detail, audit log. Rincian di `SECURITY.md`.
- **Performa:** halaman publik di-render server (SSR/cache), query berpaginasi dan berindeks, gambar dioptimalkan. Target uji awal (usulan): LCP < 2,5 detik pada halaman katalog dan detail.
- **Aksesibilitas:** target WCAG 2.2 AA. Kontras warna brand (hijau `#008F4F`, emas `#FBC02D`) wajib diuji, emas pada latar putih kemungkinan gagal kontras untuk teks.
- **Responsif:** desktop, tablet, mobile.
- **Ketersediaan & backup:** backup database dan file terjadwal, dan harus diuji restore, sebelum peluncuran.
- **Bahasa:** UI dan konten Bahasa Indonesia (`lang="id"`).
- **Skalabilitas sumber daya:** berjalan stabil di VPS bersama (OQ-01), tanpa layanan tambahan (Redis dan sejenisnya) kecuali disetujui.

## 8. Acceptance Criteria (MVP, ringkas)

- AC-01: Pengguna `@uninus.ac.id` dapat login lewat SSO dan masuk dashboard sesuai role. Akun lain ditolak tanpa membocorkan detail.
- AC-02: Dosen hanya dapat melihat dan mengedit inovasi miliknya. Percobaan mengakses milik orang lain mengembalikan 403/404 (diuji otomatis).
- AC-03: Status hanya berpindah sesuai tabel §4. Transisi tidak valid ditolak dan tercatat sebagai gagal.
- AC-04: Inovasi non-`Published` tidak muncul di katalog, sitemap, maupun URL langsung publik.
- AC-05: Upload ditolak bila melebihi batas ukuran, MIME tidak sesuai, atau ekstensi berbahaya.
- AC-06: Katalog mendukung kombinasi search + filter + sort + halaman, dengan state kosong dan loading.
- AC-07: Setiap halaman inovasi terpublikasi punya title, meta description, Open Graph, canonical, dan masuk `sitemap.xml`.
- AC-08: Formulir kolaborasi tervalidasi, dibatasi rate limit, dan muncul di dashboard operator.
- AC-09: Setiap perubahan status dan perubahan data penting tercatat di audit log.
- AC-10: Seluruh halaman utama lolos pemeriksaan aksesibilitas otomatis tanpa pelanggaran kritis, dan dapat dipakai di lebar 360 px.

## 9. User Stories (inti)

- Sebagai **pengunjung**, saya ingin mencari inovasi berdasarkan kata kunci dan fakultas agar menemukan penelitian relevan.
- Sebagai **calon mitra**, saya ingin mengirim permintaan kerja sama dari halaman inovasi agar tidak perlu mencari kontak manual.
- Sebagai **dosen**, saya ingin menyimpan pengajuan sebagai draft dan melengkapinya bertahap karena tidak semua data tersedia sekaligus.
- Sebagai **dosen**, saya ingin melihat alasan revisi dari operator agar tahu apa yang harus diperbaiki.
- Sebagai **operator**, saya ingin antrean pengajuan dengan filter status agar pemeriksaan tertata.
- Sebagai **super admin**, saya ingin menetapkan operator dan melihat audit log agar pengelolaan terkendali.

## 10. Risiko

| ID | Risiko | Mitigasi |
|---|---|---|
| R-01 | Server bersama jenuh (load tinggi, inode 100%) | Selesaikan OQ-01 sebelum deployment, pantau sumber daya, satu proses aplikasi (ADR-001) |
| R-02 | Integrasi SSO tertunda karena butuh admin SSO | Libatkan rekan admin SSO sejak Fase 3, siapkan mode login dev terpisah yang tidak pernah aktif di produksi |
| R-03 | Katalog kosong saat peluncuran | Rencana onboarding dosen dan target pengisian awal oleh operator |
| R-04 | Upload berbahaya | Validasi MIME, batas ukuran, penyimpanan di luar web root, nama file diacak |
| R-05 | Field SSO tidak cukup untuk profil peneliti | Verifikasi respons UserInfo nyata (OQ-02) sebelum finalisasi skema |
| R-06 | Ketergantungan pada satu pengelola | Dokumentasi lengkap, kolaborator di git, runbook deployment |
| R-07 | Warna emas brand gagal kontras | Pakai emas hanya untuk aksen non-teks, hijau gelap untuk teks |
| R-08 | Backup belum ada di server | Jadikan backup + uji restore syarat go-live |

## 11. Open Questions

Lihat `DECISIONS.md` OQ-01 sampai OQ-11. Yang memblokir Fase 3: OQ-02 (field SSO), OQ-03 (pemetaan role), OQ-09 (kebijakan dokumen).
