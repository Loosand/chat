/**
 * [INPUT]: 通用 Drizzle PostgreSQL database、@repo/chat repository port 与稳定 contracts
 * [OUTPUT]: 事务化 createDrizzleChatRepository adapter
 * [POS]: @repo/database 对聊天领域 port 的 PostgreSQL 实现
 * [DOC]: docs/architecture/chat-core.md
 *
 * [PROTOCOL]:
 * 1. 事务、幂等、映射或并发语义变化时同步 chat-core.md 和 adapter 集成测试。
 * 2. 所有 owner 条件都必须进入查询；不得向领域层泄漏 ORM row 或数据库错误详情。
 */

import {
  assertRunTransition,
  ChatDomainError,
  type ChatRepository,
  type ChatRun,
  type CheckpointAssistantRecord,
  type Conversation,
  type CreateRunTurnRecord,
  getAssistantMessageStatus,
  getRunEventType,
  isChatDomainError,
  isTerminalRunStatus,
  type Message,
  type PreparedRun,
  type RunEvent,
} from "@repo/chat";
import {
  chatRunStatusSchema,
  clientRunIdSchema,
  conversationIdSchema,
  jsonValueSchema,
  messageBranchReasonSchema,
  messageContentSchema,
  messageIdSchema,
  messageRoleSchema,
  messageStatusSchema,
  normalizedUsageSchema,
  ownerIdSchema,
  runEventTypeSchema,
  runFailureSchema,
  runIdSchema,
} from "@repo/contracts";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";
import { chatRunEvents, chatRuns, conversations, messages } from "./schema";

const schema = { chatRunEvents, chatRuns, conversations, messages };
type ChatSchema = typeof schema;
type Database<TQueryResult extends PgQueryResultHKT> = PgDatabase<
  TQueryResult,
  ChatSchema
>;

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type RunRow = typeof chatRuns.$inferSelect;
type RunEventRow = typeof chatRunEvents.$inferSelect;

const idempotencyConstraint = "chat_runs_owner_client_run_uidx";

export function createDrizzleChatRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: Database<TQueryResult>): ChatRepository {
  return {
    checkpointAssistant(input) {
      return withPersistenceBoundary(() =>
        database.transaction(async (transaction) => {
          const [updatedRun] = await transaction
            .update(chatRuns)
            .set({
              lastEventSequence: sql`${chatRuns.lastEventSequence} + 1`,
              updatedAt: input.at,
              usage: input.usage,
              version: sql`${chatRuns.version} + 1`,
            })
            .where(
              and(
                eq(chatRuns.id, input.runId),
                eq(chatRuns.ownerId, input.ownerId),
                eq(chatRuns.version, input.expectedVersion),
                inArray(chatRuns.status, ["running", "cancel_requested"])
              )
            )
            .returning();

          if (!updatedRun) {
            await throwRunWriteFailure(transaction, input.runId, input.ownerId);
          }

          await transaction
            .update(messages)
            .set({
              content: input.content,
              status: "streaming",
              updatedAt: input.at,
            })
            .where(eq(messages.id, updatedRun.assistantMessageId));

          await transaction.insert(chatRunEvents).values({
            at: input.at,
            data: input.data ?? {},
            runId: updatedRun.id,
            sequence: updatedRun.lastEventSequence,
            type: "message.checkpoint",
          });

          return mapRun(updatedRun);
        })
      );
    },

    createConversation(input) {
      return withPersistenceBoundary(async () => {
        const [row] = await database
          .insert(conversations)
          .values({
            createdAt: input.createdAt,
            id: input.id,
            ownerId: input.ownerId,
            title: input.title,
            updatedAt: input.createdAt,
          })
          .returning();
        return mapConversation(requireRow(row, "conversation insert"));
      });
    },

    createRunTurn(input) {
      return withPersistenceBoundary(async () => {
        const existing = await findPreparedRun(
          database,
          input.ownerId,
          input.clientRunId
        );
        if (existing) {
          return existing;
        }

        try {
          return await database.transaction((transaction) =>
            insertRunTurn(transaction, input)
          );
        } catch (error) {
          if (isConstraintViolation(error, idempotencyConstraint)) {
            const concurrent = await findPreparedRun(
              database,
              input.ownerId,
              input.clientRunId
            );
            if (concurrent) {
              return concurrent;
            }
          }
          throw error;
        }
      });
    },

    findRunForOwner(runId, ownerId) {
      return withPersistenceBoundary(() => findRun(database, runId, ownerId));
    },

    listBranchMessages(conversationId, leafMessageId, ownerId) {
      return withPersistenceBoundary(async () => {
        const [conversation] = await database
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.ownerId, ownerId)
            )
          )
          .limit(1);
        if (!conversation) {
          throw new ChatDomainError(
            "conversation_not_found",
            "Conversation was not found."
          );
        }

        return loadBranch(database, conversationId, leafMessageId);
      });
    },

    listRunEvents(runId, ownerId, afterSequence) {
      return withPersistenceBoundary(async () => {
        const run = await findRun(database, runId, ownerId);
        if (!run) {
          throw new ChatDomainError("run_not_found", "Chat run was not found.");
        }

        const rows = await database
          .select()
          .from(chatRunEvents)
          .where(
            and(
              eq(chatRunEvents.runId, runId),
              gt(chatRunEvents.sequence, afterSequence)
            )
          )
          .orderBy(asc(chatRunEvents.sequence));
        return rows.map(mapRunEvent);
      });
    },

    transitionRun(input) {
      assertRunTransition(input.expectedStatus, input.status);
      return withPersistenceBoundary(() =>
        database.transaction(async (transaction) => {
          const [updatedRun] = await transaction
            .update(chatRuns)
            .set({
              cancelRequestedAt:
                input.status === "cancel_requested" ? input.at : undefined,
              failure: input.failure,
              finishedAt: isTerminalRunStatus(input.status)
                ? input.at
                : undefined,
              lastEventSequence: sql`${chatRuns.lastEventSequence} + 1`,
              routeSnapshot: input.routeSnapshot,
              startedAt: input.status === "running" ? input.at : undefined,
              status: input.status,
              updatedAt: input.at,
              usage: input.usage,
              version: sql`${chatRuns.version} + 1`,
            })
            .where(
              and(
                eq(chatRuns.id, input.runId),
                eq(chatRuns.ownerId, input.ownerId),
                eq(chatRuns.status, input.expectedStatus)
              )
            )
            .returning();

          if (!updatedRun) {
            await throwRunWriteFailure(transaction, input.runId, input.ownerId);
          }

          await transaction
            .update(messages)
            .set({
              status: getAssistantMessageStatus(input.status),
              updatedAt: input.at,
            })
            .where(eq(messages.id, updatedRun.assistantMessageId));

          await transaction.insert(chatRunEvents).values({
            at: input.at,
            data: input.data,
            runId: updatedRun.id,
            sequence: updatedRun.lastEventSequence,
            type: getRunEventType(input.status),
          });

          return mapRun(updatedRun);
        })
      );
    },
  };
}

