# API DOCUMENTATION — Inovasi UNINUS

Status: **DRAFT rancangan Fase 3.** Kontrak ini menjadi dasar implementasi dan tes. Perubahan di kode harus memperbarui dokumen ini.

> **ADR-008 (2026-11-04):** rute `/me/**` (bagian 4) dimatikan oleh flag `RESEARCHER_PORTAL` (default mati): semua menjawab 404 tanpa menyentuh sesi atau database. Endpoint kolaborasi (`/collaboration-requests`, `/admin/collaboration-requests`) dihapus dari cakupan. Alur status admin adalah `draft → published` (WORKFLOW.md). **Sudah diimplementasikan:** `POST /admin/innovations`, CRUD `/admin/researchers`, `POST /auth/login`, `POST /auth/password`, dan `/admin/users` (bagian 6). Rute SSO tidak akan dibuat.

## 1. Konvensi

- Basis: `/api/v1`. Format JSON, UTF-8. Nama sumber daya jamak, huruf kecil.
- **Format respons** (konsisten di seluruh API):

```json
{ "success": true, "data": { }, "meta": { "page": 1, "per_page": 12, "total": 120 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Pesan Bahasa Indonesia", "details": [ { "field": "title", "message": "Judul wajib diisi" } ] } }
```

- `message` selalu Bahasa Indonesia dan tidak membocorkan detail internal. `code` berupa konstanta stabil.
- Paginasi: `?page=1&per_page=12` (maksimum `per_page` 50). Urutan: `?sort=newest|popular|relevance` (`relevance` hanya bila ada `q`).
- Kode status: 200, 201, 204, 400 (`VALIDATION_ERROR`), 401 (`UNAUTHENTICATED`), 403 (`FORBIDDEN`), 404 (`NOT_FOUND`), 409 (`INVALID_TRANSITION`, atau `CONFLICT` untuk bentrok data seperti menghapus peneliti yang masih tercantum di inovasi), 413, 415, 422, 429 (`RATE_LIMITED`), 500 (`INTERNAL_ERROR`).
- Rute yang mengubah data (POST/PUT/PATCH/DELETE) wajib melewati pemeriksaan CSRF (§2).
- Semua input divalidasi dengan schema (Zod) di server. Field tak dikenal ditolak.

## 2. Autentikasi dan CSRF

Sesi berbasis cookie (`__Host-` prefix, HttpOnly, Secure, SameSite=Lax). Untuk metode pengubah data: server memeriksa header `Origin` sesuai domain sendiri **dan** token CSRF (`X-CSRF-Token`, diambil dari `GET /auth/csrf`). Permintaan tanpa keduanya ditolak 403.

| Metode | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/auth/login` | publik | Body `{ email, password }` (field lain ditolak). Memeriksa Origin. Berhasil: 200 `{ id, name, mustChangePassword }` + cookie sesi (sesi lama dicabut). **Semua kegagalan** (email tak ada, sandi salah, nonaktif, tanpa sandi, terkunci): 401 `UNAUTHENTICATED` dengan satu pesan yang sama. 429 `RATE_LIMITED` bila melewati batas (10/menit per email, 60/menit total). 5 gagal beruntun mengunci akun 15 menit |
| POST | `/auth/password` | sesi + CSRF | Body `{ currentPassword, newPassword }`. Satu-satunya aksi yang boleh dilakukan akun bersandi sementara. Sandi lama salah dihitung sebagai gagal login. Kebijakan: 12-128 karakter dst. (`SECURITY.md` §2). Sukses mencabut sesi lain. Gagal: 400 dengan `details.field` `currentPassword` atau `newPassword` |
| POST | `/auth/logout` | sesi | Cabut sesi |
| GET | `/auth/me` | sesi | Profil, role, permission pengguna saat ini |
| GET | `/auth/csrf` | sesi | Token CSRF |
| POST | `/auth/dev-login` | khusus pengembangan | Body `{ email, role, name? }`, role `researcher`/`operator`/`super_admin`. Hanya hidup bila `DEV_LOGIN=1` dan `APP_ENV=development`; selain itu 404. Memeriksa Origin. Merotasi sesi. Tidak ada di produksi |

Akun dengan `mustChangePassword` hanya boleh memakai `/auth/me`, `/auth/csrf`, `/auth/logout`, dan `/auth/password`; rute lain menjawab 403 `PASSWORD_CHANGE_REQUIRED`.

`/auth/logout` selalu memeriksa Origin; bila ada sesi, token CSRF juga wajib. Tanpa sesi, logout tetap berhasil dan hanya membersihkan cookie (idempoten). Nama cookie: `__Host-inovasi_session` di https, `inovasi_session` di http lokal. Token CSRF dihasilkan dari `AUTH_SECRET` dan ID sesi, jadi tidak berlaku untuk sesi lain.

## 3. Publik (tanpa login)

Hanya mengembalikan data `published`.

| Metode | Path | Keterangan |
|---|---|---|
| GET | `/innovations` | Query: `q`, `category`, `faculty`, `study_program`, `year`, `type`, `ip_status`, `sort`, `page`, `per_page` |
| GET | `/innovations/{slug}` | Detail lengkap, peneliti, publikasi, HKI, file `public` |
| GET | `/researchers` | Query: `q`, `faculty`, `page`. Hanya peneliti `is_public` |
| GET | `/researchers/{slug}` | Profil + inovasi terpublikasi |
| GET | `/categories`, `/faculties`, `/study-programs`, `/innovation-types` | Acuan filter, dengan jumlah inovasi |
| GET | `/files/{id}` | **Sudah ada.** Hanya berkas `public` milik inovasi `published` dan belum dihapus; selain itu 404 (tidak dibedakan). Query `?v=thumb` untuk varian kecil gambar (480 px; bawaan 1600 px). Header: `Content-Type` dari database, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-cache` dengan `ETag` (SHA-256) dan 304, supaya berkas yang ditarik langsung hilang |
| GET | `/health` | Cek aplikasi dan koneksi database, tanpa detail sensitif |

