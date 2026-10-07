// In-memory stand-in for the iOS Keychain in tests (Jest uses it automatically).
const store = new Map();
const key = options => (options && options.service) || 'default';

module.exports = {
  ACCESSIBLE: {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AccessibleAfterFirstUnlockThisDeviceOnly',
  },
  setGenericPassword: async (username, password, options) => {
    store.set(key(options), { username, password, service: key(options) });
    return { service: key(options), storage: 'keychain' };
  },
  getGenericPassword: async options => store.get(key(options)) || false,
  resetGenericPassword: async options => store.delete(key(options)),
};
