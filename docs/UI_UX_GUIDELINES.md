# UI/UX GUIDELINES — Inovasi UNINUS

Status: **DISETUJUI pengguna (2026-11-03).** Tidak ada kode UI sebelum dokumen ini disetujui. Rekomendasi diambil dari pencarian skill `ui-ux-pro-max` (domain `product/style/typography/ux`, stack `shadcn`) dan **disesuaikan** dengan keputusan pengguna (D-04). Bila ada perbedaan, keputusan pengguna menang.

## 1. Arah Visual

**Modern academic institution, clean editorial, minimalis.** Pola dari skill: *Minimalism & Swiss Style* (grid, whitespace, kontras tinggi, fungsional) dan pola halaman *Portfolio Grid* (visual dahulu, filter kategori, cepat dimuat), cocok untuk katalog inovasi.

Prinsip:
1. **Konten dahulu.** Foto dan judul inovasi adalah bintangnya; dekorasi minimal.
2. **Hierarki tipografi yang jelas** sebagai sumber karakter "premium", bukan gradient atau kaca (glassmorphism), animasi berlebih.
3. **Jujur pada data kosong.** Peluncuran dimulai tanpa data (D-03), jadi setiap bagian punya perilaku saat kosong (§8). Tidak ada gambar stok atau angka palsu.
4. **Aksesibilitas bukan tambahan.** Target WCAG 2.2 AA, diuji sebelum UI dinyatakan selesai.

Catatan penyimpangan dari rekomendasi skill: skill menyarankan heading serif (EB Garamond/Crimson Text) dan biru navy. Keduanya **tidak dipakai** karena pengguna menetapkan hijau/emas UNINUS dan Plus Jakarta Sans, agar serasi dengan SSO dan aplikasi UNINUS lain.

## 2. Warna

Acuan resmi (D-04): hijau `#008F4F`, emas `#FBC02D`. **Hasil uji kontras (WCAG) mengubah cara pemakaiannya:**

| Pasangan | Rasio | Hasil |
|---|---|---|
| `#008F4F` teks/tombol di putih | 4,17 : 1 | **Gagal** untuk teks normal (butuh 4,5) |
| `#FBC02D` teks di putih | 1,66 : 1 | **Gagal** berat |
| Teks `#1F2937` di `#FBC02D` | 8,86 : 1 | Lulus |
| `#00703E` di putih | 6,20 : 1 | Lulus |
| `#005A32` di putih | 8,37 : 1 | Lulus |
| `#8A5300` di putih | 6,33 : 1 | Lulus |

Keputusan: **hijau brand `#008F4F` dipertahankan sebagai warna identitas** (logo, ilustrasi, ikon besar, batang statistik, latar elemen besar), tetapi **teks, tautan, dan tombol memakai hijau lebih gelap `#00703E`**. **Emas hanya sebagai latar/aksen** (lencana, garis penanda, sorotan) dengan teks gelap di atasnya, tidak pernah sebagai warna teks.

### Token warna (semantik, tidak ada hex mentah di komponen)

| Token | Nilai | Pemakaian |
|---|---|---|
| `--color-primary` | `#00703E` | Tombol utama, tautan, fokus aktif |
| `--color-primary-hover` | `#005A32` | Hover/pressed |
| `--color-brand` | `#008F4F` | Identitas: logo, elemen dekoratif besar, ikon ≥ 24 px |
| `--color-on-primary` | `#FFFFFF` | Teks di atas primary (6,20:1) |
| `--color-primary-tint` | `#E8F5EE` | Latar lembut (chip aktif, banner info) |
| `--color-accent` | `#FBC02D` | Aksen: lencana "Unggulan", garis, sorotan |
| `--color-on-accent` | `#1F2937` | Teks di atas accent (8,86:1) |
| `--color-accent-text` | `#8A5300` | Teks beraksen emas di latar terang (6,33:1) |
| `--color-background` | `#F8FAFC` | Latar halaman |
| `--color-surface` | `#FFFFFF` | Kartu, panel |
| `--color-foreground` | `#0F172A` | Teks utama (17:1) |
| `--color-muted-foreground` | `#475569` | Teks sekunder, metadata (7,2:1) |
| `--color-border` | `#CBD5E1` | Pemisah dekoratif |
| `--color-border-input` | `#78879B` | Batas input/kontrol (3,66:1 di putih, 3,50:1 di latar; lulus 3:1) |
| `--color-success` | `#15803D` | Berhasil (5,0:1) |
| `--color-warning-text` | `#8A5300` pada `#FFF4D6` | Peringatan (5,8:1) |
| `--color-destructive` | `#B91C1C` | Error, hapus (6,5:1) |
| `--color-ring` | `#00703E` | Cincin fokus, 2 px + offset 2 px |

