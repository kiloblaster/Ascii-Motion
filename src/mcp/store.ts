/**
 * MCP Connection Store
 * 
 * Zustand store for managing MCP connection state in the UI.
 */

import { create } from 'zustand';

export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface MCPStoreState {
  // Connection state
  connectionState: MCPConnectionState;
  serverUrl: string | null;
  sessionId: string | null;
  
  // Error state
  lastError: string | null;
  
  // Statistics
  commandsReceived: number;
  lastCommandTime: number | null;
  
  // Actions
  setConnectionState: (state: MCPConnectionState) => void;
  setServerUrl: (url: string | null) => void;
  setSessionId: (sessionId: string | null) => void;
  setError: (error: string | null) => void;
  incrementCommandCount: () => void;
  reset: () => void;
}

export const useMCPStore = create<MCPStoreState>((set) => ({
  // Initial state
  connectionState: 'disconnected',
  serverUrl: null,
  sessionId: null,
  lastError: null,
  commandsReceived: 0,
  lastCommandTime: null,
  
  // Actions
  setConnectionState: (connectionState) => set({ connectionState }),
  
  setServerUrl: (serverUrl) => set({ serverUrl }),
  
  setSessionId: (sessionId) => set({ sessionId }),
  
  setError: (lastError) => set({ 
    lastError,
    connectionState: lastError ? 'error' : 'disconnected'
  }),
  
  incrementCommandCount: () => set((state) => ({
    commandsReceived: state.commandsReceived + 1,
    lastCommandTime: Date.now()
  })),
  
  reset: () => set({
    connectionState: 'disconnected',
    serverUrl: null,
    sessionId: null,
    lastError: null,
    commandsReceived: 0,
    lastCommandTime: null
  })
}));
