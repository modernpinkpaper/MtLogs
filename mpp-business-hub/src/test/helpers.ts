import { HubServer } from '../server/hub';
import { USER_IDS } from '../server/seed';

export const U = USER_IDS;
export async function newHub() { return HubServer.create({ persist: false }); }
let n = 0;
export const key = (p = 'k') => `${p}-${++n}`;