Aturan: informasi tidak pernah disampaikan hanya lewat warna (status selalu disertai teks/ikon). **Mode gelap tidak termasuk MVP** (P2).

### Warna status workflow (selalu dengan teks + ikon)

`draft` abu-abu, `submitted` biru, `under_review` kuning-teks-gelap, `revision_required` oranye-teks-gelap, `approved` hijau-tint, `published` hijau-solid, `unpublished` abu-abu-bergaris. Nilai persisnya diuji kontras saat membangun komponen `StatusBadge`.

## 3. Tipografi

**Plus Jakarta Sans** satu keluarga (heading dan isi), sesuai SSO. Dimuat lewat `next/font` (diunduh saat build dan dilayani dari domain sendiri), bukan CDN runtime, agar lebih cepat, lebih privat, dan sesuai CSP ketat. Fallback: `system-ui, sans-serif`. Hanya bobot 400, 500, 600, 700, 800 (subset latin).

| Peran | Ukuran / line-height | Bobot | Catatan |
|---|---|---|---|
| Display (hero) | 48/1,1 (mobile 32/1,15) | 800 | letter-spacing -0,02em |
| H1 | 36/1,2 (mobile 28) | 700 | |
| H2 | 28/1,25 (mobile 24) | 700 | |
| H3 | 20/1,3 | 600 | judul kartu |
| Body | 16/1,6 | 400 | minimum isi, tidak ada teks isi di bawah 16 px |
| Body besar | 18/1,6 | 400 | abstrak di halaman detail |
| Metadata | 14/1,5 | 500 | label kartu, tahun, fakultas |
| Caption | 12/1,4 | 500 | hanya untuk keterangan tambahan |

Panjang baris teks bacaan dibatasi 65–75 karakter (`max-w-prose`). Heading dibungkus seimbang (`text-wrap: balance`).

## 4. Tata Letak, Grid, dan Responsif

- Kontainer maks 1200 px (publik) dan 1440 px (admin), padding samping 16 / 24 / 32 px.
- Breakpoint uji: **375, 768, 1024, 1440 px**. Mobile-first, tanpa scroll horizontal.
- Skala spasi 4 px (4, 8, 12, 16, 24, 32, 48, 64, 96). Ritme antar-section publik 64–96 px, admin lebih rapat (kepadatan sedang).
- Grid katalog: 1 kolom (mobile), 2 (tablet), 3 (desktop) kartu. Sidebar filter 280 px di desktop, lembar geser (drawer) di mobile.
- Radius: 8 px kontrol, 12 px kartu. Bayangan tipis hanya untuk elemen melayang (dropdown, dialog).
- Target sentuh minimal **44×44 px**, jarak antar target ≥ 8 px.

## 5. Komponen (basis shadcn/ui, Lucide Icons)

Komponen dibangun sekali, dipakai ulang. Setiap komponen punya status: default, hover, fokus, aktif, disabled, loading, error (bila relevan).

