export const DEMO_PASSWORD = 'demo123';
export const accounts = [
  { email: 'admin@demo.local', role: 'admin' },
  ...[1, 2].map(id => ({ email: `registration${id}@staff.ysl.local`, role: 'staff', staff_function: 'register' })),
  ...[1, 2, 3, 4].map(id => ({ email: `station${id}@staff.ysl.local`, role: 'staff', staff_function: 'station', station_id: id })),
];
export const stations = [1, 2, 3, 4].map(id => ({ id, name: `Station ${id}${id === 4 ? ' · Gift redemption' : ''}` }));
export function sampleUsers() {
  return [
    { id: 1001, mobile_number: '09171234501', email: 'attendee1@example.com', rfid_uid: '04A1B2C3D4', completed: [1, 2, 3] },
    { id: 1002, mobile_number: '09171234502', email: 'attendee2@example.com', rfid_uid: '04F5E6D7C8', completed: [] },
    { id: 1003, mobile_number: '09171234503', email: 'attendee3@example.com', rfid_uid: null, completed: [] },
    { id: 1004, mobile_number: '09171234504', email: 'attendee4@example.com', rfid_uid: '04B1C2D3E4', completed: [1] },
    { id: 1005, mobile_number: '09171234505', email: 'attendee5@example.com', rfid_uid: null, completed: [] },
    { id: 1006, mobile_number: '09171234506', email: 'attendee6@example.com', rfid_uid: null, completed: [] },
  ];
}
export function authenticate(email, password) {
  const account = accounts.find(item => item.email === email.trim().toLowerCase());
  if (!account || password !== DEMO_PASSWORD) throw new Error('Choose a sample account and use password demo123.');
  return { ...account };
}
export const canRegister = account => account?.role === 'admin' || account?.staff_function === 'register';
export const canCheckIn = account => account?.role === 'admin' || account?.staff_function === 'station';
export function linkCard(account, users, id, uid) {
  if (!canRegister(account)) throw new Error('This account cannot manage card assignments.');
  if (!uid.trim()) throw new Error('Capture a card UID first.');
  const user = users.find(item => item.id === id);
  if (!user) throw new Error('User not found.');
  if (users.some(item => item.id !== id && item.rfid_uid === uid)) throw new Error('This UID is already assigned to another user. Try a different card.');
  user.rfid_uid = uid;
}
export function unassignCard(account, users, id) {
  if (!canRegister(account)) throw new Error('This account cannot manage card assignments.');
  const user = users.find(item => item.id === id);
  if (!user) throw new Error('User not found.');
  user.rfid_uid = null;
}
export function checkIn(account, users, uid, stationId, uncertain = false) {
  if (!canCheckIn(account)) throw new Error('This account cannot check in cards.');
  const station = account.role === 'admin' ? Number(stationId) : account.station_id;
  if (account.role !== 'admin' && stationId != null && Number(stationId) !== station) throw new Error('This account can only use its assigned station.');
  if (!stations.some(item => item.id === station) || !uid.trim()) return { status: 'error', message: 'Select a station and enter a card UID.' };
  if (uncertain) return { status: 'error', message: 'Server error: outcome uncertain. Verify the check-in before trying again. No automatic retry was made.' };
  const user = users.find(item => item.rfid_uid === uid);
  if (!user) return { status: 'error', message: 'Unknown card. Link it to an attendee before checking in.' };
  if (user.completed.includes(station)) return { status: 'duplicate', message: 'Already checked in at this station. No new record was created.' };
  if (station === 4 && ![1, 2, 3].every(id => user.completed.includes(id))) return { status: 'prerequisites_not_met', message: 'Complete stations 1, 2, and 3 before gift redemption.' };
  user.completed.push(station);
  if (station === 4) user.rfid_uid = null;
  return { status: 'success', message: station === 4 ? 'Gift redeemed successfully. Card assignment cleared; the card can now be reused.' : 'Station checked in successfully', userId: user.id, station };
}
