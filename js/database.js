// Datenbank-Management
const Database = {
    // Datenbank-Konstanten
    DB_NAME: 'TalerRechnerDB',
    DB_VERSION: 1,
    PROFILE_KEY: 'TalerRechnerProfile',
    PROFILES_KEY: 'TalerRechnerProfiles',

    // Store-Namen
    STORES: {
        TALER_ITEMS: 'talerItems',
        ITEMS_DATA: 'itemsData',
        SETTINGS: 'settings'
    },

    // Datenbank-Instanz
    db: null,
    useLocalStorage: false,
    useMemory: false,
    memoryStore: {},
    profile: 'default',

    getStoreKey(storeName) {
        return `${this.DB_NAME}:${storeName}`;
    },

    getProfilePrefixFor(profileName) {
        const trimmed = (profileName || '').toString().trim();
        return `${trimmed || 'default'}::`;
    },

    setProfile(profileName) {
        const trimmed = (profileName || '').toString().trim();
        this.profile = trimmed || 'default';
    },

    async loadWithProfile(profileName, storeName, key) {
        const previous = this.profile;
        this.setProfile(profileName);
        try {
            return await this.loadData(storeName, key);
        } finally {
            this.setProfile(previous);
        }
    },

    async saveWithProfile(profileName, storeName, key, data) {
        const previous = this.profile;
        this.setProfile(profileName);
        try {
            return await this.saveData(storeName, key, data);
        } finally {
            this.setProfile(previous);
        }
    },

    getProfilePrefix() {
        return this.getProfilePrefixFor(this.profile);
    },

    isPrefixedKey(rawKey) {
        if (rawKey === null || rawKey === undefined) return false;
        const key = rawKey.toString();
        return key.startsWith(this.getProfilePrefix());
    },

    normalizeKey(rawKey) {
        if (rawKey === null || rawKey === undefined) return null;
        const key = rawKey.toString();
        const prefix = this.getProfilePrefix();
        if (key.startsWith(prefix)) {
            return key.slice(prefix.length);
        }
        if (this.profile === 'default' && !key.includes('::')) {
            return key;
        }
        return null;
    },

    belongsToProfile(rawKey) {
        return this.normalizeKey(rawKey) !== null;
    },

    belongsToProfileKey(rawKey, profileName) {
        if (rawKey === null || rawKey === undefined) return false;
        const key = rawKey.toString();
        const prefix = this.getProfilePrefixFor(profileName);
        if (key.startsWith(prefix)) return true;
        if ((profileName || 'default') === 'default' && !key.includes('::')) return true;
        return false;
    },

    getProfileKey(key) {
        return `${this.getProfilePrefix()}${key}`;
    },

    getLocalStore(storeName) {
        if (this.useMemory) {
            return this.memoryStore[storeName] || {};
        }

        const key = this.getStoreKey(storeName);
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            this.useLocalStorage = false;
            this.useMemory = true;
            return this.memoryStore[storeName] || {};
        }
    },

    setLocalStore(storeName, data) {
        if (this.useMemory) {
            this.memoryStore[storeName] = data;
            return;
        }

        const key = this.getStoreKey(storeName);
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            this.useLocalStorage = false;
            this.useMemory = true;
            this.memoryStore[storeName] = data;
        }
    },

    // Datenbank initialisieren
    async init() {
        return new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') {
                this.useLocalStorage = true;
                resolve(null);
                return;
            }

            let request;
            try {
                request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            } catch (error) {
                this.useLocalStorage = true;
                resolve(null);
                return;
            }

            request.onerror = () => {
                this.useLocalStorage = true;
                resolve(null);
            };
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Taler Items Store
                if (!db.objectStoreNames.contains(this.STORES.TALER_ITEMS)) {
                    const store = db.createObjectStore(this.STORES.TALER_ITEMS, { keyPath: 'category' });
                    store.createIndex('category', 'category', { unique: true });
                }

                // Items Data Store
                if (!db.objectStoreNames.contains(this.STORES.ITEMS_DATA)) {
                    const store = db.createObjectStore(this.STORES.ITEMS_DATA, { keyPath: 'category' });
                    store.createIndex('category', 'category', { unique: true });
                }

                // Settings Store
                if (!db.objectStoreNames.contains(this.STORES.SETTINGS)) {
                    const store = db.createObjectStore(this.STORES.SETTINGS, { keyPath: 'key' });
                    store.createIndex('key', 'key', { unique: true });
                }
            };
        });
    },

    // Daten speichern
    async saveData(storeName, key, data) {
        if (this.useLocalStorage || this.useMemory || !this.db) {
            const store = this.getLocalStore(storeName);
            store[this.getProfileKey(key)] = data;
            this.setLocalStore(storeName, store);
            return Promise.resolve(key);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const profileKey = this.getProfileKey(key);
            const request = store.put({ [storeName === this.STORES.SETTINGS ? 'key' : 'category']: profileKey, data });

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Daten laden
    async loadData(storeName, key) {
        if (this.useLocalStorage || this.useMemory || !this.db) {
            const store = this.getLocalStore(storeName);
            const profileKey = this.getProfileKey(key);
            if (store[profileKey] !== undefined) {
                return Promise.resolve(store[profileKey]);
            }
            if (this.profile === 'default') {
                return Promise.resolve(store[key] !== undefined ? store[key] : null);
            }
            return Promise.resolve(null);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const profileKey = this.getProfileKey(key);
            const request = store.get(profileKey);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.data);
                    return;
                }

                if (this.profile !== 'default') {
                    resolve(null);
                    return;
                }

                const legacyRequest = store.get(key);
                legacyRequest.onsuccess = () => resolve(legacyRequest.result ? legacyRequest.result.data : null);
                legacyRequest.onerror = () => reject(legacyRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // Alle Daten aus einem Store laden
    async loadAllData(storeName) {
        if (this.useLocalStorage || this.useMemory || !this.db) {
            const store = this.getLocalStore(storeName);
            const result = {};
            Object.entries(store).forEach(([rawKey, value]) => {
                if (!this.belongsToProfile(rawKey)) return;
                const normalized = this.normalizeKey(rawKey);
                if (!normalized) return;
                if (!this.isPrefixedKey(rawKey) && result[normalized] !== undefined) return;
                result[normalized] = value;
            });
            return Promise.resolve(result);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const result = {};
                request.result.forEach(item => {
                    const rawKey = item.category || item.key;
                    if (!this.belongsToProfile(rawKey)) return;
                    const normalized = this.normalizeKey(rawKey);
                    if (!normalized) return;
                    if (!this.isPrefixedKey(rawKey) && result[normalized] !== undefined) return;
                    result[normalized] = item.data;
                });
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // Daten löschen
    async deleteData(storeName, key) {
        if (this.useLocalStorage || this.useMemory || !this.db) {
            const store = this.getLocalStore(storeName);
            delete store[this.getProfileKey(key)];
            if (this.profile === 'default') {
                delete store[key];
            }
            this.setLocalStore(storeName, store);
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(this.getProfileKey(key));

            request.onsuccess = () => {
                if (this.profile !== 'default') {
                    resolve();
                    return;
                }

                const legacyRequest = store.delete(key);
                legacyRequest.onsuccess = () => resolve();
                legacyRequest.onerror = () => reject(legacyRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // Store komplett leeren
    async clearStore(storeName) {
        if (this.useLocalStorage || this.useMemory || !this.db) {
            const store = this.getLocalStore(storeName);
            Object.keys(store).forEach(rawKey => {
                if (this.belongsToProfile(rawKey)) {
                    delete store[rawKey];
                }
            });
            this.setLocalStore(storeName, store);
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    resolve();
                    return;
                }

                if (this.belongsToProfile(cursor.key)) {
                    cursor.delete();
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteProfileData(profileName) {
        const stores = Object.values(this.STORES);
        if (this.useLocalStorage || this.useMemory || !this.db) {
            stores.forEach(storeName => {
                const store = this.getLocalStore(storeName);
                Object.keys(store).forEach(rawKey => {
                    if (this.belongsToProfileKey(rawKey, profileName)) {
                        delete store[rawKey];
                    }
                });
                this.setLocalStore(storeName, store);
            });
            return Promise.resolve();
        }

        return Promise.all(stores.map(storeName => new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    resolve();
                    return;
                }

                if (this.belongsToProfileKey(cursor.key, profileName)) {
                    cursor.delete();
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        }))).then(() => undefined);
    }
};