> **Status implementasi:** halaman `/inovasi` memakai parameter berbahasa Indonesia (`q`, `kategori`, `fakultas`, `prodi`, `jenis`, `tahun`, `hki=1`, `urut=terbaru`, `page`; nilai berupa slug) dan memanggil penyedia data langsung di server. Endpoint JSON publik di tabel di atas (`/innovations`, `/researchers`, `/files/{id}`, `/collaboration-requests`, `/health`) belum dibuat; acuan `/categories`, `/faculties`, `/study-programs`, `/innovation-types` sudah ada.

## 4. Dosen (`researcher`) — NONAKTIF sejak ADR-008

Seluruh bagian ini hanya hidup bila `RESEARCHER_PORTAL=1`. Saat mati (default, produksi), setiap rute `/me/*` menjawab `404 NOT_FOUND`. Dipertahankan agar portal dosen bisa dibuka lagi (D-20).

| Metode | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/me/innovations` | `innovation.read_own` | Filter `status`, paginasi |
| POST | `/me/innovations` | `innovation.create` | Buat draft |
| GET | `/me/innovations/{id}` | `innovation.read_own` | |
| PATCH | `/me/innovations/{id}` | `innovation.update_own` | Hanya saat `draft`/`revision_required` |
| DELETE | `/me/innovations/{id}` | `innovation.delete_own` | Soft delete, hanya `draft` |
| POST | `/me/innovations/{id}/submit` | `innovation.submit_own` | `draft`/`revision_required` → `submitted`, validasi field wajib |
| POST | `/me/innovations/{id}/withdraw` | `innovation.withdraw_own` | `submitted` → `draft` |
| GET | `/me/innovations/{id}/history` | `innovation.read_own` | Riwayat status + catatan revisi |
| POST | `/me/innovations/{id}/files` | `file.manage_own` | `multipart/form-data`, validasi ukuran/MIME/magic bytes |
| PATCH/DELETE | `/me/innovations/{id}/files/{fileId}` | `file.manage_own` | Judul, urutan, cover, visibilitas |
| GET | `/me/researchers?q=` | `innovation.create` | Pemilih anggota tim. Minimal 2 huruf, maksimal 10 hasil, hanya profil **publik** yang belum dihapus, hanya `id`, `fullName`, `facultyName` (tanpa NIDN/NIP) |
| GET/PATCH | `/me/profile` | `profile.update_own` | Hanya field yang boleh diubah dosen (sisanya dari SSO) |

Catatan perilaku (sudah diimplementasikan untuk rute inovasi, tanpa berkas dan profil):

- `GET /me/innovations` memuat inovasi milik sendiri **dan** yang menyertakan profil peneliti saya sebagai anggota (`isOwner: false`, hanya baca). Query: `status`, `page`, `per_page` (maks. 50). Status tak dikenal: 400.
- Inovasi orang lain, id yang bukan UUID, dan yang sudah dihapus semuanya 404 (tidak membocorkan keberadaan). Anggota tim yang mencoba mengubah/mengajukan/menghapus juga 404.
- Edit atau hapus pada status terkunci: 403 `FORBIDDEN`. Ajukan/tarik pada status yang salah: 409 `INVALID_TRANSITION`. Pengajuan yang datanya belum lengkap: 400 `VALIDATION_ERROR` dengan `details` berisi field yang kurang.
- `POST` tanpa `Content-Type: application/json`: 415. Body di atas 256 KB: 413. Field tak dikenal (mis. `status`, `slug`): 400.
- `POST /me/innovations` mengisi ketua dengan profil peneliti milik pembuat bila `leadResearcherId` tidak dikirim; `null` eksplisit berarti tanpa ketua. Slug dibuat dari judul dan tidak berubah saat judul diedit (OQ-22).
- `GET /me/innovations/{id}` memuat `revisionNote` (catatan operator terakhir) saat status `revision_required`.

## 5. Admin (`operator`, `super_admin`)

| Metode | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/admin/innovations` | `innovation.read_any` | Filter status, fakultas, pencarian, paginasi |
| GET/PATCH | `/admin/innovations/{id}` | `innovation.read_any` / `update_any` | |
| POST | `/admin/innovations` | `innovation.create` + `read_any` | Buat draft atas nama operator (`submitter` = operator). Body sama dengan draft dosen: hanya judul yang wajib (min. 5 karakter), ringkasan boleh kosong tetapi bila diisi 20-500 karakter. 201 |
| POST | `/admin/innovations/{id}/transitions` | `publish` | Body: `{ "to": "published" }` atau `{ "to": "unpublished", "note": "..." }`. Hanya `draft→published`, `published→unpublished`, `unpublished→published`, `unpublished→draft` (`WORKFLOW.md`). Terbit mensyaratkan judul, ringkasan, kategori, dan ketua peneliti: bila kurang, 400 dengan `details` berisi semuanya. 409 bila pasangan tidak valid (termasuk semua status lama) |
| DELETE | `/admin/innovations/{id}` | `innovation.delete_any` | Soft delete + alasan |
| GET/POST | `/admin/researchers` | `researcher.manage` | Daftar (query `q`, `page`, `per_page` maks. 50, yang terbaru dulu, termasuk profil non-publik, dengan `innovationCount`) dan tambah. 201 |
| GET/PATCH/DELETE | `/admin/researchers/{id}` | `researcher.manage` | `PATCH` parsial. `DELETE` body `{ "reason" }` (3-500 karakter), soft delete; ditolak 409 `CONFLICT` selama masih tercantum di inovasi apa pun yang belum dihapus |
| GET/POST/PATCH | `/admin/faculties`, `/admin/study-programs`, `/admin/categories`, `/admin/innovation-types` | `taxonomy.manage` | **Tanpa DELETE**: nonaktifkan lewat `isActive: false`. Menghapus baris akan mengosongkan rujukan pada inovasi yang memakainya. Slug dibuat otomatis dari nama dan tidak berubah; fakultas milik prodi tidak bisa dipindah |
| POST | `/admin/innovations/{id}/files` | `file.manage_any` | `multipart/form-data`: `file` (wajib), `title?`, `altText?`, `visibility?` (`public`/`restricted`), `isCover?` (`true`). 201 dengan item berkas. 415 bukan multipart, 413 melebihi batas, 400 jenis/isi tidak sesuai atau gambar rusak atau melebihi 20 berkas. Gambar otomatis publik dan di-re-encode ke WebP (EXIF dibuang, maks 1600 px + varian 480 px); gambar pertama jadi sampul. PDF otomatis `restricted` |
| GET | `/admin/innovations/{id}/files` | `file.manage_any` | Daftar berkas inovasi |
| GET/PATCH/DELETE | `/admin/files/{id}` | `file.manage_any` | `GET` isi berkas apa pun (pratinjau admin, `?v=thumb`). `PATCH` `{ title?, altText?, visibility?, isCover?: true }`: sampul hanya dapat ditetapkan (bukan dicabut), harus gambar publik, dan hanya satu per inovasi; menjadikan sampul `restricted` melepas statusnya sebagai sampul. `DELETE` menghapus baris dan berkas fisik; bila sampul, gambar publik berikutnya naik. Semua perubahan tercatat di audit log (`file.upload`, `file.update`, `file.delete`) tanpa isi berkas |

