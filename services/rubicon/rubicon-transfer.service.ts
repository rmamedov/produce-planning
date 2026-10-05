import {
  RubiconError,
  createRubiconClient,
  resolveRubiconMode,
  rubiconConfigError,
  type RubiconErrorKind
} from "@/services/rubicon/rubicon-client";
import type { TransferGroup, TransferPayload } from "@/services/rubicon/rubicon-payload";

// TODO(аналітика): сюди ж додасться передача даних про виготовлення
// аналітикам, коли буде відомий канал.

export interface TransferResult {
  orderId: string;
  delivered: boolean; // false in stub mode: the payload was only logged
}

const client = createRubiconClient();

export const rubiconTransferService = {
  /** Creates one production transfer in Рубікон; throws RubiconError with a user-facing message. */
  async sendTransfer(payload: TransferPayload): Promise<TransferResult> {
    const resolved = resolveRubiconMode(process.env);
    if (resolved.mode === "misconfigured") {
      throw rubiconConfigError(resolved.missing);
    }
    if (resolved.mode === "stub") {
      console.info("[rubicon:stub] transfer payload", JSON.stringify(payload));
      return { orderId: payload.orderId, delivered: false };
    }

    await client.createTransfer(resolved.config, payload);
    return { orderId: payload.orderId, delivered: true };
  }
};

export type DocumentFailureCode = RubiconErrorKind | "conflict";

export interface DocumentFailure {
  code: DocumentFailureCode;
  message: string;
}

export const DOCUMENT_CONFLICT_MESSAGE =
  "Частину цих задач саме оформлює інший планшет — оновіть список і спробуйте ще раз";

export interface DocumentOutcome {
  transferIds: string[];
  /** Tasks of the groups Рубікон accepted. */
  documentedTaskIds: string[];
  documented: number;
  delivered: boolean;
  error: DocumentFailure | null;
}

export interface DocumentSteps {
  /** Puts the group's orderId on its free tasks; false when another request holds any of them. */
  claim: (group: TransferGroup) => Promise<boolean>;
  send: (payload: TransferPayload) => Promise<TransferResult>;
  /** Returns how many of the group's tasks were still undocumented. */
  markDocumented: (group: TransferGroup) => Promise<number>;
  /** Frees the group's tasks: Рубікон definitely did not create the transfer. */
  release: (group: TransferGroup) => Promise<void>;
}

/**
 * Sends the groups in order. A fresh group is claimed (its orderId stored on
 * the tasks) before the call, so a retry after an unanswered call resends the
 * same orderId. Each accepted group is marked right away; the first failure
 * stops the run and earlier groups stay documented. Only a definite rejection
 * frees the claim — after a timeout, network error or 5xx it stays.
 */
export async function documentTransferGroups(
  groups: TransferGroup[],
  { claim, send, markDocumented, release }: DocumentSteps
): Promise<DocumentOutcome> {
  const outcome: DocumentOutcome = {
    transferIds: [],
    documentedTaskIds: [],
    documented: 0,
    delivered: true,
    error: null
  };

  for (const group of groups) {
    if (!group.resumed && !(await claim(group))) {
      outcome.error = { code: "conflict", message: DOCUMENT_CONFLICT_MESSAGE };
      break;
    }

    let result: TransferResult;
    try {
      result = await send(group.payload);
    } catch (error) {
      if (!(error instanceof RubiconError)) throw error;
      if (!error.maybeCreated) await release(group);
      outcome.error = { code: error.kind, message: error.message };
      break;
    }
    outcome.documented += await markDocumented(group);
    outcome.transferIds.push(result.orderId);
    outcome.documentedTaskIds.push(...group.taskIds);
    outcome.delivered &&= result.delivered;
  }

  if (!outcome.transferIds.length) outcome.delivered = false;
  return outcome;
}
