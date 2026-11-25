import { onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';

type RefreshFn = () => Promise<unknown> | void;

interface RefreshHandler {
  /** Имя роута на момент setup. Keep-alive не размонтирует страницу, живой route — чужой. */
  name: unknown;
  run: RefreshFn;
}

const handlers = new Set<RefreshHandler>();

/**
 * Перезагрузка текущей страницы со свайпа. Срабатывает только у того
 * экрана, который сейчас открыт: остальные вкладки под keep-alive молчат.
 */
export function usePageRefresh(run: RefreshFn) {
  const route = useRoute();
  const handler: RefreshHandler = { name: route.name, run };
  handlers.add(handler);
  onBeforeUnmount(() => handlers.delete(handler));
}

/** true — страница сама перезагрузила данные. */
export async function refreshActivePage(routeName: unknown): Promise<boolean> {
  const jobs = [...handlers].filter((handler) => handler.name === routeName);
  if (!jobs.length) return false;
  await Promise.all(jobs.map((handler) => Promise.resolve(handler.run()).catch(() => undefined)));
  return true;
}
