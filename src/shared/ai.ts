import { z } from "zod";

export const aiConfigurationSchema = z.object({
  runtimePath: z.string().trim().max(2000),
  model: z.string().trim().max(200).regex(/^[a-zA-Z0-9._:/-]*$/, "Enter a model ID, not a command."),
}).strict();

export const workiqConfigurationSchema = z.object({
  executablePath: z.string().trim().max(2000),
  tenantId: z.union([z.literal(""), z.guid()]),
}).strict();

export type AiConfiguration = z.infer<typeof aiConfigurationSchema>;
export type WorkiqConfiguration = z.infer<typeof workiqConfigurationSchema>;
export type ConnectionKind = "ai" | "workiq";

export interface ConnectionTestResult {
  status: "success" | "error" | "cancelled";
  checkedAt: string;
  message: string;
  response: string | null;
  identity: string | null;
  details: string | null;
}

export interface AiConnectionsState {
  ai: AiConfiguration;
  workiq: WorkiqConfiguration;
  aiTest: ConnectionTestResult | null;
  workiqTest: ConnectionTestResult | null;
  testing: ConnectionKind | null;
}
