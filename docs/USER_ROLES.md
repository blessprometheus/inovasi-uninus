# USER ROLES — RBAC

Status: **REVISI 2026-11-04 (ADR-008, disetujui).** Tanpa SSO dan tanpa login dosen: hanya `operator` dan `super_admin` yang punya akun (D-15, D-16). Role `researcher` dan permission `_own` tetap didefinisikan, tetapi dinonaktifkan oleh feature flag `RESEARCHER_PORTAL` (default mati, D-20). Permission `collaboration.*` dicabut (D-19). Catatan kode: `permissions.ts` masih memuat `innovation.review` dan izin `_own` untuk portal dosen yang tertidur; alur operator tidak memakainya.

## 1. Model

Pengguna → role (`user_roles`) → permission (`role_permissions`). Kode mengecek **permission**, tidak pernah nama role. Role baru = baris data baru, tanpa perubahan kode. Pengunjung bukan role: itu keadaan tanpa sesi, dan hanya dapat mengakses rute publik.

Permission berakhiran `_own` berlaku hanya untuk resource milik pengguna (pengaju atau anggota tim) dan dicek di server.

## 2. Role

| Role (`code`) | Cara diperoleh |
|---|---|
| `researcher` | **Nonaktif.** Hanya berlaku bila `RESEARCHER_PORTAL` dinyalakan di masa depan. Tidak ada cara memperolehnya sekarang |
| `operator` | Akun dibuat oleh Super Admin lewat UI (login lokal, lihat ADR-008) |
| `super_admin` | Akun pertama lewat perintah CLI satu kali, selanjutnya diberikan Super Admin lain |

Seorang pengguna dapat memegang lebih dari satu role. Satu akun per orang; akun tidak boleh dibagi karena audit log dan pencabutan akses bergantung padanya.

## 3. Matriks Permission

✔ = diizinkan, ○ = hanya milik sendiri, — = tidak.

| Permission | Pengunjung | researcher | operator | super_admin |
|---|:-:|:-:|:-:|:-:|
| `public.read` (katalog, detail, peneliti terpublikasi) | ✔ | ✔ | ✔ | ✔ |
| `innovation.create` | — | ✔ | ✔ | ✔ |
| `innovation.read_any` | — | — | ✔ | ✔ |
| `innovation.update_any` | — | — | ✔ | ✔ |
| `innovation.publish` (terbit, tarik, terbit ulang) | — | — | ✔ | ✔ |
| `innovation.delete_any` | — | — | ✔ | ✔ |
| `researcher.manage` (CRUD profil peneliti) | — | — | ✔ | ✔ |
| `taxonomy.manage` (fakultas, prodi, kategori, jenis) | — | — | ✔ | ✔ |
| `file.manage_any` | — | — | ✔ | ✔ |
| ~~`innovation.review`~~ (dicabut: tidak ada tahap tinjauan) | — | — | — | — |
| ~~`collaboration.*`~~ (dicabut, D-19) | — | — | — | — |
| `profile.update_own`, `innovation.*_own`, `file.manage_own` (**nonaktif** di balik `RESEARCHER_PORTAL`) | — | ○ | — | — |
| `user.manage` (aktif/nonaktif pengguna) | — | — | — | ✔ |
| `role.assign` | — | — | — | ✔ |
| `settings.manage` | — | — | — | ✔ |
| `audit.read` | — | — | — | ✔ |

Aturan tambahan di luar tabel:
- **Pemisahan tugas dicabut** (lihat `WORKFLOW.md` aturan 9); digantikan audit log wajib.
- Pembuat inovasi (`created_by`) adalah operator yang menginput, bukan ketua peneliti. Ketua dan anggota hanya data tampilan.
- Super Admin tidak boleh mencabut role `super_admin` miliknya bila ia satu-satunya.
- Pemberian dan pencabutan role selalu masuk audit log.

## 4. Pengujian Wajib

Untuk setiap permission: uji otomatis bahwa role yang tidak berhak mendapat 403 (rute terautentikasi) atau 404 (resource milik orang lain), dan bahwa pengunjung tanpa sesi mendapat 401 pada rute dosen/admin.
