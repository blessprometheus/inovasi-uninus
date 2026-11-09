# PRD — Inovasi UNINUS

Status: **Disetujui Fase 2; REVISI 2026-11-04 (ADR-008, disetujui):** hanya operator yang menginput dan login, tanpa SSO, tanpa form kolaborasi. Lihat `DECISIONS.md` D-15 s/d D-20.
Pemilik produk: web@uninus.ac.id. Domain: `inovasi.uninus.ac.id`. Tagline awal: "Inovasi dan Karya untuk Masa Depan".

## 1. Tujuan

Menyediakan katalog digital terpusat untuk hasil penelitian dan inovasi dosen UNINUS yang mudah dicari publik. Konten diinput oleh operator dari berkas fisik yang diserahkan dosen (D-15).

Masalah yang diselesaikan: inovasi tersebar dan belum terdokumentasi terpusat, dan masyarakat sulit menemukannya.

**Tujuan terukur (usulan, perlu disetujui):**
- Operator dapat menginput inovasi dari berkas fisik, menyimpannya sebagai draft, lalu menerbitkannya tanpa bantuan teknis.
- Pengunjung dapat menemukan inovasi lewat pencarian atau filter dalam kurang dari 3 interaksi.
- Setiap inovasi terpublikasi punya URL permanen yang dapat diindeks mesin pencari.

**Di luar cakupan versi pertama:** login dosen, SSO, formulir permintaan kolaborasi (dihapus, D-19), integrasi SINTA, pembayaran, aplikasi mobile, multi-bahasa, forum/komentar, AI recommendation. Semua dapat dipertimbangkan setelah MVP.

## 2. Kondisi Awal & Batasan

- Data awal kosong (D-03). Peluncuran tanpa konten, jadi perlu rencana pengisian awal oleh operator dari berkas fisik dosen.
- Tidak ada SSO (D-16). Hanya operator dan super admin yang punya akun, dengan login lokal email + kata sandi (ADR-008, menunggu persetujuan). Dosen dan pengunjung tidak login.
- Hosting: VPS bersama dengan website lain, kapasitas terbatas (OQ-01). Aplikasi harus hemat sumber daya.
- Tim awal satu orang, kolaborator bergabung setelah tampilan tersedia (D-09).

## 3. Peran Pengguna

| Peran | Sumber akun | Ringkasan hak akses |
|---|---|---|
| Pengunjung | Tanpa login | Melihat dan mencari katalog, melihat profil peneliti, mengunduh dokumen publik |
| Dosen/Peneliti | **Tanpa akun** | Hanya sebagai data: profil dan karya diinput operator. Portal dosen dinonaktifkan (D-20) |
| Operator | Dibuat Super Admin, login lokal | Menginput dan menerbitkan inovasi, mengelola peneliti, kategori, fakultas, prodi, dan berkas |
| Super Admin | Bootstrap lewat CLI | Semua hak Operator, plus pengguna dan role, pengaturan website, audit log |

RBAC dirancang berbasis permission (bukan hardcode role) agar role baru tidak mengubah arsitektur. Matriks lengkap di `USER_ROLES.md`.

## 4. Alur Status

```
Draft → Published ⇄ Unpublished → (Draft)
```

Operator menyimpan draft dari berkas fisik, lalu menerbitkan. Terbit mensyaratkan field wajib lengkap. Menarik inovasi mewajibkan alasan. Tidak ada tahap pengajuan, tinjauan, atau revisi (D-17).

> Sumber kebenaran alur ini adalah `WORKFLOW.md`. Bagian ini hanya ringkasan.

Aturan: transisi di luar tabel ditolak di server. Setiap transisi dicatat (siapa, kapan, dari-ke, catatan). Pengunjung hanya melihat status `Published`.

## 5. Sitemap

**Publik**
- `/` Beranda
- `/inovasi` Katalog (search, filter, sort, pagination)
- `/inovasi/{slug}` Detail inovasi
- `/peneliti` Direktori peneliti, `/peneliti/{slug}` profil
- `/kategori/{slug}`, `/fakultas/{slug}`
- `/tentang`
- `/sitemap.xml`, `/robots.txt`

