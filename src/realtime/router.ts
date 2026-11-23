/**
 * Типизированное ядро слоя: подписка на ивенты с общей обвязкой —
 * эхо-глушение по origin_device_id и дедуп по command_id (api.md §17).
 */

export interface EventChannel {
  listen(event: string, callback: (payload: unknown) => void): void;
}

export interface RouterHooks {
  /** uuid моего устройства — для эхо-глушения (api.md §17: origin_device_id всегда device_uuid). */
  getMyOriginIds: () => Array<string | null | undefined>;
}

export interface EventMeta {
  /** Ивент несёт origin_device_id: своя команда — пропускаем. */
  echo?: boolean;
  /** Ивент несёт command_id: повторную доставку игнорируем. */
  dedup?: boolean;
}

const SEEN_CAP = 500;
const seenCommands = new Set<string>();

/** Тестам и смене сессии: сброс дедуп-буфера. */
export function resetSeenCommands(): void {
  seenCommands.clear();
}

/** true — ивент от моей же команды (origin_device_id совпал с моим device_uuid). */
export function isOwnEcho(
  originDeviceId: string | null | undefined,
  myOriginIds: Array<string | null | undefined>,
): boolean {
  return originDeviceId != null && myOriginIds.some((id) => id != null && id === originDeviceId);
}

/** true — command_id уже встречался, эта доставка — повтор. */
export function markCommand(commandId: string | null | undefined): boolean {
  if (!commandId) return false;
  if (seenCommands.has(commandId)) return true;
  seenCommands.add(commandId);
  if (seenCommands.size > SEEN_CAP) {
    seenCommands.delete(seenCommands.values().next().value as string);
  }
  return false;
}

export function createRouter(hooks: RouterHooks) {
  function listen<P>(
    channel: EventChannel,
    name: string,
    meta: EventMeta,
    handler: (payload: P) => void,
  ) {
    channel.listen(name, (raw: unknown) => {
      const payload = raw as P & {
        origin_device_id?: string | null;
        command_id?: string | null;
      };
      if (meta.echo && isOwnEcho(payload.origin_device_id, hooks.getMyOriginIds())) {
        console.debug(`[realtime] ${name} — своё эхо, пропущен`, payload);
        return;
      }
      if (meta.dedup && markCommand(payload.command_id)) {
        console.debug(`[realtime] ${name} — повтор command_id, пропущен`, payload);
        return;
      }
      console.debug(`[realtime] ${name}`, payload);
      handler(payload);
    });
  }

  return { listen };
}
