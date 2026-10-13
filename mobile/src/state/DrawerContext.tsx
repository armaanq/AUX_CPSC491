import React, { createContext, useContext, useMemo, useState } from 'react';

type API = { isOpen: boolean; open: () => void; close: () => void };

const Context = createContext<API>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

/** Opens and closes the friends drawer from any tab's top bar. */
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(
    () => ({ isOpen, open: () => setOpen(true), close: () => setOpen(false) }),
    [isOpen],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDrawer() {
  return useContext(Context);
}
