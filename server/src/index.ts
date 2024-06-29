import { Hono } from "hono"

import { zValidator } from "@hono/zod-validator"
import { cors } from "hono/cors"
import { z } from "zod"
import { pull, pullRequest } from "./pull"
import { push } from "./push"

import { streamSSE } from "hono/streaming"
import { getPokeBackend } from "./poke"

const app = new Hono()

app.use("*", cors())

app.get("/", (c) => {
	return c.text("Hello Hono!")
})

app.post(
	"/replicache/pull",
	zValidator("json", pullRequest),
	zValidator(
		"query",
		z.object({
			userId: z.string(),
		}),
	),
	async (c) => {
		try {
			const { userId } = c.req.valid("query")
			const body = c.req.valid("json")

			const resp = await pull(userId, body)
			return c.json(resp)
		} catch (e) {
			console.error(e)
			return c.text("Invalid request", 500)
		}
	},
)

app.post(
	"/replicache/push",
	zValidator(
		"query",
		z.object({
			userId: z.string(),
		}),
	),
	async (c) => {
		try {
			const { userId } = c.req.valid("query")
			const body = await c.req.json()

			await push(userId, body)
			return c.json({}, 200)
		} catch (e) {
			console.error(e)
			return c.text("WOW ERROR", 404)
		}
	},
)

app.get("/replicache/poke", async (c) => {
	return streamSSE(c, async (stream) => {
		const { channel } = c.req.query()

		if (channel === undefined) {
			return c.text("Missing channel", 400)
		}

		c.res.headers.set("Access-Control-Allow-Origin", "*")
		c.res.headers.set("Content-Type", "text/event-stream;charset=utf-8")
		c.res.headers.set("Cache-Control", "no-cache, no-transform")
		c.res.headers.set("X-Accel-Buffering", "no")

		await stream.writeSSE({
			data: "hello",
			event: "hello",
			id: `${Date.now()}`,
		})

		const pokeBackend = getPokeBackend()

		const unlisten = pokeBackend.addListener(channel as string, async () => {
			await stream.writeSSE({
				data: "poke",
				event: "poke",
				id: `${Date.now()}`,
			})
			console.log(`Sending poke for channel ${channel}`)
		})

		setInterval(() => {
			stream.writeSSE({
				data: "beat",
				event: "life-beat",
				id: `${Date.now()}`,
			})
		}, 30 * 1000)

		stream.onAbort(() => {
			console.log("Closing poke connection")
			unlisten()
		})
	})
})

export default app