**Dosen** `/dosen`: **nonaktif** (D-20), tidak ada di MVP.

**Admin** `/admin`: ringkasan, inovasi (buat, edit, terbitkan, tarik), peneliti, fakultas, program studi, kategori, dokumen & media, pengguna & role, audit log, pengaturan website.

## 6. Kebutuhan Fungsional dan Prioritas

Prioritas: **P0** = wajib MVP, **P1** = segera setelah MVP, **P2** = nanti.

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-01 | Login/logout lokal (email + kata sandi) untuk operator/super admin, sesi aman, penguncian setelah gagal berulang (ADR-008) | P0 |
| FR-02 | RBAC berbasis permission pada setiap endpoint | P0 |
| FR-03 | CRUD inovasi oleh operator; draft cukup judul, syarat terbit: judul, ringkasan, kategori, ketua peneliti | P0 |
| FR-04 | Alur status Draft → Terbit → Tarik dengan riwayat | P0 |
| FR-05 | Katalog publik: search judul/deskripsi, filter kategori/fakultas/tahun/jenis, sort, pagination | P0 |
| FR-06 | Detail inovasi publik sesuai field di master prompt §6.A.3 | P0 |
| FR-07 | Upload gambar dan PDF dengan validasi ukuran, MIME, dan nama file | P0 |
| FR-08 | ~~Dashboard dosen~~ Dihapus dari MVP, dinonaktifkan (D-20) | — |
| FR-09 | Dashboard admin: manajemen inovasi, kategori/fakultas/prodi, CRUD peneliti | P0 |
| FR-10 | ~~Formulir permintaan kolaborasi~~ Dihapus (D-19) | — |
| FR-11 | SEO: metadata dinamis, Open Graph, sitemap XML, canonical, structured data | P0 |
| FR-12 | Audit log perubahan data penting | P0 |
| FR-13 | Direktori dan profil peneliti publik | P1 |
| FR-14 | Filter status HKI/paten dan prodi | P1 |
| FR-15 | Manajemen pengguna dan role dari UI | P1 |
| FR-16 | Pengaturan website (teks beranda, kontak, statistik) | P1 |
| FR-17 | ~~Notifikasi email perubahan status~~ Tidak diperlukan (tidak ada dosen login) | — |
| FR-21 | Impor CSV/Excel data awal (OQ-29) | P1 |
| FR-18 | Statistik kunjungan dan sorting "terpopuler" | P1 |
| FR-19 | Integrasi SINTA | P2 |
| FR-20 | Video dan embed media | P2 |

## 7. Kebutuhan Non-Fungsional

- **Keamanan:** validasi input server-side, kata sandi operator di-hash argon2id (tidak pernah disimpan polos), secret via environment, rate limiting, upload aman, error tidak membocorkan detail, audit log. Rincian di `SECURITY.md`.
- **Performa:** halaman publik di-render server (SSR/cache), query berpaginasi dan berindeks, gambar dioptimalkan. Target uji awal (usulan): LCP < 2,5 detik pada halaman katalog dan detail.
- **Aksesibilitas:** target WCAG 2.2 AA. Kontras warna brand (hijau `#008F4F`, emas `#FBC02D`) wajib diuji, emas pada latar putih kemungkinan gagal kontras untuk teks.
- **Responsif:** desktop, tablet, mobile.
- **Ketersediaan & backup:** backup database dan file terjadwal, dan harus diuji restore, sebelum peluncuran.
- **Bahasa:** UI dan konten Bahasa Indonesia (`lang="id"`).
- **Skalabilitas sumber daya:** berjalan stabil di VPS bersama (OQ-01), tanpa layanan tambahan (Redis dan sejenisnya) kecuali disetujui.

## 8. Acceptance Criteria (MVP, ringkas)

