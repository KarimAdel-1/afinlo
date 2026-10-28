// Qloo's entities, tags and request traces, as the Qloo client (src/platform/taste/qloo.ts) returns them.
import { z } from "zod";

export const CATEGORIES = [
  "artist",
  "movie",
  "tv_show",
  "book",
  "podcast",
  "video_game",
  "brand",
  "place",
  "destination",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;
/** Qloo's entity type for each category. Qloo spells games "videogame"; the stored key stays "video_game". */
export const QLOO_TYPES: Record<Category, string> = {
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  book: "urn:entity:book",
  podcast: "urn:entity:podcast",
  video_game: "urn:entity:videogame",
  brand: "urn:entity:brand",
  place: "urn:entity:place",
  destination: "urn:entity:destination",
};
export const categoryOfType = (type: string): Category | undefined =>
  CATEGORIES.find((c) => QLOO_TYPES[c] === type);
export const GEOGRAPHIC: readonly Category[] = ["place", "destination"];
export const entityId = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i)
  .transform((v) => v.toUpperCase());
export interface TasteEntity {
  id: string;
  name: string;
  category: Category;
  description: string;
  disambiguation: string;
  image?: string;
  tags: { id: string; name: string }[];
  affinity?: number;
  popularity?: number;
  /** Source pages built only from identifiers or websites Qloo returned for this entity. */
  links?: { label: string; url: string }[];
}
export interface TasteTag {
  id: string;
  name: string;
  affinity?: number;
  /** The tag kind, such as urn:tag:genre:music. */
  type?: string;
}
export interface TasteTrace {
  tool:
    | "qloo_search"
    | "qloo_recommend"
    | "qloo_taste_tags"
    | "qloo_rank"
    | "qloo_tag_search"
    | "qloo_entities"
    | "qloo_heatmap"
    | "qloo_demographics"
    | "qloo_compare";
  endpoint: string;
  parameters: Record<string, string>;
  at: string;
  durationMs: number;
  count: number;
  status: "ok" | "error";
  requestId?: string;
  error?: string;
  /** Answered from the cache: no Qloo request was made. */
  cached?: boolean;
}
export class TasteError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "TasteError";
  }
}
