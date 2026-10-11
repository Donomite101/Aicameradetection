/**
 * End-to-end access-control and security checks, run against a LIVE backend.
 *
 * Never point this at your real data: it creates a second centre, a trainee and a user, and it deactivates and
 * re-activates the officer. Use a COPY of the database:
 *
 *   copy backend\prisma\dev.db %TEMP%\check.db
 *   set PORT=3100 & set DATABASE_URL=file:%TEMP%\check.db & set DEVICE_API_KEY=test-device-key-123 & cd backend & npx tsx src/app.ts
 *   node backend/tests/api-security-check.mjs          (second terminal)
 *
 * Settings: API_HOST, DEVICE_API_KEY, ADMIN_EMAIL/ADMIN_PASSWORD, OFFICER_EMAIL/OFFICER_PASSWORD.
 */
import { createRequire } from 'module';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { io } = require('socket.io-client');

const HOST = process.env.API_HOST || 'http://localhost:3100';
const BASE = `${HOST}/api/v1`;
const KEY = process.env.DEVICE_API_KEY || 'test-device-key-123';
const ADMIN = [process.env.ADMIN_EMAIL || 'admin@sih.gov.in', process.env.ADMIN_PASSWORD || 'admin123'];
const OFFICER = [process.env.OFFICER_EMAIL || 'officer@sih.gov.in', process.env.OFFICER_PASSWORD || 'officer123'];
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { (ok ? passed++ : failed++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const login = async (email, password) => (await call('POST', '/auth/login', { body: { email, password } })).data;

const admin = await login(...ADMIN);
const officer = await login(...OFFICER);
if (!admin?.accessToken || !officer?.accessToken) { console.log('login failed', !!admin?.accessToken, !!officer?.accessToken); process.exit(1); }
const A = admin.accessToken, O = officer.accessToken;
const officerCentre = officer.user.centreId;

// ── 1. anyone can no longer create an admin ──
let r = await call('POST', '/auth/register', { body: { email: 'hacker@x.com', password: 'password123', fullName: 'Hacker', role: 'ADMIN' } });
check('register without login is refused', r.status === 401, `status ${r.status}`);
r = await call('POST', '/auth/register', { token: O, body: { email: 'hacker@x.com', password: 'password123', fullName: 'Hacker', role: 'ADMIN' } });
check('register as an officer is refused', r.status === 403, `status ${r.status}`);

// ── 2. password reset token is not handed out ──
r = await call('POST', '/auth/forgot-password', { body: { email: 'admin@sih.gov.in' } });
check('forgot-password does not return a token', !JSON.stringify(r.data).includes('resetToken') && !JSON.stringify(r.data).includes('eyJ'), JSON.stringify(r.data));

// ── 3. refresh token cannot be used as an access token ──
r = await call('GET', '/centres', { token: admin.refreshToken });
check('refresh token rejected as access token', r.status === 401, `status ${r.status}`);

// ── 4. officer can read own profile (userId bug) ──
r = await call('GET', `/officers/${officer.user.id}`, { token: O });
check('officer can open own profile', r.status === 200, `status ${r.status}`);
r = await call('GET', `/officers/${admin.user.id}`, { token: O });
check('officer cannot open someone else', r.status === 403, `status ${r.status}`);

// ── 5. device key on the AI-service routes ──
const slotCentre = officerCentre;
r = await call('POST', '/detection/report', { body: { centreId: slotCentre, detectedCount: 3 } });
check('detection report without key is refused', r.status === 401, `status ${r.status}`);
r = await call('POST', '/detection/report', { body: { centreId: slotCentre, detectedCount: 3 }, headers: { 'X-Device-Key': 'wrong' } });
check('detection report with a wrong key is refused', r.status === 401, `status ${r.status}`);
r = await call('POST', '/detection/report', { body: { centreId: slotCentre, detectedCount: 3 }, headers: { 'X-Device-Key': KEY } });
check('detection report with the device key works', r.status === 200, `status ${r.status}`);
r = await call('GET', `/centres/${slotCentre}/schedule`, { headers: { 'X-Device-Key': KEY } });
check('device can read the schedule', r.status === 200, `status ${r.status}`);
r = await call('GET', `/centres/${slotCentre}`, { headers: { 'X-Device-Key': KEY } });
check('device key does NOT open other routes', r.status === 401, `status ${r.status}`);

// ── 6. a second centre: officers stay inside their own ──
const code = 'T' + Math.floor(Math.random() * 90000 + 10000);
const scheme = (await call('GET', '/schemes?limit=1', { token: A })).data.data[0];
const payload = { code, name: 'Other Centre', address: 'Address 12', city: 'City', state: 'State', pincode: '123456', latitude: 1, longitude: 1, sanctionedCapacity: 10, totalTrainees: 5, schemeId: scheme.id, tools: [], slots: [] };
r = await call('POST', '/centres', { token: A, body: payload });
check('admin creates a second centre', r.status === 200, `status ${r.status}`);
const other = r.data?.id;
r = await call('POST', '/centres', { token: A, body: payload });
check('duplicate centre code gives a clean 409', r.status === 409 && !/prisma|invocation/i.test(JSON.stringify(r.data)), `${r.status} ${JSON.stringify(r.data)}`);
r = await call('POST', '/detection/report', { token: O, body: { centreId: other, detectedCount: 3 } });
check('officer cannot report for another centre', r.status === 403, `status ${r.status}`);
r = await call('GET', `/centres/${other}/analytics`, { token: O });
check('officer cannot read another centre', r.status === 403, `status ${r.status}`);

// ── 7. trainee attendance: no writing into other centres ──
const mk = await call('POST', '/trainees', { token: A, body: { fullName: 'Other Trainee', centreId: other } });
const traineeOther = mk.data?.id;
r = await call('POST', '/trainees/attendance', { token: O, body: { records: [{ traineeId: traineeOther, status: 'PRESENT' }] } });
check('officer cannot mark a trainee of another centre', r.status === 403, `status ${r.status} ${JSON.stringify(r.data)}`);
r = await call('POST', '/trainees/attendance', { token: O, body: { records: [{ traineeId: traineeOther, status: 'PRESENT' }] }, headers: { 'x-centre-id': other } });
check('x-centre-id header no longer works', r.status === 403, `status ${r.status}`);
r = await call('POST', '/trainees/attendance', { token: A, body: { records: [{ traineeId: traineeOther, status: 'PRESENT' }] } });
check('admin marks trainees (filed under their own centre)', r.status === 200 && r.data.count === 1, `status ${r.status} ${JSON.stringify(r.data).slice(0, 80)}`);
r = await call('POST', '/trainees/attendance', { token: A, body: { records: [{ traineeId: 'does-not-exist', status: 'PRESENT' }] } });
check('unknown trainee gives 404', r.status === 404, `status ${r.status}`);

// ── 8. a user without a centre sees nothing ──
const nc = await call('POST', '/auth/register', { token: A, body: { email: 'nocentre@x.com', password: 'password123', fullName: 'No Centre', role: 'VIEWER' } });
const ncToken = nc.data?.accessToken;
r = await call('GET', '/centres', { token: ncToken });
check('user with no centre is refused everywhere', r.status === 403, `status ${r.status}`);

// ── 9. deactivation takes effect straight away ──
r = await call('GET', '/alerts?limit=1', { token: O });
check('officer works before deactivation', r.status === 200, `status ${r.status}`);
await call('PATCH', `/officers/${officer.user.id}`, { token: A, body: { isActive: false } });
r = await call('GET', '/alerts?limit=1', { token: O });
check('deactivated officer is locked out at once', r.status === 401, `status ${r.status}`);
await call('PATCH', `/officers/${officer.user.id}`, { token: A, body: { isActive: true } });
r = await call('PATCH', `/officers/${admin.user.id}`, { token: A, body: { isActive: false } });
check('admin cannot deactivate themselves', r.status === 400, `status ${r.status}`);
r = await call('DELETE', `/officers/${admin.user.id}`, { token: A });
check('admin cannot delete themselves', r.status === 400, `status ${r.status}`);

// ── 10. websocket: the handshake token now works and events arrive ──
const O2 = (await login(...OFFICER)).accessToken;
const events = [];
const sock = io(HOST, { path: '/ws', auth: { token: O2 }, transports: ['websocket'] });
const authed = await new Promise((resolve) => { sock.on('authenticated', (d) => resolve(d.success)); sock.on('connect_error', () => resolve(false)); setTimeout(() => resolve('timeout'), 4000); });
check('socket authenticates from the handshake', authed === true, String(authed));
sock.on('detection:live', (d) => events.push(d));
await new Promise((r2) => setTimeout(r2, 300));
await call('POST', '/detection/report', { body: { centreId: officerCentre, detectedCount: 7, confidence: 0.8 }, headers: { 'X-Device-Key': KEY } });
await new Promise((r2) => setTimeout(r2, 800));
check('live event reaches the officer socket', events.length > 0 && events[0].detectedCount === 7, `${events.length} events`);
const bad = io(HOST, { path: '/ws', auth: { token: 'garbage' }, transports: ['websocket'], reconnection: false });
const badResult = await new Promise((resolve) => { bad.on('connect_error', () => resolve('rejected')); bad.on('connect', () => resolve('connected')); setTimeout(() => resolve('timeout'), 3000); });
check('socket with a bad token is rejected', badResult === 'rejected', badResult);
sock.close(); bad.close();

// ── 10b. profile + password change are real ──
const O3 = (await login(...OFFICER)).accessToken;
r = await call('PATCH', '/auth/me', { token: O3, body: { fullName: 'Renamed Officer' } });
check('officer can change own name', r.status === 200 && r.data?.user?.fullName === 'Renamed Officer', `status ${r.status}`);
r = await call('GET', '/auth/me', { token: O3 });
check('the new name is really stored', r.data?.user?.fullName === 'Renamed Officer', r.data?.user?.fullName);
r = await call('POST', '/auth/change-password', { token: O3, body: { currentPassword: 'not-my-password', newPassword: 'brand-new-pass-1' } });
check('wrong current password is refused', r.status === 400, `status ${r.status}`);
r = await call('POST', '/auth/change-password', { token: O3, body: { currentPassword: OFFICER[1], newPassword: 'brand-new-pass-1' } });
check('correct current password changes it', r.status === 200, `status ${r.status}`);
const withNew = await login(OFFICER[0], 'brand-new-pass-1');
check('sign-in works with the new password', !!withNew?.accessToken);
const withOld = await login(...OFFICER);
check('the old password no longer works', !withOld?.accessToken);
await call('POST', '/auth/change-password', { token: withNew.accessToken, body: { currentPassword: 'brand-new-pass-1', newPassword: OFFICER[1] } });

// ── 11. brute force is slowed ──
let limited = 0;
for (let i = 0; i < 14; i++) { const x = await call('POST', '/auth/login', { body: { email: 'admin@sih.gov.in', password: 'wrong-password' } }); if (x.status === 429) limited++; }
check('repeated wrong logins get rate-limited (429)', limited > 0, `${limited} of 14 blocked`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
