import { z } from 'zod';

export const upsertAppConfigSchema = z.object({
  value: z.string().max(500),
});
