-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE IF NOT EXISTS "replicache_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replicache_client_group" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"userid" varchar(36) NOT NULL,
	"cvrversion" integer NOT NULL,
	"lastmodified" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replicache_client" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"clientgroupid" varchar(36) NOT NULL,
	"lastmutationid" integer NOT NULL,
	"lastmodified" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "list" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"ownerid" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"lastmodified" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"listid" varchar(36) NOT NULL,
	"userid" varchar(36) NOT NULL,
	"lastmodified" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"listid" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"complete" boolean NOT NULL,
	"ord" integer NOT NULL,
	"lastmodified" timestamp(6) NOT NULL
);

*/