import { z } from "zod";
import { DOC_TYPES, PRIORITIES, TASK_STATUSES } from "./constants.js";

// --- Project schemas ---

export const ProjectCreateSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(2000).optional(),
    path: z.string().optional(),
    db_dir: z.string().min(1).optional(),
  })
  .strict();

export const ProjectUpdateSchema = z
  .object({
    db_dir: z.string().min(1),
  })
  .strict();

// --- Task schemas ---

export const TaskCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    priority: z.enum(PRIORITIES).default("P1"),
    epic: z.string().max(100).optional(),
    tags: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    acceptance_criteria: z.array(z.string()).default([]),
    context_refs: z.array(z.string()).default([]),
    verify: z.string().max(2000).optional(),
    status: z.enum(["backlog", "open"]).default("open"),
  })
  .strict();

export const TaskBatchCreateSchema = z.array(TaskCreateSchema).min(1).max(200);

export const TaskUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    assignee: z.string().max(100).nullable().optional(),
    epic: z.string().max(100).nullable().optional(),
    tags: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    depends_on: z.array(z.string()).optional(),
    acceptance_criteria: z.array(z.string()).optional(),
    context_refs: z.array(z.string()).optional(),
    verify: z.string().max(2000).optional(),
    blocker_reason: z.string().max(1000).nullable().optional(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

export const TaskPickupSchema = z
  .object({
    agent: z.string().min(1).max(100),
  })
  .strict();

export const TaskCompleteSchema = z
  .object({
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const TaskBlockSchema = z
  .object({
    reason: z.string().min(1).max(1000),
  })
  .strict();

// --- Doc schemas ---

export const DocCreateSchema = z
  .object({
    type: z.enum(DOC_TYPES),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(50000),
    section: z.string().max(200).optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().max(100).optional(),
  })
  .strict();

export const DocSearchSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(DOC_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// --- Query param schemas ---

export const TaskListQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  assignee: z.string().optional(),
  epic: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const EventListQuerySchema = z.object({
  task_id: z.string().optional(),
  agent: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
