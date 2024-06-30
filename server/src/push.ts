import { type Databse, db } from "@hazel/db"
import type { ReadonlyJSONValue } from "replicache"
import { listSchema, shareSchema, todoSchema } from "shared"
import { z } from "zod"
import {
	type Affected,
	createList,
	createShare,
	createTodo,
	deleteList,
	deleteShare,
	deleteTodo,
	getClient,
	getClientGroup,
	putClient,
	putClientGroup,
	updateTodo,
} from "./data"
import { getPokeBackend } from "./poke"

const mutationSchema = z.object({
	id: z.number(),
	clientID: z.string(),
	name: z.string(),
	args: z.any(),
})

type Mutation = z.infer<typeof mutationSchema>

const pushRequestSchema = z.object({
	clientGroupID: z.string(),
	mutations: z.array(mutationSchema),
})

export async function push(userId: string, requestBody: ReadonlyJSONValue) {
	console.info("Processing push", JSON.stringify(requestBody, null, ""))

	const push = pushRequestSchema.parse(requestBody)

	const t0 = Date.now()

	const allAffected = {
		listIDs: new Set<string>(),
		userIds: new Set<string>(),
	}

	for (const mutation of push.mutations) {
		try {
			const affected = await processMutation(userId, push.clientGroupID, mutation, false)
			for (const listID of affected.listIDs) {
				allAffected.listIDs.add(listID)
			}
			for (const userId of affected.userIds) {
				allAffected.userIds.add(userId)
			}
		} catch (e) {
			await processMutation(userId, push.clientGroupID, mutation, true)
		}
	}

	const pokeBackend = getPokeBackend()
	for (const listID of allAffected.listIDs) {
		pokeBackend.poke(`list/${listID}`)
	}
	for (const userId of allAffected.userIds) {
		pokeBackend.poke(`user/${userId}`)
	}

	console.info("Processed all mutations in", Date.now() - t0)
}

// Implements the push algorithm from
// https://doc.replicache.dev/strategies/row-version#push
async function processMutation(
	userId: string,
	clientGroupID: string,
	mutation: Mutation,
	// 1: `let errorMode = false`. In JS, we implement this step naturally
	// as a param. In case of failure, caller will call us again with `true`.
	errorMode: boolean,
): Promise<Affected> {
	// 2: beginTransaction
	return await db.transaction(async (executor) => {
		let affected: Affected = { listIDs: [], userIds: [] }

		console.info("Processing mutation", errorMode ? "errorMode" : "", JSON.stringify(mutation, null, ""))

		// 3: `getClientGroup(body.clientGroupID)`
		// 4: Verify requesting user owns cg (in function)
		const clientGroup = await getClientGroup(executor, clientGroupID, userId)
		// 5: `getClient(mutation.clientID)`
		// 6: Verify requesting client group owns requested client
		const baseClient = await getClient(executor, mutation.clientID, clientGroupID)

		// 7: init nextMutationID
		const nextMutationID = baseClient.lastMutationId + 1

		// 8: rollback and skip if already processed.
		if (mutation.id < nextMutationID) {
			console.info(`Mutation ${mutation.id} has already been processed - skipping`)
			return affected
		}

		// 9: Rollback and error if from future.
		if (mutation.id > nextMutationID) {
			throw new Error(`Mutation ${mutation.id} is from the future - aborting`)
		}

		const t1 = Date.now()

		if (!errorMode) {
			try {
				// 10(i): Run business logic
				// 10(i)(a): xmin column is automatically updated by Postgres for any
				//   affected rows.
				affected = await mutate(executor, userId, mutation)
			} catch (e) {
				// 10(ii)(a-c): log error, abort, and retry
				console.error(`Error executing mutation: ${JSON.stringify(mutation)}: ${e}`)
				throw e
			}
		}

		// 11-12: put client and client group
		const nextClient = {
			id: mutation.clientID,
			clientGroupID,
			lastMutationId: nextMutationID,
		}

		await Promise.all([putClientGroup(executor, clientGroup), putClient(executor, nextClient)])

		console.info("Processed mutation in", Date.now() - t1)
		return affected
	})
}

async function mutate(executor: Databse, userId: string, mutation: Mutation): Promise<Affected> {
	console.info("Processing mutation", mutation)
	switch (mutation.name) {
		case "createList":
			return await createList(executor, userId, listSchema.parse(mutation.args))
		case "deleteList":
			return await deleteList(executor, userId, z.string().parse(mutation.args))
		case "createTodo":
			return await createTodo(executor, userId, todoSchema.omit({ sort: true }).parse(mutation.args))
		case "createShare":
			return await createShare(executor, userId, shareSchema.parse(mutation.args))
		case "deleteShare":
			return await deleteShare(executor, userId, z.string().parse(mutation.args))
		case "updateTodo":
			return await updateTodo(
				executor,
				userId,
				todoSchema
					.partial()
					.merge(todoSchema.pick({ id: true }))
					.parse(mutation.args),
			)
		case "deleteTodo":
			return await deleteTodo(executor, userId, z.string().parse(mutation.args))
		default:
			return {
				listIDs: [],
				userIds: [],
			}
	}
}
