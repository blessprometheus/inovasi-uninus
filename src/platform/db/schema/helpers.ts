import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** Primary key UUIDv7 (dibuat aplikasi, urut waktu sehingga indeks efisien). */
export const pk = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
