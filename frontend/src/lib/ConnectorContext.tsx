'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  checkConnectorStatus, 
  getDevices,
  type ConnectorStatusResult,
  type DiscoveredDevice
} from './connector';

interface ConnectorState {
  status: ConnectorStatusResult;
  devices: DiscoveredDevice[];
  activeDevice: DiscoveredDevice | null;
  isChecking: boolean;
  isDiscovering: boolean;
  refreshStatus: () => Promise<void>;
  discoverDevices: () => Promise<void>;
  setActiveDevice: (device: DiscoveredDevice | null) => void;
}

const defaultState: ConnectorState = {
  status: { status: 'checking' },
  devices: [],
  activeDevice: null,
  isChecking: true,
  isDiscovering: false,
  refreshStatus: async () => {},
  discoverDevices: async () => {},
  setActiveDevice: () => {},
};

const ConnectorContext = createContext<ConnectorState>(defaultState);

export function ConnectorProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectorStatusResult>({ status: 'checking' });
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<DiscoveredDevice | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const discoverDevices = useCallback(async () => {
    setIsDiscovering(true);
    try {
      const found = await getDevices();
      setDevices(found || []);
      
      if (found && found.length > 0) {
        // Auto-select the first real scanner if none selected
        if (!activeDevice) {
          const realScanner =
            found.find((d) => d.protocol === "ESCL" || (d.ip && d.ip !== "SIMULATOR" && !d.id.includes("PDF"))) ||
            found.find((d) => d.ip && d.ip !== "SIMULATOR") ||
            found[0];
          setActiveDevice(realScanner || null);
        }
      } else {
        setActiveDevice(null);
      }
    } catch (err) {
      console.warn("ConnectorManager: Discovery failed", err);
    } finally {
      setIsDiscovering(false);
    }
  }, [activeDevice]);

  const refreshStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await checkConnectorStatus();
      setStatus(result);

      if (result.status === 'connected' || result.status === 'outdated') {
        // If we transition to connected, fetch devices
        await discoverDevices();
      } else {
        setDevices([]);
        setActiveDevice(null);
      }
    } catch (err) {
      setStatus({ status: 'error', errorMessage: String(err) });
    } finally {
      setIsChecking(false);
    }
  }, [discoverDevices]);

  // Initial check and polling
  useEffect(() => {
    refreshStatus();
    
    // Poll every 10 seconds to maintain real-time state
    const interval = setInterval(refreshStatus, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  return (
    <ConnectorContext.Provider 
      value={{ 
        status, 
        devices, 
        activeDevice, 
        isChecking, 
        isDiscovering, 
        refreshStatus, 
        discoverDevices,
        setActiveDevice
      }}
    >
      {children}
    </ConnectorContext.Provider>
  );
}

export function useConnector() {
  return useContext(ConnectorContext);
}
