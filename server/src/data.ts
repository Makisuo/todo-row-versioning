import { type Databse, db, eq, inArray, or, schema, sql } from "@hazel/db"
import { union } from "drizzle-orm/pg-core"
import type { List, Share, Todo, TodoUpdate } from "shared"

export type SearchResult = {
	id: string
	rowversion: number
}

export type ClientGroupRecord = {
	id: string
	userId: string
	cvrVersion: number
}

export type ClientRecord = {
	id: string
	clientGroupID: string
	lastMutationId: number
}

export type Affected = {
	listIDs: string[]
	userIds: string[]
}

export async function createList(executor: Databse, userId: string, list: List): Promise<Affected> {
	if (userId !== list.ownerId) {
		throw new Error("Authorization error, cannot create list for other user")
	}
	await executor.insert(schema.list).values({
		id: list.id,
		ownerId: list.ownerId,
		name: list.name,
	})

	return { listIDs: [], userIds: [list.ownerId] }
}

export async function deleteList(executor: Databse, userId: string, listID: string): Promise<Affected> {
	await requireAccessToList(executor, listID, userId)

	const userIds = await getAccessors(executor, listID)
	await executor.delete(schema.list).where(eq(schema.list.id, listID))
	return {
		listIDs: [],
		userIds,
	}
}

export async function searchLists(executor: Databse, { accessibleByuserId }: { accessibleByuserId: string }) {
	const query = executor
		.select({
			id: schema.list.id,
			rowversion: sql<number>`xmin`.as("rowversion"),
		})
		.from(schema.list)
		.where(
			or(
				eq(schema.list.ownerId, sql.placeholder("userId")),
				inArray(
					schema.list.id,
					db
						.select({ listid: schema.share.listid })
						.from(schema.share)
						.where(eq(schema.share.userId, sql.placeholder("userId"))),
				),
			),
		)
	const result = await query.execute({ userId: accessibleByuserId })

	return result as SearchResult[]
}

export async function getLists(executor: Databse, listIDs: string[]) {
	if (listIDs.length === 0) return []

	const lists = await executor.query.list.findMany({
		columns: {
			id: true,
			name: true,
			ownerId: true,
		},
		where: (table, { inArray }) => inArray(table.id, listIDs),
	})

	return lists
}

export async function createShare(executor: Databse, userId: string, share: Share): Promise<Affected> {
	await requireAccessToList(executor, share.listID, userId)

	await executor.insert(schema.share).values({
		id: share.id,
		listid: share.listID,
		userId: share.userId,
	})

	return {
		listIDs: [share.listID],
		userIds: [share.userId],
	}
}

export async function deleteShare(executor: Databse, userId: string, id: string): Promise<Affected> {
	const [share] = await getShares(executor, [id])

	if (!share) {
		throw new Error("Specified share doesn't exist")
	}

	await requireAccessToList(executor, share.listID, userId)

	await executor.delete(schema.share).where(eq(schema.share.id, id))

	return {
		listIDs: [share.listID],
		userIds: [share.userId],
	}
}

export async function searchShares(executor: Databse, { listIDs }: { listIDs: string[] }) {
	if (listIDs.length === 0) return []

	const result = await executor
		.select({
			id: schema.share.id,
			rowversion: sql<number>`${schema.share}.xmin`.as("rowversion"),
		})
		.from(schema.share)
		.innerJoin(schema.list, eq(schema.share.listid, schema.list.id))
		.where(inArray(schema.list.id, listIDs))

	return result as SearchResult[]
}

export async function getShares(executor: Databse, shareIDs: string[]) {
	if (shareIDs.length === 0) return []

	const shares = await executor.query.share.findMany({
		columns: {
			id: true,
			listid: true,
			userId: true,
		},
		where: (table, { inArray }) => inArray(table.id, shareIDs),
	})

	return shares.map((r) => {
		const share: Share = {
			id: r.id,
			listID: r.listid,
			userId: r.userId,
		}
		return share
	})
}

export async function createTodo(executor: Databse, userId: string, todo: Omit<Todo, "sort">): Promise<Affected> {
	const maxOrd = await executor
		.select({
			maxord: sql<number>`max(ord)`.as("maxord"),
		})
		.from(schema.item)
		.where(eq(schema.item.listid, todo.listID))
		.limit(1)
		.then((r) => r[0]?.maxord ?? 0)

	await executor.insert(schema.item).values({
		id: todo.id,
		listid: todo.listID,
		title: todo.text,
		complete: todo.completed,
		ord: maxOrd + 1,
	})

	return {
		listIDs: [todo.listID],
		userIds: [],
	}
}

export async function updateTodo(executor: Databse, userId: string, update: TodoUpdate): Promise<Affected> {
	const todo = await mustGetTodo(executor, update.id)
	await requireAccessToList(executor, todo.listID, userId)

	await executor
		.update(schema.item)
		.set({
			title: update.text,
			complete: update.completed,
			ord: update.sort,
		})
		.where(eq(schema.item.id, update.id))

	return {
		listIDs: [todo.listID],
		userIds: [],
	}
}