async function insertRunTurn<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  input: CreateRunTurnRecord
): Promise<PreparedRun> {
  const [conversation] = await database
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.ownerId, input.ownerId)
      )
    )
    .limit(1);
  if (!conversation) {
    throw new ChatDomainError(
      "conversation_not_found",
      "Conversation was not found."
    );
  }

  if (input.parentMessageId) {
    const [parent] = await database
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.parentMessageId),
          eq(messages.conversationId, input.conversationId)
        )
      )
      .limit(1);
    if (!parent) {
      throw new ChatDomainError(
        "invalid_parent",
        "Parent message does not belong to this conversation."
      );
    }
  }

  const [userRow] = await database
    .insert(messages)
    .values({
      branchReason: input.branchReason,
      content: input.content,
      conversationId: input.conversationId,
      createdAt: input.createdAt,
      id: input.userMessageId,
      parentId: input.parentMessageId,
      role: "user",
      status: "completed",
      updatedAt: input.createdAt,
    })
    .returning();

  const [assistantRow] = await database
    .insert(messages)
    .values({
      branchReason: input.branchReason,
      content: { parts: [], version: 1 },
      conversationId: input.conversationId,
      createdAt: input.createdAt,
      id: input.assistantMessageId,
      parentId: input.userMessageId,
      role: "assistant",
      status: "pending",
      updatedAt: input.createdAt,
    })
    .returning();

  const [runRow] = await database
    .insert(chatRuns)
    .values({
      assistantMessageId: input.assistantMessageId,
      clientRunId: input.clientRunId,
      conversationId: input.conversationId,
      createdAt: input.createdAt,
      id: input.runId,
      ownerId: input.ownerId,
      requestedModelId: input.requestedModelId,
      updatedAt: input.createdAt,
      userMessageId: input.userMessageId,
    })
    .returning();

  await database.insert(chatRunEvents).values({
    at: input.createdAt,
    data: {
      clientRunId: input.clientRunId,
      requestedModelId: input.requestedModelId,
    },
    runId: input.runId,
    sequence: 1,
    type: "run.created",
  });

  await database
    .update(conversations)
    .set({
      activeLeafMessageId: input.assistantMessageId,
      updatedAt: input.createdAt,
    })
    .where(eq(conversations.id, input.conversationId));

  return {
    assistantMessage: mapMessage(requireRow(assistantRow, "assistant insert")),
    created: true,
    run: mapRun(requireRow(runRow, "run insert")),
    userMessage: mapMessage(requireRow(userRow, "user insert")),
  };
}

async function findPreparedRun<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  ownerId: CreateRunTurnRecord["ownerId"],
  clientRunId: string
): Promise<PreparedRun | null> {
  const [runRow] = await database
    .select()
    .from(chatRuns)
    .where(
      and(eq(chatRuns.ownerId, ownerId), eq(chatRuns.clientRunId, clientRunId))
    )
    .limit(1);
  if (!runRow) {
    return null;
  }

  const messageRows = await database
    .select()
    .from(messages)
    .where(
      inArray(messages.id, [runRow.userMessageId, runRow.assistantMessageId])
    );
  const userRow = messageRows.find((row) => row.id === runRow.userMessageId);
  const assistantRow = messageRows.find(
    (row) => row.id === runRow.assistantMessageId
  );

  return {
    assistantMessage: mapMessage(
      requireRow(assistantRow, "idempotent assistant read")
    ),
    created: false,
    run: mapRun(runRow),
    userMessage: mapMessage(requireRow(userRow, "idempotent user read")),
  };
}

