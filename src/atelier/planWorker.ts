// Calcul du calepinage hors du fil principal : l'interface reste fluide pendant l'imbrication
import { makePlan } from './plan';

self.onmessage = (e: MessageEvent) => {
  const { id, job, state } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, plan: makePlan(job, state) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
