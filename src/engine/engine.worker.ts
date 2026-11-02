import { createEngineSession } from './protocol.ts';
import type { EngineRequest } from './protocol.ts';

const session = createEngineSession();
self.addEventListener('message', (event: MessageEvent<EngineRequest>) => {
  self.postMessage(session(event.data));
});
