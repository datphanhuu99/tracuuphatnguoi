/** A single versioned state key, stored locally, never synced. */
export function createLocalStore(local) {
  return {
    initialize: () => local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    read: async () => (await local.get('appState')).appState,
    write: state => local.set({ appState: state }),
  };
}
