# API DOCUMENTATION — Inovasi UNINUS

Status: **DRAFT rancangan Fase 3.** Kontrak ini menjadi dasar implementasi dan tes. Perubahan di kode harus memperbarui dokumen ini.

## 1. Konvensi

- Basis: `/api/v1`. Format JSON, UTF-8. Nama sumber daya jamak, huruf kecil.
- **Format respons** (konsisten di seluruh API):

```json
{ "success": true, "data": { }, "meta": { "page": 1, "per_page": 12, "total": 120 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Pesan Bahasa Indonesia", "details": [ { "field": "title", "message": "Judul wajib diisi" } ] } }
```

- `message` selalu Bahasa Indonesia dan tidak membocorkan detail internal. `code` berupa konstanta stabil.
- Paginasi: `?page=1&per_page=12` (maksimum `per_page` 50). Urutan: `?sort=newest|popular|relevance` (`relevance` hanya bila ada `q`).
- Kode status: 200, 201, 204, 400 (`VALIDATION_ERROR`), 401 (`UNAUTHENTICATED`), 403 (`FORBIDDEN`), 404 (`NOT_FOUND`), 409 (`INVALID_TRANSITION`/konflik), 413, 415, 422, 429 (`RATE_LIMITED`), 500 (`INTERNAL_ERROR`).
- Rute yang mengubah data (POST/PUT/PATCH/DELETE) wajib melewati pemeriksaan CSRF (§2).
- Semua input divalidasi dengan schema (Zod) di server. Field tak dikenal ditolak.

## 2. Autentikasi dan CSRF

Sesi berbasis cookie (`__Host-` prefix, HttpOnly, Secure, SameSite=Lax). Untuk metode pengubah data: server memeriksa header `Origin` sesuai domain sendiri **dan** token CSRF (`X-CSRF-Token`, diambil dari `GET /auth/csrf`). Permintaan tanpa keduanya ditolak 403.

| Metode | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/auth/login` | publik | Mulai alur SSO (PKCE), redirect |
| GET | `/auth/callback` | publik | Terima `code`/`state`, buat sesi, redirect |
| POST | `/auth/logout` | sesi | Cabut sesi |
| GET | `/auth/me` | sesi | Profil, role, permission pengguna saat ini |
| GET | `/auth/csrf` | sesi | Token CSRF |
| POST | `/auth/dev-login` | khusus pengembangan | Body `{ email, role, name? }`, role `researcher`/`operator`/`super_admin`. Hanya hidup bila `DEV_LOGIN=1` dan `APP_ENV=development`; selain itu 404. Memeriksa Origin. Merotasi sesi. Tidak ada di produksi |

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
| GET | `/files/{id}` | Hanya file `public` milik inovasi `published`. `Content-Disposition` dan `nosniff` |
| POST | `/collaboration-requests` | Body: `innovation_id?`, `name`, `email`, `organization`, `phone?`, `message`, `consent`. Honeypot + rate limit ketat. Respons 201 tanpa membocorkan data lain |
| GET | `/health` | Cek aplikasi dan koneksi database, tanpa detail sensitif |

## 4. Dosen (`researcher`, juga dipakai operator untuk milik sendiri)

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
| POST | `/admin/innovations/{id}/transitions` | `review` / `publish` | Body: `{ "to": "approved", "note": "..." }`. Izin ditentukan oleh transisi (`WORKFLOW.md`). 409 bila tidak valid |
| DELETE | `/admin/innovations/{id}` | `innovation.delete_any` | Soft delete + alasan |
| CRUD | `/admin/researchers` | `researcher.manage` | |
| GET/POST/PATCH | `/admin/faculties`, `/admin/study-programs`, `/admin/categories`, `/admin/innovation-types` | `taxonomy.manage` | **Tanpa DELETE**: nonaktifkan lewat `isActive: false`. Menghapus baris akan mengosongkan rujukan pada inovasi yang memakainya. Slug dibuat otomatis dari nama dan tidak berubah; fakultas milik prodi tidak bisa dipindah |
| GET/DELETE | `/admin/files/{id}` | `file.manage_any` | |
| GET | `/admin/collaboration-requests` | `collaboration.read` | |
| PATCH | `/admin/collaboration-requests/{id}` | `collaboration.handle` | Ubah status, catatan |

Catatan perilaku (sudah diimplementasikan untuk inovasi dan taksonomi):

- Semua rute `/admin/innovations` menolak 403 bagi yang tidak punya `innovation.read_any`. Layanan juga memeriksanya sendiri: bukan reviewer selalu 404, bahkan untuk inovasi miliknya.
- `POST /admin/innovations/{id}/transitions`: status tujuan tak dikenal 400; pasangan status yang tidak ada 409 `INVALID_TRANSITION`; pasangan milik pemilik (mis. `draft→submitted`) atau memeriksa pengajuan sendiri 403; `revision_required` dan `unpublished` tanpa `note` 400 dengan `details.field = "note"`. Izin: `innovation.review` untuk memeriksa/revisi/setujui, `innovation.publish` untuk terbit, tarik, terbit ulang, dan kembalikan ke draft. Percobaan 409/403 dicatat di audit log (`innovation.transition_denied`).
- Respons transisi dan `GET /admin/innovations/{id}` memuat `submitter` dan `history` (dengan nama aktor dan catatan).
- Saat terbit pertama: `firstPublishedAt` dan `publishedAt` diisi; terbit ulang tidak mengubahnya. Saat terbit, ditarik, atau diedit ketika terbit, cache `catalog` dan `sitemap` disegarkan segera (`expire: 0`).
- `DELETE /admin/innovations/{id}`: body `{ "reason": "..." }` wajib (3-500 karakter). Inovasi terbit harus ditarik dulu (409). Soft delete; riwayat status tetap.
- `GET /innovations`-style acuan publik (`/categories`, `/faculties`, `/study-programs`, `/innovation-types`) mengembalikan item **aktif** saja, dengan `innovationCount` (inovasi terbit, tidak terhapus).

## 6. Super Admin

| Metode | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/admin/users` | `user.manage` | |
| PATCH | `/admin/users/{id}` | `user.manage` | Aktif/nonaktif |
| PUT | `/admin/users/{id}/roles` | `role.assign` | Ganti daftar role, masuk audit log |
| GET | `/admin/audit-logs` | `audit.read` | Filter aktor, entitas, rentang waktu |
| GET/PUT | `/admin/settings` | `settings.manage` | |

## 7. Batas dan Rate Limit (usulan, final di `SECURITY.md`)

| Rute | Batas |
|---|---|
| `POST /collaboration-requests` | 5/jam per IP, 20/hari |
| `/auth/*` | 20/menit per IP |
| Upload | 20/jam per pengguna |
| Rute publik GET | 120/menit per IP (di Nginx) |

## 8. Catatan Implementasi

- Halaman SSR memanggil lapisan `modules` langsung (bukan HTTP internal), sehingga API ini terutama dikonsumsi oleh form klien dan integrasi masa depan.
- Respons tidak pernah memuat `sso_subject`, hash, `ip_hash`, atau `identifier` (NIDN/NIP) pada rute publik.
- Pengembalian 404 (bukan 403) untuk resource milik orang lain pada rute dosen.