| Kelompok | Komponen |
|---|---|
| Navigasi | `SiteHeader` (logo, menu, pencarian), `Breadcrumb`, `Pagination`, `SidebarNav` (admin/dosen), `UserMenu` |
| Data publik | `InnovationCard`, `InnovationGrid`, `ResearcherCard`, `StatTile`, `CategoryChip`, `FacultyTile`, `CoverPlaceholder` |
| Filter | `SearchInput`, `FilterPanel` (kategori, fakultas, prodi, tahun, jenis, HKI), `ActiveFilters`, `SortSelect` |
| Detail | `MetaList`, `ResearcherList`, `PublicationList`, `IpBadge`, `FileList`, `Gallery`, `CollaborationCta` |
| Form | `TextField`, `Textarea` (hitung karakter), `Select`, `Combobox` (peneliti, kategori), `FileUploader`, `FormSection`, `FieldError` |
| Alur | `StatusBadge`, `StatusTimeline`, `ReviewPanel` (setujui/revisi/publikasi), `ConfirmDialog` |
| Admin | `DataTable` (urut, filter, paginasi, TanStack Table), `StatCard`, `AuditLogTable`, `RoleMatrix` |
| Umpan balik | `Toast`, `EmptyState`, `Skeleton`, `ErrorState`, `InlineAlert` |

Aturan komponen:
- **Form:** label selalu terlihat (bukan hanya placeholder), pesan error di dekat field dan diringkas di atas formulir, bantuan di bawah field, validasi saat blur dan saat kirim, fokus pindah ke error pertama.
- **Tombol:** satu tombol utama per tampilan. Aksi destruktif memakai `ConfirmDialog` dengan nama aksi eksplisit ("Hapus inovasi").
- **Ikon:** hanya SVG (Lucide). Dilarang emoji sebagai ikon. Tombol hanya-ikon wajib `aria-label`. Ikon dekoratif `aria-hidden`.
- **Tabel admin:** struktur semantik (`thead/tbody/th scope`), di mobile berubah menjadi daftar kartu.
- Setiap elemen yang bisa diklik punya `cursor-pointer`, status hover, dan cincin fokus terlihat.

## 6. Gerak (Motion)

Hemat dan bermakna. Hover/transisi 150–250 ms, muncul-saat-gulir halus (opacity + translate 12 px, 300–400 ms) **hanya** di beranda. Hanya animasikan `opacity` dan `transform`. `prefers-reduced-motion` dihormati (konten langsung tampil tanpa animasi). Tidak ada animasi yang menghambat interaksi. GSAP **tidak dipakai di MVP**; CSS transition cukup (tidak menambah dependensi).

## 7. Aksesibilitas (WCAG 2.2 AA) — daftar periksa

- Kontras teks ≥ 4,5:1, teks besar dan komponen UI ≥ 3:1 (token di §2 sudah dihitung).
- Navigasi keyboard penuh, urutan fokus logis, **fokus tidak tertutup** header lengket (2.4.11), tautan "Lewati ke konten".
- Alternatif non-seret untuk semua aksi seret (mis. urutan file: tombol naik/turun, bukan hanya drag).
- Target ukuran minimal (2.5.8) dipenuhi dengan 44 px.
- Autentikasi lewat SSO tanpa teka-teki kognitif (3.3.8).
- `lang="id"`, landmark (`header/nav/main/footer`), satu `h1` per halaman, `alt` bermakna pada foto inovasi (diisi pengaju, wajib saat unggah gambar cover), `alt=""` pada dekoratif.
- Status/progres diumumkan ke pembaca layar (`aria-live` untuk toast dan jumlah hasil pencarian).
- Zoom 200% dan reflow di lebar 320 px tanpa kehilangan fungsi.

## 8. Perilaku Data Kosong dan Muat

Karena data awal kosong, tiap bagian publik harus anggun saat belum ada isi:

| Tempat | Saat kosong |
|---|---|
| Statistik beranda | Disembunyikan sampai ada inovasi terpublikasi (tidak menampilkan "0") |
| Inovasi unggulan / terbaru | Bagian disembunyikan; hero dan ajakan tetap tampil |
| Katalog tanpa hasil | `EmptyState` dengan saran (hapus filter, ubah kata kunci), tombol "Reset filter" |
| Katalog benar-benar kosong | Penjelasan "Katalog sedang disiapkan" + ajakan kolaborasi/ajukan inovasi (untuk dosen) |
| Dashboard dosen belum ada pengajuan | `EmptyState` dengan tombol "Ajukan inovasi pertama" |
| Gambar cover belum ada | `CoverPlaceholder` (pola netral hijau-tint + ikon kategori), bukan foto stok |

