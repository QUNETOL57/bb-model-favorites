import { z } from "zod";

/** One starred provider/model/reasoning combination. */
export const favoriteSchema = z.object({
  providerId: z.string().min(1).max(100),
  model: z.string().min(1).max(300),
  reasoningLevel: z.string().max(100),
  serviceTier: z.string().max(100).optional(),
  addedAt: z.number().int().nonnegative(),
});
export type Favorite = z.infer<typeof favoriteSchema>;

export const reasoningSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
});
export type ReasoningOption = z.infer<typeof reasoningSchema>;

/** A model as the picker labels it, plus the reasoning levels it supports. */
export const pickerModelSchema = z.object({
  id: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  routeProviderId: z.string().min(1).max(200).optional(),
  defaultReasoning: z.string().max(100).optional(),
  reasoning: z.array(reasoningSchema).max(50),
});
export type PickerModel = z.infer<typeof pickerModelSchema>;

export const pickerProviderSchema = z.object({
  id: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  brandPrefix: z.string().max(100).optional(),
  models: z.array(pickerModelSchema).max(600),
  more: z.array(pickerModelSchema).max(600),
});
export type PickerProvider = z.infer<typeof pickerProviderSchema>;

export const catalogSchema = z.object({
  providers: z.array(pickerProviderSchema).max(100),
  favorites: z.array(favoriteSchema).max(200),
  autoOpen: z.boolean(),
});
export type Catalog = z.infer<typeof catalogSchema>;
