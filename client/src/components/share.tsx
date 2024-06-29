import { Dialog } from "@headlessui/react"
import { nanoid } from "nanoid"
import type { FormEvent } from "react"
import type { Replicache } from "replicache"
import { useSubscribe } from "replicache-react"
import { listShares } from "shared"
import type { M } from "../mutators"

export function Share({ rep, listID }: { rep: Replicache<M>; listID: string }) {
	const guests = useSubscribe(
		rep,
		async (tx) => {
			const allShares = await listShares(tx)
			return allShares.filter((a) => a.listID === listID)
		},
		{ default: [] },
	)

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		void rep.mutate.createShare({
			id: nanoid(),
			listID,
			userId: (e.target as HTMLFormElement).userId.value,
		})
		e.preventDefault()
	}

	const handleDelete = async (id: string) => {
		await rep.mutate.deleteShare(id)
	}

	return (
		<>
			<div id="share-overlay" aria-hidden="true" />
			<Dialog.Panel>
				<div id="share-content">
					<h1>Add Collaborator</h1>
					<form id="add-collaborator" onSubmit={(e) => handleSubmit(e)}>
						<label htmlFor="userId">userId:</label>
						<input type="text" id="userId" required={true} />
						<input type="submit" value="Add" />
					</form>
					<h1>Current Collaborators</h1>
					<div id="current-collaborators">
						{guests.length === 0 ? (
							"No guests"
						) : (
							<table>
								<tbody>
									{guests.map((g) => (
										<tr key={g.id}>
											<td>{g.userId}</td>
											<td>
												<button className="destroy" onClick={() => handleDelete(g.id)}>
													x
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>
			</Dialog.Panel>
		</>
	)
}
