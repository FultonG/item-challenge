/**
 * Zod Validators for our API Shapes, this will run during handlers not at the gateway level
 */

import { z } from "zod";

export const itemTypeSchema = z.enum([
  "multiple-choice",
  "free-response",
  "essay",
]);
export const itemStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "archived",
]);
export const securityLevelSchema = z.enum(['standard', 'secure', 'highly-secure']);

const contentSchema = z.object({
  question: z.string().min(1, "question is required"),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().min(1, "correctAnswer is required"),
  explanation: z.string().min(1, "explanation is required"),
});

const metadataSchema = z.object({
  author: z.string().min(1),
  status: itemStatusSchema,
  tags: z.array(z.string()),
});

export const createItemRequestSchema = z
  .object({
    subject: z.string().min(1),
    itemType: itemTypeSchema,
    difficulty: z.number().int().min(1).max(5),
    content: contentSchema,
    metadata: metadataSchema,
    securityLevel: securityLevelSchema,
  })
  .superRefine((createItemRequest, context) => {
    if (createItemRequest.itemType === "multiple-choice") {
      const options = createItemRequest.content.options ?? [];
      if (options.length < 2) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content", "options"],
          message: "multiple-choice items require at least 2 options",
        });
      }
      if (
        options.length > 0 &&
        !options.includes(createItemRequest.content.correctAnswer)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content", "correctAnswer"],
          message: "correctAnswer must be one of the options provided",
        });
      }
    }
  });

export const updateItemRequestSchema = z
  .object({
    subject: z.string().min(1).optional(),
    itemType: itemTypeSchema.optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    content: contentSchema.partial().optional(),
    metadata: metadataSchema.partial().optional(),
    securityLevel: securityLevelSchema.optional(),
  })
  .refine((updateItemRequest) => Object.keys(updateItemRequest).length > 0, {
    message: "update item request must include at least one updated field",
  });

export const listItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  subject: z.string().min(1).optional(),
  status: itemStatusSchema.optional(),
  nextToken: z.string().optional(),
});

export const itemIdSchema = z.string().uuid({ message: 'id must be a valid UUID' });

export function formatZodErrors(
  err: z.ZodError,
): { path: string; message: string }[] {
  return err.errors.map((e) => ({
    path: e.path.length > 0 ? e.path.join(".") : "(root)",
    message: e.message,
  }));
}
