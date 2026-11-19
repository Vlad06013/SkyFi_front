const API = 'http://192.168.8.33:8080/api/v1/skyfy';
const PHONE = { email: 'test@skyfi.app', password: 'password123' };

describe('авторизация (живой бэк)', () => {
  beforeEach(() => {
    cy.clearSkyFiSession();
  });

  it('без сессии гвард уводит на /login с redirect', () => {
    cy.visit('/');
    cy.location('pathname').should('eq', '/login');
    cy.location('search').should('include', 'redirect');
  });

  it('регистрация → /home → выход → снова /login', () => {
    const email = `e2e.${Date.now()}@test.skyfi`;
    cy.visit('/login');

    cy.contains('button', 'Создать').click();
    cy.contains('label', 'Имя').should('exist');
    cy.get('input').eq(0).type('E2E');
    cy.get('input').eq(1).type(email);
    cy.get('input').eq(2).type('password123');
    cy.get('input').eq(3).type('password123');
    cy.contains('button', 'Создать').click();

    cy.location('pathname').should('eq', '/home');

    cy.visit('/settings');
    cy.contains('button', 'Выйти').click();
    cy.location('pathname').should('eq', '/login');
  });

  it('вход → /home; сессия переживает перезагрузку', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(PHONE.email);
    cy.get('input[type="password"]').type(PHONE.password);
    cy.contains('button', 'Войти').click();

    cy.location('pathname').should('eq', '/home');
    cy.reload();
    cy.location('pathname').should('eq', '/home');
  });

  it('401 от /user сбрасывает сессию → /login', () => {
    cy.visit('/login');
    cy.get('input[type="email"]').type(PHONE.email);
    cy.get('input[type="password"]').type(PHONE.password);
    cy.contains('button', 'Войти').click();
    cy.location('pathname').should('eq', '/home');

    cy.intercept('GET', '**/user', {
      statusCode: 401,
      body: { errors: 'Не авторизован.', data: [], pagination: null },
    }).as('user401');

    cy.reload();
    cy.wait('@user401');
    cy.location('pathname').should('eq', '/login');
  });

  it('QR-вход: ТВ показывает QR, телефон подтверждает через API → ТВ залогинен', () => {
    let qrCode = '';
    cy.intercept('POST', '**/qr-login', (req) => {
      req.continue((res) => {
        qrCode = res.body.data.code;
      });
    }).as('qrStart');

    cy.visit('/login');
    cy.contains('button', 'Войти по QR').click();
    cy.wait('@qrStart');
    cy.get('.qr-box svg').should('exist');

    // «Телефон» — авторизованный аккаунт подтверждает код запросом.
    cy.request('POST', `${API}/login`, PHONE).then((login) => {
      cy.request({
        method: 'POST',
        url: `${API}/qr-login/confirm`,
        headers: { Authorization: `Bearer ${login.body.data.token}` },
        body: { code: qrCode },
      });
    });

    cy.location('pathname', { timeout: 10_000 }).should('eq', '/home');
  });
});
