/**
 * useMCPConnection Hook
 * 
 * React hook for managing MCP server connection in components.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createMCPClient, MCPClient } from './client';
import { useMCPStore, type MCPConnectionState } from './store';

interface UseMCPConnectionReturn {
  /** Current connection state */
  connectionState: MCPConnectionState;
  
  /** Whether currently connected */
  isConnected: boolean;
  
  /** Last error message, if any */
  error: string | null;
  
  /** Number of commands received */
  commandsReceived: number;
  
  /** Connect to MCP server */
  connect: (token: string, port?: number) => Promise<void>;
  
  /** Disconnect from MCP server */
  disconnect: () => void;
  
  /** Send state snapshot to server */
  sendStateSnapshot: () => void;
}

/**
 * Hook for managing MCP connection in React components
 * 
 * @example
 * ```tsx
 * function MCPPanel() {
 *   const { connectionState, connect, disconnect, isConnected } = useMCPConnection();
 *   
 *   return (
 *     <div>
 *       <p>Status: {connectionState}</p>
 *       {!isConnected ? (
 *         <button onClick={() => connect('your-token')}>Connect</button>
 *       ) : (
 *         <button onClick={disconnect}>Disconnect</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMCPConnection(): UseMCPConnectionReturn {
  const clientRef = useRef<MCPClient | null>(null);
  
  const connectionState = useMCPStore((state) => state.connectionState);
  const lastError = useMCPStore((state) => state.lastError);
  const commandsReceived = useMCPStore((state) => state.commandsReceived);
  
  // Initialize client on mount
  useEffect(() => {
    clientRef.current = createMCPClient();
    
    return () => {
      // Disconnect on unmount
      clientRef.current?.disconnect();
    };
  }, []);
  
  const connect = useCallback(async (token: string, port?: number) => {
    if (!clientRef.current) {
      clientRef.current = createMCPClient();
    }
    await clientRef.current.connect(token, port);
  }, []);
  
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);
  
  const sendStateSnapshot = useCallback(() => {
    clientRef.current?.sendStateSnapshot();
  }, []);
  
  return {
    connectionState,
    isConnected: connectionState === 'connected',
    error: lastError,
    commandsReceived,
    connect,
    disconnect,
    sendStateSnapshot
  };
}
