import postgres from "postgres"

import { drizzle } from "drizzle-orm/postgres-js"
import { schema } from "."

const queryClient = postgres(process.env.DATABASE_URL!)

export const db = drizzle(queryClient, { schema })

export type Databse = typeof db
