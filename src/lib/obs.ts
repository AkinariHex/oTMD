import type { AppSettings } from "@/lib/api";

type ObsConfig = AppSettings["Obs"];

const TIMEOUT_MS = 5000;
const BROWSER_SOURCE = "browser_source";
const NEEDED_REQUESTS = ["GetInputList", "SetInputSettings", "GetSceneItemList", "CreateSceneItem", "CreateInput"];

interface ObsMessage {
  op: number;
  d: {
    authentication?: { challenge: string; salt: string };
    requestId?: string;
    requestType?: string;
    requestStatus?: { result: boolean; comment?: string };
    responseData?: Record<string, unknown>;
  };
}

const sha256Base64 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
};

const authenticate = async (password: string, challenge: string, salt: string): Promise<string> => sha256Base64((await sha256Base64(password + salt)) + challenge);

// obs-websocket v5: Hello (0) -> Identify (1) -> Identified (2), then Request (6) / RequestResponse (7).
async function withObs<T>({ host, port, password }: ObsConfig, run: (request: (type: string, data?: object) => Promise<Record<string, unknown>>) => Promise<T>): Promise<T> {
  const socket = new WebSocket(`ws://${host}:${port}`);
  const pending = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  let nextId = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("OBS did not answer.")), TIMEOUT_MS);
      socket.onerror = () => reject(new Error("Could not reach OBS."));
      socket.onclose = (event) => reject(new Error(event.code === 4009 ? "Wrong OBS password." : "OBS closed the connection."));
      socket.onmessage = async (event) => {
        const message = JSON.parse(event.data as string) as ObsMessage;
        if (message.op === 0) {
          const auth = message.d.authentication;
          const authentication = auth ? await authenticate(password, auth.challenge, auth.salt) : undefined;
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 0 } }));
        } else if (message.op === 2) {
          clearTimeout(timer);
          resolve();
        } else if (message.op === 7 && message.d.requestId) {
          const waiter = pending.get(message.d.requestId);
          pending.delete(message.d.requestId);
          if (message.d.requestStatus?.result) waiter?.resolve(message.d.responseData ?? {});
          else waiter?.reject(new Error(`${message.d.requestType}: ${message.d.requestStatus?.comment ?? "OBS refused the request."}`));
        }
      };
    });

    socket.onclose = () => pending.forEach(({ reject }) => reject(new Error("OBS closed the connection.")));
    const request = (requestType: string, requestData?: object) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const requestId = String(nextId++);
        pending.set(requestId, { resolve, reject });
        socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      });
    return await run(request);
  } finally {
    socket.close();
  }
}

export const testObs = (config: ObsConfig): Promise<void> => withObs(config, async (request) => void (await request("GetVersion")));

// Scenes in the order OBS shows them, with the live one first picked.
export const listScenes = (config: ObsConfig): Promise<{ scenes: string[]; current: string }> =>
  withObs(config, async (request) => {
    const { scenes, currentProgramSceneName } = (await request("GetSceneList")) as { scenes: { sceneName: string; sceneIndex: number }[]; currentProgramSceneName: string };
    return { scenes: [...scenes].sort((a, b) => b.sceneIndex - a.sceneIndex).map(({ sceneName }) => sceneName), current: currentProgramSceneName };
  });

// Updates the source with this name if it exists, otherwise creates it, then makes sure it is in the scene.
export const sendBrowserSource = (config: ObsConfig, sceneName: string, name: string, url: string, width: number, height: number): Promise<"created" | "updated"> =>
  withObs(config, async (request) => {
    const { availableRequests, obsVersion, obsWebSocketVersion } = (await request("GetVersion")) as {
      availableRequests: string[];
      obsVersion: string;
      obsWebSocketVersion: string;
    };
    const missing = NEEDED_REQUESTS.filter((type) => !(availableRequests ?? NEEDED_REQUESTS).includes(type));
    if (missing.length > 0) throw new Error(`OBS ${obsVersion} (WebSocket ${obsWebSocketVersion}) does not support ${missing.join(", ")}.`);
    const inputSettings = { url, width, height };
    const { inputs } = (await request("GetInputList", { inputKind: BROWSER_SOURCE })) as { inputs: { inputName: string }[] };
    if (!inputs.some(({ inputName }) => inputName === name)) {
      await request("CreateInput", { sceneName, inputName: name, inputKind: BROWSER_SOURCE, inputSettings, sceneItemEnabled: true });
      return "created";
    }
    await request("SetInputSettings", { inputName: name, inputSettings, overlay: true });
    const { sceneItems } = (await request("GetSceneItemList", { sceneName })) as { sceneItems: { sourceName: string }[] };
    if (!sceneItems.some(({ sourceName }) => sourceName === name)) await request("CreateSceneItem", { sceneName, sourceName: name });
    return "updated";
  });