Loading: `Skeleton` dengan dimensi tetap (mencegah CLS < 0,1). Gambar `lazy` di bawah lipatan dan prioritas pada gambar utama.

## 9. Konten dan Gambar

- Foto berasal dari pengaju inovasi. Tidak memakai foto stok generik. Gambar disajikan WebP, rasio kartu 16:10, wajib `alt`.
- Logo: `brand/logo-uninus.png` hanya 73×100 px (OQ-04), terlalu kecil untuk header retina dan Open Graph. Dibutuhkan file sumber besar atau SVG sebelum go-live. Logo tidak diubah warna/proporsinya.
- Nada bahasa: Indonesia formal-ramah, kalimat aktif, hindari jargon. Label tombol berupa kata kerja ("Ajukan Kolaborasi", bukan "Klik di sini"). Teks UI final ditinjau dengan skill `design:ux-copy` saat implementasi.

## 10. Wireframe

Wireframe low-fidelity (struktur dan prioritas, bukan tampilan akhir). Tanda `[ ]` = tombol/kontrol, `▒` = gambar.

### 10.1 Beranda (desktop)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo] INOVASI UNINUS    Inovasi  Peneliti  Tentang  Kolaborasi  [Masuk]│  ← header lengket
├──────────────────────────────────────────────────────────────────┤
│  HERO                                                              │
│  Inovasi dan Karya untuk Masa Depan            (Display 48)       │
│  Katalog hasil penelitian & inovasi dosen UNINUS (18)             │
│  [ 🔍 Cari inovasi, peneliti, bidang…          ] [Cari]           │
│  Populer: Kategori A · Kategori B · Kategori C   ← dari data       │
├──────────────────────────────────────────────────────────────────┤
│  STATISTIK (hanya jika ada data)                                   │
│  [ 24 Inovasi ] [ 12 Peneliti ] [ 6 Fakultas ] [ 5 HKI ]          │
├──────────────────────────────────────────────────────────────────┤
│  Inovasi Unggulan                                  Lihat semua →   │
│  ┌────────┐ ┌────────┐ ┌────────┐                                  │
│  │ ▒▒▒▒▒▒ │ │ ▒▒▒▒▒▒ │ │ ▒▒▒▒▒▒ │   InnovationCard x3              │
│  │ Judul  │ │ Judul  │ │ Judul  │                                  │
│  │ Kat·Th │ │ Kat·Th │ │ Kat·Th │                                  │
│  │ Peneliti│ │        │ │        │                                  │
│  └────────┘ └────────┘ └────────┘                                  │
├──────────────────────────────────────────────────────────────────┤
│  Jelajahi Bidang (kategori)        │ Berdasarkan Fakultas          │
│  [Chip][Chip][Chip][Chip]          │ [Tile][Tile][Tile]            │
├──────────────────────────────────────────────────────────────────┤
│  Inovasi Terbaru   (grid 3×2) + [Lihat semua]                      │
├──────────────────────────────────────────────────────────────────┤
│  Peneliti Pilihan  (3–4 ResearcherCard)                            │
├──────────────────────────────────────────────────────────────────┤
│  KOLABORASI   "Punya kebutuhan yang bisa dijawab riset UNINUS?"   │
│  [Ajukan Kolaborasi]                       (latar hijau, teks putih)│
├──────────────────────────────────────────────────────────────────┤
│  FOOTER: identitas UNINUS · tautan · kontak                        │
└──────────────────────────────────────────────────────────────────┘
```

Catatan: "Populer", "Unggulan", "Peneliti Pilihan" membutuhkan kolom `is_featured` (ditambahkan di `DATABASE_DESIGN.md`).

### 10.2 Katalog `/inovasi`

```
Desktop                                          Mobile (375)
┌────────────────────────────────────────────┐   ┌──────────────────┐
│ Beranda › Inovasi                           │   │ ☰  INOVASI  🔍   │
│ Katalog Inovasi            [ 🔍 cari…    ]  │   │ [🔍 cari…      ] │
│ 24 hasil     Urutkan: [Terbaru ▾]           │   │ [Filter (2)][Urut]│
│ Aktif: [Fakultas X ✕] [2024 ✕] [Reset]      │   │ Aktif: [X ✕][2024✕]│
├──────────────┬─────────────────────────────┤   │ ┌──────────────┐ │
│ FILTER       │ ┌──────┐ ┌──────┐ ┌──────┐  │   │ │ ▒▒▒▒▒▒▒▒▒▒▒▒ │ │
│ Kategori ☐☐☐ │ │ ▒▒▒▒ │ │ ▒▒▒▒ │ │ ▒▒▒▒ │  │   │ │ Judul        │ │
│ Fakultas ☐☐  │ │Judul │ │Judul │ │Judul │  │   │ │ Kat · 2024   │ │
│ Prodi    ▾   │ │Meta  │ │Meta  │ │Meta  │  │   │ │ Peneliti·Fak │ │
│ Tahun    ▾   │ └──────┘ └──────┘ └──────┘  │   │ └──────────────┘ │
│ Jenis    ☐☐  │ ┌──────┐ ┌──────┐ ┌──────┐  │   │ (…kartu lain)    │
│ HKI/Paten ☐  │ │      │ │      │ │      │  │   │ [‹ 1 2 3 ›]      │
│ [Reset]      │ └──────┘ └──────┘ └──────┘  │   └──────────────────┘
│              │       [‹ 1 2 3 … ›]          │   Filter = drawer dari bawah,
└──────────────┴─────────────────────────────┘   tombol "Terapkan (24 hasil)"
```

Isi `InnovationCard`: cover 16:10, judul (maks 2 baris), kategori utama, ketua peneliti, fakultas, tahun, ringkasan (maks 3 baris), lencana HKI/Paten bila ada. Seluruh kartu satu tautan (area klik besar).

### 10.3 Detail inovasi `/inovasi/{slug}`

```
┌──────────────────────────────────────────────────────────────────┐
│ Beranda › Inovasi › Kategori › Judul                              │
│ [Kategori] [Jenis] [HKI: Terdaftar]                               │
│ Judul Inovasi (H1)                                                │
│ Ketua: Nama · Fakultas · Prodi · Tahun 2024                       │
├─────────────────────────────────────┬────────────────────────────┤
│ ┌─────────────────────────────────┐ │ PANEL SAMPING (lengket)    │
│ │ ▒▒▒▒ Galeri / cover ▒▒▒▒        │ │ Tim Peneliti               │
│ └─────────────────────────────────┘ │  • Ketua — Nama            │
│ Abstrak                             │  • Anggota — Nama          │
│ Latar Belakang                      │ Legalitas                  │
│ Permasalahan  · Tujuan              │  HKI: no. sertifikat       │
│ Metodologi                          │  Paten: status             │
│ Deskripsi Inovasi                   │ Publikasi (DOI/tautan)     │
│ Keunggulan · Manfaat · Potensi      │ Dokumen publik             │
│ (bagian opsional yang kosong        │  📄 nama.pdf (1,2 MB)      │
│  TIDAK ditampilkan)                 │ ┌────────────────────────┐ │
│ Dokumentasi: foto / video           │ │ [Hubungi / Ajukan      │ │
│                                     │ │  Kolaborasi]           │ │
│ Inovasi Terkait (3 kartu)           │ └────────────────────────┘ │
└─────────────────────────────────────┴────────────────────────────┘
Mobile: panel samping pindah ke bawah isi; CTA kolaborasi lengket di bawah layar.
```

Bagian yang tidak diisi disembunyikan, bukan "-" (field bersifat opsional).

### 10.4 Formulir kolaborasi (modal/halaman)

```
Ajukan Kolaborasi — [nama inovasi bila dari detail]
Nama lengkap*     [                    ]
Email*            [                    ]  bantuan: "Balasan dikirim ke email ini"
Instansi*         [                    ]
Telepon           [                    ]
Pesan*            [                    ]  0/1000
☐ Saya setuju datanya disimpan untuk menindaklanjuti permintaan ini*
[ Kirim Permintaan ]   → toast sukses + halaman konfirmasi
(field honeypot tersembunyi, tidak terlihat pembaca layar)
```

### 10.5 Direktori peneliti `/peneliti`

Pencarian nama + filter fakultas, grid `ResearcherCard` (foto atau inisial, nama, fakultas, jumlah inovasi). Profil: identitas, bio, tautan eksternal, daftar inovasi terpublikasi.

### 10.6 Dashboard dosen `/dosen`

```
┌───────────┬────────────────────────────────────────────────────┐
│ ☰ Sidebar │ Halo, Nama                          [UserMenu ▾]   │
│ Ringkasan │ ┌Draft 2┐┌Diajukan 1┐┌Revisi 1┐┌Terbit 5┐          │
│ Inovasi   │ [+ Ajukan Inovasi]                                  │
│  Saya     │ Perlu tindakan                                      │
│ Profil    │  ⚠ "Judul X" — Revisi diminta: "lengkapi metodologi"│
│ Riwayat   │  [Perbaiki]                                         │
│           │ Inovasi Saya   [status ▾] [cari]                    │
│           │ ┌───────────────────────────────────────────────┐   │
│           │ │ Judul │ Status │ Diperbarui │ Aksi             │   │
│           │ └───────────────────────────────────────────────┘   │
└───────────┴────────────────────────────────────────────────────┘
```

### 10.7 Formulir pengajuan `/dosen/inovasi/{id}/edit`

Satu halaman, bagian bertahap (accordion/langkah) dengan **simpan otomatis sebagai draft** dan indikator "Tersimpan pukul …". Bagian: 1) Identitas (judul*, ringkasan*, kategori*, jenis, tahun, fakultas/prodi), 2) Tim (ketua*, anggota), 3) Deskripsi (abstrak … potensi, semua opsional), 4) Legalitas dan publikasi, 5) Media dan dokumen (unggah, alt teks, visibilitas `publik/terbatas`), 6) Tinjau & ajukan (daftar kelengkapan, tombol **Ajukan** nonaktif sampai field wajib lengkap, dengan penjelasan yang kurang). Saat status terkunci: tampil mode baca + `StatusTimeline`.

### 10.8 Dashboard admin `/admin`

```
┌───────────┬────────────────────────────────────────────────────┐
│ Sidebar   │ Ringkasan                                           │
│ Ringkasan │ ┌Menunggu 4┐┌Dalam Review 2┐┌Kolaborasi Baru 3┐     │
│ Inovasi   │ Antrean Verifikasi          [status ▾][fakultas ▾][cari]│
│ Verifikasi│ ┌─────────────────────────────────────────────────┐ │
│ Peneliti  │ │ Judul │ Pengaju │ Fakultas │ Diajukan │ Status  │ │
│ Taksonomi │ └─────────────────────────────────────────────────┘ │
│ Berkas    │ Klik baris → Halaman Tinjau:                        │
│ Kolaborasi│  [Isi pengajuan (baca)]   | [Panel Keputusan]       │
│ Pengguna* │                           |  (•) Setujui            │
│ Audit Log*│                           |  (•) Minta revisi       │
│ Pengaturan*                           |  Catatan* [          ]  │
│ (* super  │                           |  [Kirim Keputusan]      │
│  admin)   │ Riwayat status (StatusTimeline)                     │
└───────────┴────────────────────────────────────────────────────┘
```

Menu dan aksi yang tidak diizinkan role **disembunyikan di UI sekaligus ditolak di server** (UI bukan lapisan keamanan).

## 11. Tahapan Implementasi UI (untuk Fase 5)

1. Token + `next/font` + komponen dasar (tombol, input, kartu, badge), diuji di Storybook-ringan atau halaman `/_design` (hanya dev).
2. Layout publik + beranda + katalog + detail (dengan data `[DUMMY]` yang ditandai).
3. Dashboard dosen + formulir.
4. Dashboard admin + verifikasi.
5. Audit aksesibilitas dan responsif sebelum modul dianggap selesai.

## 12. Open Questions UI

- OQ-04: logo SVG dan panduan penggunaan logo.
- OQ-17: apakah ada nama/ikon resmi untuk kategori bidang (bila tidak, `CoverPlaceholder` memakai ikon generik).
- OQ-18: apakah halaman publik perlu menampilkan tautan ke SSO/portal UNINUS lain di footer.
