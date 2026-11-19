describe('правки после интеграции авторизации', () => {
  it('ошибки 401/422 на логине + кнопка QR в настройках', () => {
    cy.visit('/login');
    cy.clearSkyFiSession();
    cy.visit('/login');

    // 422 — подписи под инпутами на русском (бэк отдаёт Laravel EN).
    cy.get('input[type="email"]').type('a@b.c');
    cy.contains('button', 'Войти').click();
    cy.get('.field-err').should('contain', 'Введите пароль');
    cy.wait(400);
    cy.screenshot('fix2-422-russian', { capture: 'viewport' });

    // 401 — тост с сообщением сервера (китовый тост pointer-events: none —
    // видимость проверяем скриншотом).
    cy.get('input[type="password"]').type('wrongpass1');
    cy.contains('button', 'Войти').click();
    cy.get('.sky-toast').should('exist').and('contain', 'Неверный email или пароль');
    cy.wait(400);
    cy.screenshot('fix2-toast-401', { capture: 'viewport' });

    // Настройки: кнопка сканера на месте.
    cy.get('input[type="email"]').clear().type('test@skyfi.app');
    cy.get('input[type="password"]').clear().type('password123');
    cy.contains('button', 'Войти').click();
    cy.location('pathname').should('eq', '/home');
    cy.visit('/settings');
    cy.contains('.set-row', 'Сканировать QR').should('exist');
    cy.screenshot('fix4-settings-qr', { capture: 'viewport' });
  });
});