async function findRun<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  runId: Parameters<ChatRepository["findRunForOwner"]>[0],
  ownerId: Parameters<ChatRepository["findRunForOwner"]>[1]
): Promise<ChatRun | null> {
  const [row] = await database
    .select()
    .from(chatRuns)
    .where(and(eq(chatRuns.id, runId), eq(chatRuns.ownerId, ownerId)))
    .limit(1);
  return row ? mapRun(row) : null;
}

async function throwRunWriteFailure<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  runId: CheckpointAssistantRecord["runId"],
  ownerId: CheckpointAssistantRecord["ownerId"]
): Promise<never> {
  const run = await findRun(database, runId, ownerId);
  if (!run) {
    throw new ChatDomainError("run_not_found", "Chat run was not found.");
  }
  throw new ChatDomainError(
    "concurrent_run_update",
    "Chat run changed while it was being updated."
  );
}

async function loadBranch<TQueryResult extends PgQueryResultHKT>(
  database: Database<TQueryResult>,
  conversationId: Parameters<ChatRepository["listBranchMessages"]>[0],
  leafMessageId: Parameters<ChatRepository["listBranchMessages"]>[1]
): Promise<Message[]> {
  const branch: Message[] = [];
  const visited = new Set<string>();
  let nextId: string | null = leafMessageId;

  while (nextId) {
    const [current] = await database
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, nextId),
          eq(messages.conversationId, conversationId)
        )
      )
      .limit(1);

    if (!current) {
      if (branch.length === 0) {
        throw new ChatDomainError(
          "message_not_found",
          "Message was not found."
        );
      }
      throw new Error("Message ancestry invariant failed.");
    }
    if (visited.has(nextId)) {
      throw new Error("Message ancestry invariant failed.");
    }
    visited.add(nextId);
    branch.push(mapMessage(current));
    nextId = current.parentId;
  }

  return branch.reverse();
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    activeLeafMessageId: row.activeLeafMessageId
      ? messageIdSchema.parse(row.activeLeafMessageId)
      : null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    id: conversationIdSchema.parse(row.id),
    ownerId: ownerIdSchema.parse(row.ownerId),
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    branchReason: messageBranchReasonSchema.parse(row.branchReason),
    content: messageContentSchema.parse(row.content),
    conversationId: conversationIdSchema.parse(row.conversationId),
    createdAt: row.createdAt,
    id: messageIdSchema.parse(row.id),
    parentId: row.parentId ? messageIdSchema.parse(row.parentId) : null,
    role: messageRoleSchema.parse(row.role),
    status: messageStatusSchema.parse(row.status),
    updatedAt: row.updatedAt,
  };
}

function mapRun(row: RunRow): ChatRun {
  return {
    assistantMessageId: messageIdSchema.parse(row.assistantMessageId),
    cancelRequestedAt: row.cancelRequestedAt,
    clientRunId: clientRunIdSchema.parse(row.clientRunId),
    conversationId: conversationIdSchema.parse(row.conversationId),
    createdAt: row.createdAt,
    failure: row.failure ? runFailureSchema.parse(row.failure) : null,
    finishedAt: row.finishedAt,
    id: runIdSchema.parse(row.id),
    lastEventSequence: row.lastEventSequence,
    ownerId: ownerIdSchema.parse(row.ownerId),
    requestedModelId: row.requestedModelId,
    routeSnapshot:
      row.routeSnapshot === null
        ? null
        : jsonValueSchema.parse(row.routeSnapshot),
    startedAt: row.startedAt,
    status: chatRunStatusSchema.parse(row.status),
    updatedAt: row.updatedAt,
    usage: row.usage ? normalizedUsageSchema.parse(row.usage) : null,
    userMessageId: messageIdSchema.parse(row.userMessageId),
    version: row.version,
  };
}

function mapRunEvent(row: RunEventRow): RunEvent {
  return {
    at: row.at,
    data: jsonValueSchema.parse(row.data),
    runId: runIdSchema.parse(row.runId),
    sequence: row.sequence,
    type: runEventTypeSchema.parse(row.type),
  };
}

function requireRow<Row>(row: Row | undefined, operation: string): Row {
  if (!row) {
    throw new Error(`Persistence invariant failed after ${operation}.`);
  }
  return row;
}

function isConstraintViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (
      record.constraint === constraint ||
      record.constraint_name === constraint ||
      (typeof record.message === "string" &&
        record.message.includes(constraint))
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

async function withPersistenceBoundary<Value>(
  operation: () => Promise<Value>
): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (isChatDomainError(error)) {
      throw error;
    }
    throw new ChatDomainError(
      "persistence_failure",
      "Chat persistence operation failed."
    );
  }
}
