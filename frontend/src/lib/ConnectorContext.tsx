'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  checkConnectorStatus, 
  getDevices,
  discoverDevices as runConnectorDiscovery,
  launchLocalConnector,
  getConnectorDiagnostics,
  type ConnectorStatusResult,
  type ConnectorStatusType,
  type DiscoveredDevice
} from './connector';

interface ConnectorContextValue {
  status: ConnectorStatusType;
  statusDetails: ConnectorStatusResult;
  version?: string;
  devices: DiscoveredDevice[];
  activeDevice: DiscoveredDevice | null;
  isChecking: boolean;
  isDiscovering: boolean;
  isStarting: boolean;
  lastError: string | null;
  refreshStatus: () => Promise<void>;
  discoverDevices: () => Promise<void>;
  startConnector: () => Promise<void>;
  setActiveDevice: (device: DiscoveredDevice | null) => void;
  getDiagnostics: () => Promise<any>;
}

const defaultContext: ConnectorContextValue = {
  status: 'NOT_INSTALLED',
  statusDetails: { status: 'NOT_INSTALLED' },
  version: undefined,
  devices: [],
  activeDevice: null,
  isChecking: true,
  isDiscovering: false,
  isStarting: false,
  lastError: null,
  refreshStatus: async () => {},
  discoverDevices: async () => {},
  startConnector: async () => {},
  setActiveDevice: () => {},
  getDiagnostics: async () => ({}),
};

const ConnectorContext = createContext<ConnectorContextValue>(defaultContext);

export function ConnectorProvider({ children }: { children: React.ReactNode }) {
  const [statusDetails, setStatusDetails] = useState<ConnectorStatusResult>({ status: 'NOT_INSTALLED' });
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<DiscoveredDevice | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const consecutiveFailuresRef = useRef(0);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const discoverDevices = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const found = await runConnectorDiscovery();
      if (!isMountedRef.current) return;
      setDevices(found || []);
      
      if (found && found.length > 0) {
        // Auto-select the first scan-ready device if none selected
        setActiveDevice((prev) => {
          if (prev && found.some((d) => d.id === prev.id)) return prev;
          const realScanner =
            found.find((d) => d.protocol === 'ESCL' || (d.ip && d.ip !== 'SIMULATOR' && !d.id.includes('PDF'))) ||
            found.find((d) => d.ip && d.ip !== 'SIMULATOR') ||
            found[0];
          return realScanner || null;
        });
      } else {
        setActiveDevice(null);
      }
    } catch (err: any) {
      console.warn('ConnectorContext: Device discovery failed:', err);
    } finally {
      if (isMountedRef.current) setIsDiscovering(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setIsChecking(true);
    setLastError(null);

    try {
      const result = await checkConnectorStatus();
      if (!isMountedRef.current) return;

      setStatusDetails(result);

      if (result.status === 'CONNECTED' || result.status === 'READY') {
        consecutiveFailuresRef.current = 0;
        // Fetch devices automatically when connected
        try {
          const loadedDevices = await getDevices();
          if (isMountedRef.current) {
            setDevices(loadedDevices || []);
            setActiveDevice((prev) => {
              if (prev && loadedDevices.some((d) => d.id === prev.id)) return prev;
              const auto = loadedDevices.find((d) => d.capabilities?.scanning || d.backendInfo?.readyToScan || d.id === 'SIMULATOR') || loadedDevices[0];
              return auto || null;
            });
          }
        } catch {
          // If cached devices fail, try active discovery
          discoverDevices();
        }
      } else if (result.status === 'UPDATE_REQUIRED') {
        consecutiveFailuresRef.current = 0;
        setDevices([]);
        setActiveDevice(null);
      } else {
        consecutiveFailuresRef.current += 1;
        setDevices([]);
        setActiveDevice(null);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setLastError(err?.message || 'Verbindung fehlgeschlagen');
      consecutiveFailuresRef.current += 1;
    } finally {
      if (isMountedRef.current) setIsChecking(false);
    }
  }, [discoverDevices]);

  // Wake up service via custom URI protocol with quick retry loop
  const startConnector = useCallback(async () => {
    setIsStarting(true);
    launchLocalConnector();

    let attempts = 0;
    const maxAttempts = 8;
    const pollInterval = 1200;

    const interval = setInterval(async () => {
      attempts++;
      const res = await checkConnectorStatus();
      if (res.status === 'CONNECTED' || res.status === 'READY' || res.status === 'UPDATE_REQUIRED') {
        clearInterval(interval);
        if (isMountedRef.current) {
          setIsStarting(false);
          refreshStatus();
        }
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        if (isMountedRef.current) {
          setIsStarting(false);
          refreshStatus();
        }
      }
    }, pollInterval);
  }, [refreshStatus]);

  const getDiagnostics = useCallback(async () => {
    return getConnectorDiagnostics();
  }, []);

  // Continuous adaptive background polling
  useEffect(() => {
    isMountedRef.current = true;
    refreshStatus();

    const scheduleNextCheck = () => {
      // If connected: poll every 15s to keep state fresh
      // If disconnected: backoff from 5s to 12s
      const delay = (statusDetails.status === 'CONNECTED' || statusDetails.status === 'READY')
        ? 15000
        : Math.min(5000 + consecutiveFailuresRef.current * 2000, 12000);

      checkTimerRef.current = setTimeout(async () => {
        await refreshStatus();
        scheduleNextCheck();
      }, delay);
    };

    scheduleNextCheck();

    return () => {
      isMountedRef.current = false;
      if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    };
  }, [refreshStatus, statusDetails.status]);

  const currentStatus: ConnectorStatusType =
    isStarting
      ? 'STARTING'
      : (statusDetails.status === 'CONNECTED' && devices.length > 0 && activeDevice)
      ? 'READY'
      : statusDetails.status;

  return (
    <ConnectorContext.Provider 
      value={{ 
        status: currentStatus, 
        statusDetails,
        version: statusDetails.version,
        devices, 
        activeDevice, 
        isChecking, 
        isDiscovering, 
        isStarting,
        lastError,
        refreshStatus, 
        discoverDevices,
        startConnector,
        setActiveDevice,
        getDiagnostics
      }}
    >
      {children}
    </ConnectorContext.Provider>
  );
}

export function useConnector() {
  return useContext(ConnectorContext);
}
