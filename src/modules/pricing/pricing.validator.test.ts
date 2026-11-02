import { describe, it, expect } from '@jest/globals';
import { createPricingGridSchema, updatePricingConfigSchema } from './pricing.validator.js';

describe('pricing.validator — prix par minute', () => {
  it('accepte 0 € par minute (tarification au kilomètre seulement)', () => {
    expect(updatePricingConfigSchema.safeParse({ price_per_min: 0 }).success).toBe(true);
    expect(createPricingGridSchema.safeParse({
      base_price: 3, price_per_km: 1.3, price_per_min: 0, minimum_price: 10,
    }).success).toBe(true);
  });

  it('refuse un prix par minute négatif', () => {
    expect(updatePricingConfigSchema.safeParse({ price_per_min: -0.1 }).success).toBe(false);
  });

  it('exige toujours un prix au kilomètre strictement positif', () => {
    expect(updatePricingConfigSchema.safeParse({ price_per_km: 0 }).success).toBe(false);
  });
});
