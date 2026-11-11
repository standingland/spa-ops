import { z } from 'zod';

const optText = z.string().trim().optional().transform((v) => (v ? v : undefined));

export const CategoryInput = z.object({
  id: z.uuid().optional(),
  nameTh: z.string().trim().min(1).max(60),
  nameEn: optText,
  sortOrder: z.number().int().min(0).optional(),
});
export type CategoryInput = z.input<typeof CategoryInput>;

export const ServiceInput = z.object({
  id: z.uuid().optional(),
  nameTh: z.string().trim().min(1).max(120),
  nameEn: optText,
  durationMin: z.number().int().min(1).max(600),
  priceSatang: z.number().int().min(0),
  requiredEquipment: z.array(z.string().trim().min(1)),
  categoryIds: z.array(z.uuid()),
});
export type ServiceInput = z.input<typeof ServiceInput>;
