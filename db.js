/* ============================================
   LEDGER — IndexedDB storage layer
   Simple promise-based wrapper around a single
   "bets" object store. No frameworks needed.
   ============================================ */

const LedgerDB = (() => {
  const DB_NAME = 'ledger-db';
  const DB_VERSION = 1;
  const STORE = 'bets';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function tx(mode) {
    const db = await open();
    const transaction = db.transaction(STORE, mode);
    return transaction.objectStore(STORE);
  }

  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  return {
    async getAll() {
      const store = await tx('readonly');
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async add(bet) {
      const store = await tx('readwrite');
      const record = {
        id: uid(),
        stake: bet.stake,
        returnAmount: bet.returnAmount,
        result: bet.result,
        notes: bet.notes || '',
        date: bet.date,
        createdAt: Date.now()
      };
      return new Promise((resolve, reject) => {
        const req = store.add(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => reject(req.error);
      });
    },

    async update(id, changes) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (!existing) return reject(new Error('Bet not found'));
          const updated = { ...existing, ...changes };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async remove(id) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async clearAll() {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async bulkImport(bets) {
      const store = await tx('readwrite');
      return new Promise((resolve, reject) => {
        let count = 0;
        if (bets.length === 0) return resolve();
        bets.forEach((bet) => {
          const record = {
            id: bet.id || uid(),
            stake: Number(bet.stake) || 0,
            returnAmount: Number(bet.returnAmount) || 0,
            result: bet.result === 'win' ? 'win' : 'loss',
            notes: bet.notes || '',
            date: bet.date || new Date().toISOString().slice(0, 10),
            createdAt: bet.createdAt || Date.now()
          };
          const req = store.put(record);
          req.onsuccess = () => {
            count++;
            if (count === bets.length) resolve();
          };
          req.onerror = () => reject(req.error);
        });
      });
    }
  };
})();
