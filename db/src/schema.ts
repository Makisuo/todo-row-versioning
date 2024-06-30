import { boolean, integer, json, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core"

export const replicache_meta = pgTable("replicache_meta", {
	key: text("key").primaryKey().notNull(),
	value: json("value"),
})

export const replicache_client_group = pgTable("replicache_client_group", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	cvrVersion: integer("cvr_version").notNull(),
	lastModified: timestamp("last_modified", {
		precision: 6,
		mode: "string",
	})
		.notNull()
		.defaultNow(),
})

export const replicache_client = pgTable("replicache_client", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	clientGroupID: varchar("client_group_id", { length: 36 }).notNull(),
	lastMutationId: integer("last_mutation_id").notNull(),
	lastModified: timestamp("last_modified", {
		precision: 6,
		mode: "string",
	})
		.notNull()
		.defaultNow(),
})

export const list = pgTable("list", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	ownerId: varchar("owner_id", { length: 36 }).notNull(),
	name: text("name").notNull(),
	lastModified: timestamp("last_modified", {
		precision: 6,
		mode: "string",
	})
		.notNull()
		.defaultNow(),
})

export const share = pgTable("share", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	listid: varchar("list_id", { length: 36 }).notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	lastModified: timestamp("last_modified", {
		precision: 6,
		mode: "string",
	})
		.notNull()
		.defaultNow(),
})

export const item = pgTable("item", {
	id: varchar("id", { length: 36 }).primaryKey().notNull(),
	listid: varchar("list_id", { length: 36 }).notNull(),
	title: text("title").notNull(),
	complete: boolean("complete").notNull(),
	ord: integer("ord").notNull(),
	lastModified: timestamp("last_modified", {
		precision: 6,
		mode: "string",
	})
		.notNull()
		.defaultNow(),
})
