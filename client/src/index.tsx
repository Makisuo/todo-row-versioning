import { nanoid } from "nanoid"
import React, { useCallback, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { Replicache } from "replicache"
import App from "./app"
import "./index.css"
import { type M, mutators } from "./mutators"

async function init() {
	// See https://doc.replicache.dev/licensing for how to get a license key.
	const licenseKey = import.meta.env.VITE_REPLICACHE_LICENSE_KEY
	if (!licenseKey) {
		throw new Error("Missing VITE_REPLICACHE_LICENSE_KEY")
	}

	function Root() {
		const [userId, setuserId] = useState("")
		const [r, setR] = useState<Replicache<M> | null>(null)

		useEffect(() => {
			if (!userId) {
				return
			}
			console.info("updating replicache")
			const r = new Replicache({
				name: userId,
				licenseKey,
				mutators,
				pushURL: `http://localhost:3000/replicache/push?userId=${userId}`,
				pullURL: `http://localhost:3000/replicache/pull?userId=${userId}`,
				logLevel: "debug",
			})
			setR(r)
			return () => {
				void r.close()
			}
		}, [userId])

		const storageListener = useCallback(() => {
			let userId = localStorage.getItem("userId")
			if (!userId) {
				userId = nanoid(6)
				localStorage.setItem("userId", userId)
			}
			setuserId(userId)
		}, [])

		// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
		useEffect(() => {
			storageListener()
			addEventListener("storage", storageListener, false)
			return () => {
				removeEventListener("storage", storageListener, false)
			}
		}, [])

		const handleuserIdChange = (userId: string) => {
			localStorage.setItem("userId", userId)
			storageListener()
		}

		return r && <App rep={r} userId={userId} onuserIdChange={(userId) => handleuserIdChange(userId)} />
	}

	ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
		<React.StrictMode>
			<Root />
		</React.StrictMode>,
	)
}

await init()
