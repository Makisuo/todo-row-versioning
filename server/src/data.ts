import { type Databse, db, eq, inArray, or, schema, sql } from "@hazel/db"
import { union } from "drizzle-orm/pg-core"
import type { List, Share, Todo, TodoUpdate } from "shared"
import type { Executor } from "./pg.js"

export type SearchResult = {
	id: string
	rowversion: number
}

export type ClientGroupRecord = {
	id: string
	userID: string
	cvrVersion: number
}

export type ClientRecord = {
	id: string
	clientGroupID: string
	lastMutationID: number
}

export type Affected = {
	listIDs: string[]
	userIDs: string[]
}

export async function createList(executor: Databse, userID: string, list: List): Promise<Affected> {
	if (userID !== list.ownerID) {
		throw new Error("Authorization error, cannot create list for other user")
	}
	await executor.insert(schema.list).values({
		id: list.id,
		ownerid: list.ownerID,
		name: list.name,
	})

	return { listIDs: [], userIDs: [list.ownerID] }
}

export async function deleteList(executor: Databse, userID: string, listID: string): Promise<Affected> {
	await requireAccessToList(executor, listID, userID)
	const userIDs = await getAccessors(executor, listID)
	await executor.delete(schema.list).where(eq(schema.list.id, listID))
	return {
		listIDs: [],
		userIDs,
	}
}

export async function searchLists(executor: Databse, { accessibleByUserID }: { accessibleByUserID: string }) {
	const query = executor
		.select({
			id: schema.list.id,
			rowversion: sql<number>`xmin`.as("rowversion"),
		})
		.from(schema.list)
		.where(
			or(
				eq(schema.list.ownerid, sql.placeholder("userId")),
				inArray(
					schema.list.id,
					db
						.select({ listid: schema.share.listid })
						.from(schema.share)
						.where(eq(schema.share.userid, sql.placeholder("userId"))),
				),
			),
		)
	const result = await query.execute({ userId: accessibleByUserID })

	return result as SearchResult[]
}

export async function getLists(executor: Databse, listIDs: string[]) {
	if (listIDs.length === 0) return []

	const lists = await executor.query.list.findMany({
		columns: {
			id: true,
			name: true,
			ownerid: true,
		},
		where: (table, { inArray }) => inArray(table.id, listIDs),
	})

	return lists
}

export async function createShare(executor: Databse, userID: string, share: Share): Promise<Affected> {
	await requireAccessToList(executor, share.listID, userID)

	await executor.insert(schema.share).values({
		id: share.id,
		listid: share.listID,
		userid: share.userID,
	})

	return {
		listIDs: [share.listID],
		userIDs: [share.userID],
	}
}

export async function deleteShare(executor: Databse, userID: string, id: string): Promise<Affected> {
	const [share] = await getShares(executor, [id])

	if (!share) {
		throw new Error("Specified share doesn't exist")
	}

	await requireAccessToList(executor, share.listID, userID)

	await executor.delete(schema.share).where(eq(schema.share.id, id))

	return {
		listIDs: [share.listID],
		userIDs: [share.userID],
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
			userid: true,
		},
		where: (table, { inArray }) => inArray(table.id, shareIDs),
	})

	return shares.map((r) => {
		const share: Share = {
			id: r.id,
			listID: r.listid,
			userID: r.userid,
		}
		return share
	})
}

export async function createTodo(executor: Databse, userID: string, todo: Omit<Todo, "sort">): Promise<Affected> {
	await requireAccessToList(executor, todo.listID, userID)
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
		userIDs: [],
	}
}

export async function updateTodo(executor: Databse, userID: string, update: TodoUpdate): Promise<Affected> {
	const todo = await mustGetTodo(executor, update.id)
	await requireAccessToList(executor, todo.listID, userID)

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
		userIDs: [],
	}
}

export async function deleteTodo(executor: Databse, userID: string, todoID: string): Promise<Affected> {
	const todo = await mustGetTodo(executor, todoID)
	await requireAccessToList(executor, todo.listID, userID)

	await executor.delete(schema.item).where(eq(schema.item.id, todoID))

	return {
		listIDs: [todo.listID],
		userIDs: [],
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
	const { id, userID, cvrVersion } = clientGroup

	await executor.insert(schema.replicache_client_group).values({
		id,
		userid: userID,
		cvrversion: cvrVersion,
	})
}

export async function getClientGroup(
	executor: Databse,
	clientGroupID: string,
	userID: string,
): Promise<ClientGroupRecord> {
	const clientGroup = await executor.query.replicache_client_group.findFirst({
		columns: {
			userid: true,
			cvrversion: true,
		},
		where: (table, { eq }) => eq(table.id, clientGroupID),
	})

	if (!clientGroup) {
		return {
			id: clientGroupID,
			userID,
			cvrVersion: 0,
		}
	}

	if (clientGroup.userid !== userID) {
		throw new Error("Authorization error - user does not own client group")
	}

	return {
		id: clientGroupID,
		userID: clientGroup.userid,
		cvrVersion: clientGroup.cvrversion,
	}
}

export async function searchClients(executor: Databse, { clientGroupID }: { clientGroupID: string }) {
	const clients = await executor.query.replicache_client.findMany({
		columns: {
			id: true,
			clientgroupid: true,
			lastmutationid: true,
		},
		where: (table, { eq }) => eq(table.clientgroupid, clientGroupID),
	})

	const mappedClients = clients.map((r) => {
		return {
			id: r.id,
			clientGroupID: r.clientgroupid,
			rowversion: r.lastmutationid,
		}
	})

	return mappedClients as SearchResult[]
}

export async function getClient(executor: Databse, clientID: string, clientGroupID: string): Promise<ClientRecord> {
	const client = await executor.query.replicache_client.findFirst({
		columns: {
			clientgroupid: true,
			lastmutationid: true,
		},
		where: (table, { eq }) => eq(table.id, clientID),
	})

	if (!client) {
		return {
			id: clientID,
			clientGroupID: "",
			lastMutationID: 0,
		}
	}

	if (client.clientgroupid !== clientGroupID) {
		throw new Error("Authorization error - client does not belong to client group")
	}
	return {
		id: clientID,
		clientGroupID: client.clientgroupid,
		lastMutationID: client.lastmutationid,
	}
}

export async function putClient(executor: Databse, client: ClientRecord) {
	const { id, clientGroupID, lastMutationID } = client
	await executor.insert(schema.replicache_client).values({
		id,
		clientgroupid: clientGroupID,
		lastmutationid: lastMutationID,
	})
}

export async function getAccessors(executor: Databse, listID: string) {
	const query = union(
		executor.select({ userid: schema.list.ownerid }).from(schema.list).where(sql`${schema.list.id} = $1`),
		executor.select({ userid: schema.share.userid }).from(schema.share).where(sql`${schema.share.listid} = $1`),
	)

	const result = await query.prepare("getAccessors").execute({ $1: listID })

	return result.map((r) => r.userid) as string[]
}

async function requireAccessToList(executor: Databse, listID: string, accessingUserID: string) {
	const result = await executor
		.select({
			one: sql<number>`1`.as("one"),
		})
		.from(schema.list)
		.where(or(eq(schema.list.id, listID), inArray(schema.list.id, await getAccessors(executor, listID))))
		.limit(1)

	if (result.length === 0) {
		throw new Error("Authorization error, can't access list")
	}
}