Catatan perilaku (sudah diimplementasikan untuk inovasi dan taksonomi):

- Semua rute `/admin/innovations` menolak 403 bagi yang tidak punya `innovation.read_any`. Layanan juga memeriksanya sendiri: bukan reviewer selalu 404, bahkan untuk inovasi miliknya.
- `POST /admin/innovations/{id}/transitions`: status tujuan tak dikenal 400; pasangan yang tidak ada di alur operator 409 `INVALID_TRANSITION` (dengan portal mati ini mencakup `submitted`, `under_review`, `revision_required`, `approved`); `unpublished` tanpa `note` 400 dengan `details.field = "note"`. Izin: `innovation.publish` untuk semua transisi. Tidak ada pemisahan tugas: operator boleh menerbitkan draft buatannya sendiri. Percobaan 409/403 dicatat di audit log (`innovation.transition_denied`). Alur pengajuan dosen lama (pemeriksaan, revisi, persetujuan) hanya berlaku bila `RESEARCHER_PORTAL=1`.
- Respons transisi dan `GET /admin/innovations/{id}` memuat `submitter` dan `history` (dengan nama aktor dan catatan).
- Saat terbit pertama: `firstPublishedAt` dan `publishedAt` diisi; terbit ulang tidak mengubahnya. Saat terbit, ditarik, atau diedit ketika terbit, cache `catalog` dan `sitemap` disegarkan segera (`expire: 0`).
- `DELETE /admin/innovations/{id}`: body `{ "reason": "..." }` wajib (3-500 karakter). Inovasi terbit harus ditarik dulu (409). Soft delete; riwayat status tetap.
- `PATCH /admin/innovations/{id}` boleh pada status apa pun, termasuk `published` (perubahan langsung tampil, cache disegarkan, audit mencatat nama field). Input peneliti menolak `userId`, `slug`, dan `identifier` (NIDN/NIP tidak disimpan di jalur ini).
- `GET /innovations`-style acuan publik (`/categories`, `/faculties`, `/study-programs`, `/innovation-types`) mengembalikan item **aktif** saja, dengan `innovationCount` (inovasi terbit, tidak terhapus).

