const { randomBytes, createHmac, timingSafeEqual } = require('crypto');
const BASE_URL = 'https://api.paystack.co';
const secret = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !/^sk_(test|live)_/.test(key)) throw Object.assign(new Error('Paystack is not configured yet.'), { status: 503 });
  return key;
};
async function call(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json', ...options.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) throw Object.assign(new Error(payload.message || 'Paystack request failed.'), { status: response.status >= 500 ? 502 : 400 });
  return payload.data;
}
const reference = (prefix, bookingId) => `${prefix}-${bookingId}-${Date.now()}-${randomBytes(5).toString('hex')}`;
const initialize = ({ email, amountKobo, reference: ref, metadata, callbackUrl }) => call('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email, amount: String(amountKobo), reference: ref, currency: 'NGN', channels: ['card', 'bank', 'ussd', 'bank_transfer'], metadata: JSON.stringify(metadata), ...(callbackUrl ? { callback_url: callbackUrl } : {}) }) });
const verify = (ref) => call(`/transaction/verify/${encodeURIComponent(ref)}`);
const transfer = ({ amountKobo, recipient, reference: ref, reason }) => call('/transfer', { method: 'POST', body: JSON.stringify({ source: 'balance', amount: amountKobo, recipient, reference: ref, reason, currency: 'NGN' }) });
const listBanks = () => call('/bank?country=nigeria&currency=NGN&perPage=100');
const resolveAccount = (accountNumber, bankCode) => call(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
const createRecipient = ({ name, accountNumber, bankCode }) => call('/transferrecipient', { method: 'POST', body: JSON.stringify({ type: 'nuban', name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN', description: 'Truhoom artisan payout' }) });
function validWebhook(rawBody, signature) {
  if (!rawBody || typeof signature !== 'string') return false;
  const expected = Buffer.from(createHmac('sha512', secret()).update(rawBody).digest('hex'));
  const supplied = Buffer.from(signature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
module.exports = { initialize, verify, transfer, listBanks, resolveAccount, createRecipient, validWebhook, reference };