- AC-01: Operator dapat login dengan email + kata sandi dan masuk `/admin`. Kredensial salah ditolak dengan pesan generik, dan percobaan berulang dibatasi. Tidak ada rute login untuk dosen.
- AC-02: Pengunjung dan akun tanpa permission yang sesuai mengembalikan 401/403/404 pada semua rute admin (diuji otomatis). Portal dosen tidak dapat diakses selama `RESEARCHER_PORTAL` mati.
- AC-03: Status hanya berpindah sesuai `WORKFLOW.md`. Transisi tidak valid, termasuk ke status lama, ditolak dan tercatat sebagai gagal.
- AC-04: Inovasi non-`Published` tidak muncul di katalog, sitemap, maupun URL langsung publik.
- AC-05: Upload ditolak bila melebihi batas ukuran, MIME tidak sesuai, atau ekstensi berbahaya.
- AC-06: Katalog mendukung kombinasi search + filter + sort + halaman, dengan state kosong dan loading.
- AC-07: Setiap halaman inovasi terpublikasi punya title, meta description, Open Graph, canonical, dan masuk `sitemap.xml`.
- AC-08: ~~Formulir kolaborasi~~ (dihapus, D-19).
- AC-09: Setiap perubahan status dan perubahan data penting tercatat di audit log.
- AC-10: Seluruh halaman utama lolos pemeriksaan aksesibilitas otomatis tanpa pelanggaran kritis, dan dapat dipakai di lebar 360 px.

## 9. User Stories (inti)

- Sebagai **pengunjung**, saya ingin mencari inovasi berdasarkan kata kunci dan fakultas agar menemukan penelitian relevan.
- Sebagai **operator**, saya ingin menyimpan draft dari berkas fisik dosen (judul dulu) dan melengkapinya bertahap karena tidak semua data langsung tersedia.
- Sebagai **operator**, saya ingin daftar inovasi dengan filter status agar saya tahu mana yang masih draft dan mana yang sudah terbit.
- Sebagai **operator**, saya ingin mengelola data peneliti sekali lalu memilihnya di banyak inovasi, tanpa mengetik ulang.
- Sebagai **super admin**, saya ingin menetapkan operator dan melihat audit log agar pengelolaan terkendali.

## 10. Risiko

| ID | Risiko | Mitigasi |
|---|---|---|
| R-01 | Server bersama jenuh (load tinggi, inode 100%) | Selesaikan OQ-01 sebelum deployment, pantau sumber daya, satu proses aplikasi (ADR-001) |
| R-02 | ~~Integrasi SSO tertunda~~ Tidak berlaku (D-16). Gantinya: kata sandi lokal menjadi tanggung jawab kita | Hash argon2id, rate limiting, penguncian, super admin yang mengatur ulang (ADR-008, SECURITY.md). Login dev tetap tidak pernah aktif di produksi |
| R-03 | Katalog kosong saat peluncuran, dan input hanya dari satu orang (operator) | Target pengisian awal, impor CSV bila perlu (OQ-29), lebih dari satu operator agar tidak jadi hambatan |
| R-09 | Data dosen diterbitkan oleh pihak ketiga tanpa dasar persetujuan jelas | Formulir persetujuan tertulis yang diarsipkan (OQ-28), NIDN/NIP tidak tampil |
| R-10 | Tanpa tahap tinjauan, salah ketik langsung terbit | Draft wajib melewati terbit manual, audit log, kemampuan tarik cepat |
| R-04 | Upload berbahaya | Validasi MIME, batas ukuran, penyimpanan di luar web root, nama file diacak |
| R-05 | ~~Field SSO tidak cukup~~ Tidak berlaku (D-15). Gantinya: kelengkapan data peneliti bergantung pada berkas fisik | Field profil peneliti dibuat opsional kecuali nama |
| R-06 | Ketergantungan pada satu pengelola | Dokumentasi lengkap, kolaborator di git, runbook deployment |
| R-07 | Warna emas brand gagal kontras | Pakai emas hanya untuk aksen non-teks, hijau gelap untuk teks |
| R-08 | Backup belum ada di server | Jadikan backup + uji restore syarat go-live |

## 11. Open Questions

Lihat `DECISIONS.md`. Yang masih terbuka: OQ-28 (dasar menerbitkan data dosen) dan OQ-29 (impor CSV, pemindaian berkas).
