import { Kafka, type Consumer, type KafkaMessage, type Producer } from "kafkajs";

import { type KafkaTopic, validateEventPayload } from "@hospital/contracts";

import { createLogger } from "../logger/index.js";

const kafkaCache = new Map<string, Kafka>();
const logger = createLogger("kafka-client");
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_DLQ_SUFFIX = ".dlq";
const DEFAULT_STARTUP_MAX_RETRIES = 8;
const DEFAULT_STARTUP_RETRY_DELAY_MS = 500;

type ConsumerOptions = {
  maxRetries?: number;
  retryDelayMs?: number;
  dlqSuffix?: string;
  validateMessages?: boolean;
};

type PublishOptions = {
  headers?: Record<string, string>;
  skipValidation?: boolean;
};

type SafePublishOptions = PublishOptions & {
  context?: Record<string, unknown>;
};

export const getKafkaClient = (brokers: string[], clientId: string): Kafka => {
  const cacheKey = `${clientId}:${brokers.join(",")}`;
  const cached = kafkaCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const kafka = new Kafka({
    clientId,
    brokers
  });
  kafkaCache.set(cacheKey, kafka);

  return kafka;
};

export const createProducer = async (brokers: string[], clientId: string): Promise<Producer> => {
  const kafka = getKafkaClient(brokers, clientId);
  const producer = kafka.producer();
  const originalConnect = producer.connect.bind(producer);
  const originalDisconnect = producer.disconnect.bind(producer);
  const originalSend = producer.send.bind(producer);
  const originalSendBatch = producer.sendBatch.bind(producer);

  let connected = false;
  let connectPromise: Promise<void> | null = null;

  const ensureConnected = async (): Promise<void> => {
    if (connected) {
      return;
    }

    if (connectPromise) {
      return connectPromise;
    }

    connectPromise = retryKafkaStartup(`${clientId}:producer-connect`, async () => {
      await originalConnect();
      connected = true;
    })
      .catch((error) => {
        connected = false;
        throw error;
      })
      .finally(() => {
        connectPromise = null;
      });

    return connectPromise;
  };

  const withReconnect = async <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
    try {
      await ensureConnected();
      return await fn();
    } catch (error) {
      connected = false;
      logger.warn(
        {
          clientId,
          operation,
          error
        },
        "kafka producer operation failed"
      );
      throw error;
    }
  };

  producer.connect = (async () => {
    await ensureConnected();
  }) as Producer["connect"];

  producer.disconnect = (async () => {
    connected = false;
    connectPromise = null;
    await originalDisconnect().catch(() => undefined);
  }) as Producer["disconnect"];

  producer.send = ((record) => withReconnect("send", async () => originalSend(record))) as Producer["send"];
  producer.sendBatch = ((batch) => withReconnect("send-batch", async () => originalSendBatch(batch))) as Producer["sendBatch"];

  void ensureConnected().catch((error) => {
    logger.warn(
      {
        clientId,
        error
      },
      "kafka producer unavailable during startup; continuing without broker connectivity"
    );
  });

  return producer;
};

export const createConsumer = async (
  brokers: string[],
  clientId: string,
  groupId: string,
  topics: string[],
  handler: (topic: string, message: KafkaMessage) => Promise<void>,
  options: ConsumerOptions = {}
): Promise<Consumer> => {
  const kafka = getKafkaClient(brokers, clientId);
  const dlqSuffix = options.dlqSuffix ?? DEFAULT_DLQ_SUFFIX;

  await ensureTopics(kafka, [...topics, ...topics.map((topic) => `${topic}${dlqSuffix}`)], clientId);

  const consumer = kafka.consumer({ groupId });
  const dlqProducer = kafka.producer();
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  await retryKafkaStartup(`${clientId}:consumer-connect`, async () => {
    await consumer.connect();
  });
  await retryKafkaStartup(`${clientId}:dlq-producer-connect`, async () => {
    await dlqProducer.connect();
  });
  for (const topic of topics) {
    await retryKafkaStartup(`${clientId}:subscribe:${topic}`, async () => {
      await consumer.subscribe({ topic, fromBeginning: false });
    });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const rawValue = message.value?.toString() ?? null;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        try {
          if (rawValue && options.validateMessages !== false) {
            validateEventPayload(topic as KafkaTopic, JSON.parse(rawValue));
          }

          await handler(topic, message);
          return;
        } catch (error) {
          const isRetryable = attempt <= maxRetries;
          if (isRetryable) {
            logger.warn(
              {
                clientId,
                topic,
                partition,
                offset: message.offset,
                attempt,
                error
              },
              "consumer handler failed; retrying"
            );

            await sleep(retryDelayMs * 2 ** (attempt - 1));
            continue;
          }

          const dlqTopic = `${topic}${dlqSuffix}`;
          await dlqProducer.send({
            topic: dlqTopic,
            messages: [
              {
                key: message.key?.toString() ?? `${topic}:${message.offset}`,
                value: JSON.stringify({
                  originalTopic: topic,
                  partition,
                  offset: message.offset,
                  attempts: attempt,
                  failedAt: new Date().toISOString(),
                  error: serializeError(error),
                  key: message.key?.toString() ?? null,
                  value: rawValue,
                  headers: decodeHeaders(message.headers)
                })
              }
            ]
          });

          logger.error(
            {
              clientId,
              topic,
              dlqTopic,
              partition,
              offset: message.offset,
              attempts: attempt,
              error
            },
            "consumer handler failed; message published to DLQ"
          );
          return;
        }
      }
    }
  });

  return consumer;
};

export const publishEvent = async (
  producer: Producer,
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  options: PublishOptions = {}
): Promise<void> => {
  const validatedPayload = options.skipValidation
    ? payload
    : (validateEventPayload(topic as KafkaTopic, payload) as Record<string, unknown>);

  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(validatedPayload),
        headers: {
          "x-event-topic": topic,
          "x-schema-version": "1",
          ...(options.headers ?? {})
        }
      }
    ]
  });
};

export const publishEventSafely = async (
  producer: Producer,
  topic: string,
  key: string,
  payload: Record<string, unknown>,
  options: SafePublishOptions = {}
): Promise<void> => {
  try {
    await publishEvent(producer, topic, key, payload, options);
  } catch (error) {
    logger.warn(
      {
        topic,
        key,
        error,
        ...(options.context ?? {})
      },
      "event publish failed; continuing"
    );
  }
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const retryKafkaStartup = async (operation: string, fn: () => Promise<void>): Promise<void> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < DEFAULT_STARTUP_MAX_RETRIES) {
    attempt += 1;
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          operation,
          attempt,
          maxRetries: DEFAULT_STARTUP_MAX_RETRIES,
          error
        },
        "kafka startup operation failed; retrying"
      );
      await sleep(DEFAULT_STARTUP_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
};

const ensureTopics = async (kafka: Kafka, topics: string[], clientId: string): Promise<void> => {
  const uniqueTopics = [...new Set(topics)];
  if (uniqueTopics.length === 0) {
    return;
  }

  await retryKafkaStartup(`${clientId}:ensure-topics`, async () => {
    const admin = kafka.admin();
    try {
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: uniqueTopics.map((topic) => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1
        }))
      });
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  });
};

const decodeHeaders = (headers: KafkaMessage["headers"]) => {
  const decoded: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined) {
      continue;
    }

    decoded[name] = Array.isArray(value)
      ? value.map((entry) => entry.toString()).join(",")
      : value.toString();
  }

  return decoded;
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
};
