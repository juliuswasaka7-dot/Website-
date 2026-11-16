import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface DataSaverContextValue {
  dataSaver: boolean;
  setDataSaver: (enabled: boolean) => void;
  toggleDataSaver: () => void;
  isOffline: boolean;
  connectionLabel: string | null;
}

const DataSaverContext = createContext<DataSaverContextValue | null>(null);

const STORAGE_KEY = 'fyl_data_saver_v1';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export function DataSaverProvider({ children }: { children: ReactNode }) {
  const [dataSaver, setDataSaverState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) return saved === 'true';
      const conn = (navigator as unknown as { connection?: NetworkInformationLike })
        .connection;
      if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
        return true;
      }
    } catch {
      // Ignore storage/navigator issues
    }
    return false;
  });

  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [connectionLabel, setConnectionLabel] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const conn = (navigator as unknown as { connection?: NetworkInformationLike })
      .connection;
    const syncConn = () => {
      if (!conn) return;
      setConnectionLabel(conn.effectiveType ? conn.effectiveType.toUpperCase() : null);
    };
    syncConn();
    conn?.addEventListener?.('change', syncConn);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      conn?.removeEventListener?.('change', syncConn);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('data-saver', dataSaver);
  }, [dataSaver]);

  const setDataSaver = (enabled: boolean) => {
    setDataSaverState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <DataSaverContext.Provider
      value={{
        dataSaver,
        setDataSaver,
        toggleDataSaver: () => setDataSaver(!dataSaver),
        isOffline,
        connectionLabel,
      }}
    >
      {children}
    </DataSaverContext.Provider>
  );
}

export function useDataSaver() {
  const ctx = useContext(DataSaverContext);
  if (!ctx) {
    throw new Error('useDataSaver must be used inside DataSaverProvider');
  }
  return ctx;
}
