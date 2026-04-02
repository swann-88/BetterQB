export function createStore(initialState) {
  let state = initialState;
  const listeners = [];

  function notify(reason) {
    for (const listener of listeners) {
      listener(state, reason);
    }
  }

  return {
    getState() {
      return state;
    },
    setState(updater, reason = "state-update") {
      const nextState = typeof updater === "function" ? updater(state) : updater;
      state = nextState;
      notify(reason);
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }
  };
}