export async function deleteTodo(executor: Databse, userId: string, todoID: string): Promise<Affected> {
	const todo = await mustGetTodo(executor, todoID)
	await requireAccessToList(executor, todo.listID, userId)

	await executor.delete(schema.item).where(eq(schema.item.id, todoID))

	return {
		listIDs: [todo.listID],
		userIds: [],
	}
}

export async function searchTodos(executor: Databse, { listIDs }: { listIDs: string[] }) {
	if (listIDs.length === 0) return []

	const result = await executor
		.select({
			id: schema.item.id,
			rowversion: sql<number>`xmin`.as("rowversion"),
		})
		.from(schema.item)
		.where(inArray(schema.item.listid, listIDs))

	return result as SearchResult[]
}

export async function mustGetTodo(executor: Databse, id: string) {
	const [todo] = await getTodos(executor, [id])

	if (!todo) {
		throw new Error("Specified todo does not exist")
	}

	return todo
}

export async function getTodos(executor: Databse, todoIDs: string[]) {
	if (todoIDs.length === 0) return []

	const todos = await executor.query.item.findMany({
		columns: {
			id: true,
			listid: true,
			title: true,
			complete: true,
			ord: true,
		},
		where: (table, { inArray }) => inArray(table.id, todoIDs),
	})

	return todos.map((r) => {
		const todo: Todo = {
			id: r.id,
			listID: r.listid,
			text: r.title,
			completed: r.complete,
			sort: r.ord,
		}
		return todo
	})
}

export async function putClientGroup(executor: Databse, clientGroup: ClientGroupRecord) {
	const { id, userId, cvrVersion } = clientGroup

	await executor
		.insert(schema.replicache_client_group)
		.values({
			id,
			userId: userId,
			cvrVersion: cvrVersion,
		})
		.onConflictDoUpdate({
			set: {
				cvrVersion: cvrVersion,
				userId: userId,
			},
			target: schema.replicache_client_group.id,
		})
}

export async function getClientGroup(
	executor: Databse,
	clientGroupID: string,
	userId: string,
): Promise<ClientGroupRecord> {
	const clientGroup = await executor.query.replicache_client_group.findFirst({
		columns: {
			userId: true,
			cvrVersion: true,
		},
		where: (table, { eq }) => eq(table.id, clientGroupID),
	})

	if (!clientGroup) {
		return {
			id: clientGroupID,
			userId,
			cvrVersion: 0,
		}
	}

	if (clientGroup.userId !== userId) {
		throw new Error("Authorization error - user does not own client group")
	}

	return {
		id: clientGroupID,
		userId: clientGroup.userId,
		cvrVersion: clientGroup.cvrVersion,
	}
}

export async function searchClients(executor: Databse, { clientGroupID }: { clientGroupID: string }) {
	const clients = await executor.query.replicache_client.findMany({
		columns: {
			id: true,
			clientGroupID: true,
			lastMutationId: true,
		},
		where: (table, { eq }) => eq(table.clientGroupID, clientGroupID),
	})

	const mappedClients = clients.map((r) => {
		return {
			id: r.id,
			clientGroupID: r.clientGroupID,
			rowversion: r.lastMutationId,
		}
	})

	return mappedClients as SearchResult[]
}

export async function getClient(executor: Databse, clientID: string, clientGroupID: string): Promise<ClientRecord> {
	const client = await executor.query.replicache_client.findFirst({
		columns: {
			clientGroupID: true,
			lastMutationId: true,
		},
		where: (table, { eq }) => eq(table.id, clientID),
	})

	if (!client) {
		return {
			id: clientID,
			clientGroupID: "",
			lastMutationId: 0,
		}
	}

	if (client.clientGroupID !== clientGroupID) {
		throw new Error("Authorization error - client does not belong to client group")
	}
	return {
		id: clientID,
		clientGroupID: client.clientGroupID,
		lastMutationId: client.lastMutationId,
	}
}

export async function putClient(executor: Databse, client: ClientRecord) {
	const { id, clientGroupID, lastMutationId } = client
	await executor
		.insert(schema.replicache_client)
		.values({
			id,
			clientGroupID: clientGroupID,
			lastMutationId: lastMutationId,
		})
		.onConflictDoUpdate({
			set: {
				clientGroupID: clientGroupID,
				lastMutationId: lastMutationId,
			},
			target: schema.replicache_client.id,
		})
}

export async function getAccessors(executor: Databse, listID: string) {
	const result = await union(
		executor.select({ userId: schema.list.ownerId }).from(schema.list).where(eq(schema.list.id, listID)),
		executor.select({ userId: schema.share.userId }).from(schema.share).where(eq(schema.share.listid, listID)),
	)

	return result.map((r) => r.userId) as string[]
}

async function requireAccessToList(executor: Databse, listID: string, accessinguserId: string) {
	const result = await executor
		.select({
			id: schema.list.id,
		})
		.from(schema.list)
		.where(or(eq(schema.list.id, listID), inArray(schema.list.id, await getAccessors(executor, listID))))
		.limit(1)

	if (result.length === 0) {
		throw new Error("Authorization error, can't access list")
	}
}
