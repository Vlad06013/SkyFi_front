/**
 * Бэк отдаёт 422-сообщения Laravel на английском
 * ("The email field is required."). Переводим известные
 * сообщения на русский; неизвестные возвращаем как есть —
 * лучше английский текст, чем молчание.
 */

const FIELD_NAMES: Record<string, string> = {
  email: 'email',
  password: 'пароль',
  name: 'имя',
  code: 'код',
  password_confirmation: 'подтверждение пароля',
};

const REQUIRED: Record<string, string> = {
  email: 'Укажите email',
  password: 'Введите пароль',
  name: 'Укажите имя',
  code: 'Введите код',
  password_confirmation: 'Повторите пароль',
  'password confirmation': 'Повторите пароль',
};

const EXACT: Record<string, string> = {
  'These credentials do not match our records.': 'Неверный email или пароль.',
  'The selected code is invalid.': 'Неверный код.',
  'The email has already been taken.': 'Такой email уже зарегистрирован.',
  'The password field confirmation does not match.': 'Пароли не совпадают.',
  'The password field and password confirmation field must match.': 'Пароли не совпадают.',
};

function fieldOf(message: string): string | null {
  // Поле может состоять из нескольких слов: "The password confirmation field is required."
  const match = /^The (.+?) field (?:is|must|confirmation)/.exec(message);
  return match ? match[1] : null;
}

export function localizeServerMessage(message: string): string {
  const exact = EXACT[message];
  if (exact) return exact;

  const field = fieldOf(message);
  if (!field) return message;

  if (message === `The ${field} field is required.`) {
    return REQUIRED[field] ?? 'Заполните поле.';
  }
  if (message === `The ${field} field must be a valid email address.`) {
    return 'Некорректный email.';
  }
  if (message === `The ${field} field confirmation does not match.`) {
    return 'Пароли не совпадают.';
  }

  let match = new RegExp(`^The ${field} field must be at least (\\d+) characters\\.$`).exec(message);
  if (match) return `Минимум ${match[1]} символов.`;

  match = new RegExp(`^The ${field} field must not be greater than (\\d+) characters\\.$`).exec(message);
  if (match) return `Максимум ${match[1]} символов.`;

  match = new RegExp(`^The selected ${field} is invalid\\.$`).exec(message);
  if (match) return `Неверный ${FIELD_NAMES[field] ?? 'код'}.`;

  return message;
}
