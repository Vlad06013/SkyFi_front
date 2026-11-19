declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Чистит сохранённую сессию (Capacitor Preferences на вебе — localStorage). */
      clearSkyFiSession(): Chainable<void>;
    }
  }
}

Cypress.Commands.add('clearSkyFiSession', () => {
  cy.window().then((win) => {
    Object.keys(win.localStorage)
      .filter((key) => key.includes('skyfi.session'))
      .forEach((key) => win.localStorage.removeItem(key));
  });
});

export {};
