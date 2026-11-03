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
| GET/PATCH | `/me/profile` | `profile.update_own` | Hanya field yang boleh diubah dosen (sisanya dari SSO) |

## 5. Admin (`operator`, `super_admin`)

| Metode | Path | Permission | Keterangan |
|---|---|---|---|
| GET | `/admin/innovations` | `innovation.read_any` | Filter status, fakultas, pencarian, paginasi |
| GET/PATCH | `/admin/innovations/{id}` | `innovation.read_any` / `update_any` | |
| POST | `/admin/innovations/{id}/transitions` | `review` / `publish` | Body: `{ "to": "approved", "note": "..." }`. Izin ditentukan oleh transisi (`WORKFLOW.md`). 409 bila tidak valid |
| DELETE | `/admin/innovations/{id}` | `innovation.delete_any` | Soft delete + alasan |
| CRUD | `/admin/researchers` | `researcher.manage` | |
| CRUD | `/admin/faculties`, `/study-programs`, `/categories`, `/innovation-types` | `taxonomy.manage` | Nonaktifkan, bukan hapus, bila sudah dipakai |
| GET/DELETE | `/admin/files/{id}` | `file.manage_any` | |
| GET | `/admin/collaboration-requests` | `collaboration.read` | |
| PATCH | `/admin/collaboration-requests/{id}` | `collaboration.handle` | Ubah status, catatan |

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
