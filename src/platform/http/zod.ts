/**
 * Titik impor tunggal Zod. Mengimpor modul ini menjamin locale Bahasa Indonesia sudah terpasang
 * (side effect di ./response) sebelum schema apa pun dibuat.
 */
import "./response";
export { z } from "zod";