## 6. Super Admin

| Metode | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/admin/users` | `user.manage` | Daftar akun (peran, status, terakhir masuk, terkunci, wajib ganti sandi). Tidak memuat hash |
| POST | `/admin/users` | `user.manage` + `role.assign` | Body `{ email, name, role }`, role `operator` atau `super_admin`. 201 dengan `{ user, temporaryPassword }`; sandi sementara **hanya muncul di respons ini**. Email ganda: 409 `CONFLICT` |
| PATCH | `/admin/users/{id}` | `user.manage` (+ `role.assign` untuk `role`) | Body `{ isActive?, role? }`. Mencabut semua sesi akun itu. Tidak untuk akun sendiri (403); menonaktifkan/menurunkan super admin terakhir ditolak 409 |
| POST | `/admin/users/{id}/reset-password` | `user.manage` | Sandi sementara baru (muncul sekali), kunci dibuka, semua sesi dicabut, wajib ganti saat masuk. Tidak untuk akun sendiri. Operator biasa selalu 404 |
| GET | `/admin/audit-logs` | `audit.read` | Filter aktor, entitas, rentang waktu |
| GET/PUT | `/admin/settings` | `settings.manage` | |

## 7. Batas dan Rate Limit (usulan, final di `SECURITY.md`)

| Rute | Batas |
|---|---|
| `POST /collaboration-requests` | 5/jam per IP, 20/hari |
| `/auth/*` | 20/menit per IP |
| Upload | 20/jam per pengguna **(belum ada pembatas khusus; akses hanya operator terautentikasi)** |
| Rute publik GET | 120/menit per IP (di Nginx) |

## 8. Catatan Implementasi

- Halaman SSR memanggil lapisan `modules` langsung (bukan HTTP internal), sehingga API ini terutama dikonsumsi oleh form klien dan integrasi masa depan.
- Respons tidak pernah memuat `sso_subject`, hash, `ip_hash`, atau `identifier` (NIDN/NIP) pada rute publik.
- Pengembalian 404 (bukan 403) untuk resource milik orang lain pada rute dosen.
