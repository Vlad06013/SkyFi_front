import { describe, expect, it } from 'vitest';
import { localizeServerMessage } from '@/lib/error-messages';

describe('lib/error-messages', () => {
  it('переводит известные 422 Laravel', () => {
    expect(localizeServerMessage('The email field is required.')).toBe('Укажите email');
    expect(localizeServerMessage('The password field is required.')).toBe('Введите пароль');
    expect(localizeServerMessage('The name field is required.')).toBe('Укажите имя');
    expect(localizeServerMessage('The code field is required.')).toBe('Введите код');
    expect(localizeServerMessage('The password confirmation field is required.')).toBe('Повторите пароль');
    expect(localizeServerMessage('The email field must be a valid email address.')).toBe('Некорректный email.');
    expect(localizeServerMessage('The password field must be at least 8 characters.')).toBe('Минимум 8 символов.');
    expect(localizeServerMessage('The name field must not be greater than 255 characters.')).toBe(
      'Максимум 255 символов.',
    );
    expect(localizeServerMessage('The password field confirmation does not match.')).toBe('Пароли не совпадают.');
    expect(localizeServerMessage('The selected code is invalid.')).toBe('Неверный код.');
  });

  it('переводит точные строки', () => {
    expect(localizeServerMessage('These credentials do not match our records.')).toBe('Неверный email или пароль.');
    expect(localizeServerMessage('The email has already been taken.')).toBe('Такой email уже зарегистрирован.');
  });

  it('неизвестное сообщение возвращает как есть', () => {
    expect(localizeServerMessage('Something weird happened.')).toBe('Something weird happened.');
  });
});
