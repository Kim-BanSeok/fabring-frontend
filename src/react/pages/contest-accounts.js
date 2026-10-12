export const CONTEST_ACCOUNTS = {
  buyer: { email: 'loop@example.com', password: 'loop1234' },
  seller: { email: 'seller@example.com', password: 'seller1234' },
  admin: { email: 'admin@example.com', password: 'admin1234' },
};

export function isContestLogin(role, input) {
  const account = CONTEST_ACCOUNTS[role];
  if (!account || !input) return false;
  return String(input.email || '').trim().toLowerCase() === account.email && input.password === account.password;
}
