import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';

// M0: only the session table; the data tables arrive in M1.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  state: jsonb('state').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
