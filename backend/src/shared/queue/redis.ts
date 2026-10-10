// Pure in-memory mock for local development without Redis dependency

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) || null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
    quit: async () => {},
    on: () => {},
    connect: async () => {},
    disconnect: async () => {},
    subscribe: async () => {},
    unsubscribe: async () => {},
    publish: async () => 1,
  } as any;
}

export const redis = createMockRedis();
export const redisSubscriber = createMockRedis();

export async function connectRedis(): Promise<void> {
  console.log('ℹ️ Running in local mode: Redis disabled, using in-memory mock');
}

export async function disconnectRedis(): Promise<void> {}