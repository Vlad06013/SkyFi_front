const API = 'http://192.168.8.33:8080/api/v1/skyfy';
const TOKEN = '1|9bwCftbvHEcKo0owusXcagsn6mWq19z6PeOHn16Y54b3dfcd';

/** Сессия токеном пользователя: Preferences на вебе — localStorage. */
function seedSession() {
  cy.request({
    method: 'GET',
    url: `${API}/user`,
    headers: { Authorization: `Bearer ${TOKEN}` },
  }).then((res) => {
    cy.visit('/login', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'skyfi.session',
          JSON.stringify({ token: TOKEN, user: res.body.data }),
        );
      },
    });
  });
  cy.location('pathname').should('eq', '/home');
}

describe('поиск и детали (живой бэк)', () => {
  beforeEach(() => {
    seedSession();
  });

  it('выдача поиска с сервера; детали альбома шлют целый снапшот', () => {
    cy.visit('/search');
    cy.get('input').type('FFDP');

    // best-строка или строки треков приезжают с бэка.
    cy.get('.track-row, .pl-row', { timeout: 20_000 }).should('exist');

    cy.contains('.chip', 'Альбомы').click();
    cy.get('.pl-row', { timeout: 20_000 }).first().should('exist');

    let detailsBody: Record<string, unknown> | null = null;
    cy.intercept('POST', '**/details', (req) => {
      detailsBody = req.body;
    }).as('details');

    cy.get('.pl-row').first().click();
    cy.wait('@details');
    cy.location('pathname').should('match', /^\/album\/[^/]+\/[^/]+$/);
    cy.get('.hero-name').should('not.be.empty');

    cy.then(() => {
      // Конверта из урла достаточно: тройка идентичности, title не требуем.
      expect(detailsBody).to.include({ type: 'album', source_type: 'yandex_music' });
      expect(detailsBody?.source_id).to.be.a('string').and.not.be.empty;
      expect(detailsBody).to.not.have.property('title');
    });
  });

  it('холодный заход по ссылке: деталка грузится конвертом без title', () => {
    cy.visit('/album/yandex_music/6837444');
    cy.location('pathname').should('eq', '/album/yandex_music/6837444');
    cy.get('.hero-name', { timeout: 20_000 }).should('not.be.empty');
    cy.get('.track-row', { timeout: 20_000 }).should('have.length.greaterThan', 0);
  });

  it('детали артиста: hero + треки с API', () => {
    cy.visit('/search');
    cy.get('input').type('FFDP');
    cy.contains('.chip', 'Артисты').click();
    cy.get('.pl-row', { timeout: 20_000 }).first().click();

    cy.location('pathname').should('match', /^\/artist\/[^/]+\/[^/]+$/);
    cy.get('.hero-name').should('not.be.empty');
    cy.get('.track-row', { timeout: 20_000 }).should('have.length.greaterThan', 0);
  });
});
