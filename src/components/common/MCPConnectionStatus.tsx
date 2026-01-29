/**
 * MCP Connection Status Indicator
 * 
 * Displays the current MCP server connection status in the UI.
 * Shows a small colored dot with tooltip showing connection details.
 */

import React, { useState } from 'react';
import { useMCPConnection } from '../../mcp';
import { cn } from '../../lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface MCPConnectionStatusProps {
  className?: string;
}

const STATUS_COLORS = {
  disconnected: 'bg-zinc-500',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
  error: 'bg-red-500'
} as const;

const STATUS_LABELS = {
  disconnected: 'MCP: Disconnected',
  connecting: 'MCP: Connecting...',
  connected: 'MCP: Connected',
  error: 'MCP: Error'
} as const;

export function MCPConnectionStatus({ className }: MCPConnectionStatusProps) {
  const {
    connectionState,
    isConnected,
    error,
    commandsReceived,
    connect,
    disconnect
  } = useMCPConnection();
  
  const [token, setToken] = useState('');
  const [port, setPort] = useState('9876');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const handleConnect = async () => {
    if (!token.trim()) return;
    
    setIsConnecting(true);
    try {
      await connect(token.trim(), parseInt(port, 10) || 9876);
    } catch (err) {
      console.error('Failed to connect:', err);
    } finally {
      setIsConnecting(false);
    }
  };
  
  const handleDisconnect = () => {
    disconnect();
    setToken('');
  };
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
            'hover:bg-zinc-800 transition-colors cursor-pointer',
            'focus:outline-none focus:ring-1 focus:ring-zinc-600',
            className
          )}
          title={STATUS_LABELS[connectionState]}
        >
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              STATUS_COLORS[connectionState]
            )}
          />
          <span className="text-zinc-400">MCP</span>
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">MCP Connection</h4>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded',
              connectionState === 'connected' && 'bg-green-500/20 text-green-400',
              connectionState === 'connecting' && 'bg-yellow-500/20 text-yellow-400',
              connectionState === 'error' && 'bg-red-500/20 text-red-400',
              connectionState === 'disconnected' && 'bg-zinc-500/20 text-zinc-400'
            )}>
              {connectionState}
            </span>
          </div>
          
          {isConnected ? (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
                <p>Commands received: {commandsReceived}</p>
              </div>
              <Button
                onClick={handleDisconnect}
                variant="destructive"
                size="sm"
                className="w-full"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded">
                  {error}
                </p>
              )}
              
              <div className="space-y-1.5">
                <Label htmlFor="mcp-token" className="text-xs">
                  Auth Token
                </Label>
                <Input
                  id="mcp-token"
                  type="password"
                  placeholder="Paste token from MCP server"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="h-8 text-xs"
                  disabled={isConnecting}
                />
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="mcp-port" className="text-xs">
                  Port
                </Label>
                <Input
                  id="mcp-port"
                  type="number"
                  placeholder="9876"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="h-8 text-xs"
                  disabled={isConnecting}
                />
              </div>
              
              <Button
                onClick={handleConnect}
                disabled={!token.trim() || isConnecting}
                size="sm"
                className="w-full"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
              
              <p className="text-[10px] text-zinc-500 leading-tight">
                Start the MCP server with <code className="bg-zinc-800 px-1 rounded">--live</code> flag
                and copy the auth token from stdout.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
