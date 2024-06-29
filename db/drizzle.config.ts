import { defineConfig } from "drizzle-kit"

export default defineConfig({
	schema: "./src/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATBASE_URL || "postgres://postgres@127.0.0.1:5432/postgres",
	},
	verbose: true,
	strict: true,
})
