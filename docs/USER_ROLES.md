# USER ROLES — RBAC

Status: **DRAFT Fase 3.** Pemetaan role SSO belum final (OQ-03), ditandai **[ASUMSI]**.

## 1. Model

Pengguna → role (`user_roles`) → permission (`role_permissions`). Kode mengecek **permission**, tidak pernah nama role. Role baru = baris data baru, tanpa perubahan kode. Pengunjung bukan role: itu keadaan tanpa sesi, dan hanya dapat mengakses rute publik.

Permission berakhiran `_own` berlaku hanya untuk resource milik pengguna (pengaju atau anggota tim) dan dicek di server.

## 2. Role

| Role (`code`) | Cara diperoleh |
|---|---|
| `researcher` | Otomatis saat login SSO pertama bila klaim SSO menunjukkan dosen **[ASUMSI]** |
| `operator` | Diberikan Super Admin lewat UI |
| `super_admin` | Akun pertama lewat perintah CLI satu kali, selanjutnya diberikan Super Admin lain |

Seorang pengguna dapat memegang lebih dari satu role (mis. dosen sekaligus operator).

## 3. Matriks Permission

✔ = diizinkan, ○ = hanya milik sendiri, — = tidak.

| Permission | Pengunjung | researcher | operator | super_admin |
|---|:-:|:-:|:-:|:-:|
| `public.read` (katalog, detail, peneliti terpublikasi) | ✔ | ✔ | ✔ | ✔ |
| `collaboration.create` (kirim permintaan) | ✔ | ✔ | ✔ | ✔ |
| `profile.update_own` | — | ✔ | ✔ | ✔ |
| `innovation.create` | — | ✔ | ✔ | ✔ |
| `innovation.read_own` | — | ○ | ○ | ○ |
| `innovation.update_own` (saat draft/revision_required) | — | ○ | ○ | ○ |
| `innovation.submit_own`, `innovation.withdraw_own` | — | ○ | ○ | ○ |
| `innovation.delete_own` (saat draft) | — | ○ | ○ | ○ |
| `file.manage_own` | — | ○ | ○ | ○ |
| `innovation.read_any` | — | — | ✔ | ✔ |
| `innovation.update_any` | — | — | ✔ | ✔ |
| `innovation.review` (mulai periksa, revisi, setujui) | — | — | ✔ | ✔ |
| `innovation.publish` (publikasi, tarik) | — | — | ✔ | ✔ |
| `innovation.delete_any` | — | — | ✔ | ✔ |
| `researcher.manage` | — | — | ✔ | ✔ |
| `taxonomy.manage` (fakultas, prodi, kategori, jenis) | — | — | ✔ | ✔ |
| `file.manage_any` | — | — | ✔ | ✔ |
| `collaboration.read`, `collaboration.handle` | — | — | ✔ | ✔ |
| `user.manage` (aktif/nonaktif pengguna) | — | — | — | ✔ |
| `role.assign` | — | — | — | ✔ |
| `settings.manage` | — | — | — | ✔ |
| `audit.read` | — | — | — | ✔ |

Aturan tambahan di luar tabel:
- **Pemisahan tugas:** `innovation.review` tidak berlaku pada pengajuan milik pengguna itu sendiri (lihat `WORKFLOW.md`).
- Super Admin tidak boleh mencabut role `super_admin` miliknya bila ia satu-satunya.
- Pemberian dan pencabutan role selalu masuk audit log.

## 4. Pengujian Wajib

Untuk setiap permission: uji otomatis bahwa role yang tidak berhak mendapat 403 (rute terautentikasi) atau 404 (resource milik orang lain), dan bahwa pengunjung tanpa sesi mendapat 401 pada rute dosen/admin.
