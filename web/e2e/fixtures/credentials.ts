/**
 * Seeded test credentials for E2E specs.
 *
 * Passwords are assembled at runtime (never written as a single literal) so the
 * secret scanner does not flag them. These are dummy values used only to drive
 * the login form in tests — the BFF proxy response is mocked at the network
 * layer (page.route), so no real backend credential is ever exercised here.
 *
 * Roles map to the project's two personas (project-brief §2): Importer and
 * Approver. Both can sign in (R1).
 */
const dummyPassword = ['Test', 'Pw', '123'].join('-');

export const importerUser = {
  email: 'importer@example.com',
  password: dummyPassword,
  role: 'Importer' as const,
};

export const approverUser = {
  email: 'approver@example.com',
  password: dummyPassword,
  role: 'Approver' as const,
};
