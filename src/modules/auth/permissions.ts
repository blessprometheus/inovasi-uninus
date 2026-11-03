/**
 * Daftar permission dan pemetaan role awal. Sumber kebenaran: docs/USER_ROLES.md.
 * Kode aplikasi mengecek permission, tidak pernah nama role.
 */

export const PERMISSIONS = {
  "public.read": "Melihat katalog, detail, dan peneliti terpublikasi",
  "collaboration.create": "Mengirim permintaan kolaborasi",
  "profile.update_own": "Mengubah profil sendiri",
  "innovation.create": "Membuat inovasi (draft)",
  "innovation.read_own": "Melihat inovasi milik sendiri",
  "innovation.update_own": "Mengedit inovasi milik sendiri saat draft atau revisi",
  "innovation.submit_own": "Mengajukan inovasi milik sendiri",
  "innovation.withdraw_own": "Menarik kembali pengajuan milik sendiri",
  "innovation.delete_own": "Menghapus draft milik sendiri",
  "file.manage_own": "Mengelola berkas inovasi milik sendiri",
  "innovation.read_any": "Melihat semua inovasi",
  "innovation.update_any": "Mengedit semua inovasi",
  "innovation.review": "Memeriksa, meminta revisi, menyetujui",
  "innovation.publish": "Mempublikasikan dan menarik publikasi",
  "innovation.delete_any": "Menghapus inovasi apa pun",
  "researcher.manage": "Mengelola data peneliti",
  "taxonomy.manage": "Mengelola fakultas, prodi, kategori, jenis",
  "file.manage_any": "Mengelola semua berkas",
  "collaboration.read": "Melihat permintaan kolaborasi",
  "collaboration.handle": "Menangani permintaan kolaborasi",
  "user.manage": "Mengaktifkan atau menonaktifkan pengguna",
  "role.assign": "Memberikan dan mencabut role",
  "settings.manage": "Mengubah pengaturan website",
  "audit.read": "Melihat audit log",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ROLES = {
  researcher: "Dosen / Peneliti",
  operator: "Operator",
  super_admin: "Super Administrator",
} as const;

export type RoleCode = keyof typeof ROLES;

const RESEARCHER: PermissionCode[] = [
  "public.read",
  "collaboration.create",
  "profile.update_own",
  "innovation.create",
  "innovation.read_own",
  "innovation.update_own",
  "innovation.submit_own",
  "innovation.withdraw_own",
  "innovation.delete_own",
  "file.manage_own",
];

const OPERATOR: PermissionCode[] = [
  ...RESEARCHER,
  "innovation.read_any",
  "innovation.update_any",
  "innovation.review",
  "innovation.publish",
  "innovation.delete_any",
  "researcher.manage",
  "taxonomy.manage",
  "file.manage_any",
  "collaboration.read",
  "collaboration.handle",
];

const SUPER_ADMIN: PermissionCode[] = [
  ...OPERATOR,
  "user.manage",
  "role.assign",
  "settings.manage",
  "audit.read",
];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  researcher: RESEARCHER,
  operator: OPERATOR,
  super_admin: SUPER_ADMIN,
};
