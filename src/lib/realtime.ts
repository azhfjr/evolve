import { Client } from "pg";
type Subscriber = () => void;
type ListenerState = {
  client: Client | null;
  connecting: Promise<void> | null;
  subscribers: Set<Subscriber>;
};
const shared = globalThis as unknown as { evolveListener?: ListenerState };
const state = (shared.evolveListener ??= {
  client: null,
  connecting: null,
  subscribers: new Set(),
});
function notify() {
  for (const callback of state.subscribers) callback();
}
export async function subscribeToChanges(callback: Subscriber) {
  state.subscribers.add(callback);
  if (!state.client && !state.connecting) {
    state.connecting = (async () => {
      const connectionString =
        process.env.DATABASE_URL_UNPOOLED ||
        process.env.POSTGRES_URL_NON_POOLING ||
        process.env.DATABASE_URL;
      if (!connectionString) throw new Error("PostgresListenerUnavailable");
      const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
        application_name: "evolve-realtime",
      });
      client.on("error", () => {
        if (state.client === client) state.client = null;
        void client.end().catch(() => {});
        notify();
      });
      client.on("end", () => {
        if (state.client === client) state.client = null;
        notify();
      });
      client.on("notification", notify);
      try {
        await client.connect();
        await client.query("LISTEN evolve_changed");
        state.client = client;
      } catch (e) {
        await client.end().catch(() => {});
        throw e;
      }
    })().finally(() => {
      state.connecting = null;
    });
  }
  let connected = true;
  try {
    await state.connecting;
  } catch {
    connected = false;
  }
  return {
    connected: connected && Boolean(state.client),
    isConnected: () => Boolean(state.client),
    unsubscribe: () => {
      state.subscribers.delete(callback);
      if (!state.subscribers.size) {
        const client = state.client;
        state.client = null;
        void client?.end().catch(() => {});
      }
    },
  };
}
