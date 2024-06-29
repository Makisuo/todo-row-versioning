import { generate } from "@rocicorp/rails"
import { z } from "zod"

export const shareSchema = z.object({
	id: z.string(),
	listID: z.string(),
	userId: z.string(),
})

export type Share = z.infer<typeof shareSchema>

export const { init: createShare, list: listShares, delete: deleteShare } = generate("share", shareSchema.parse)
