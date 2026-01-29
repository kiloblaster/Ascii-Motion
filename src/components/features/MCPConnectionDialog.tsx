/**
 * MCP Connection Dialog
 * 
 * Dialog for managing MCP server connection.
 * Allows users to enter auth token and connect to the MCP server.
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Separator } from '../ui/separator';
import { Unplug, Plug, Terminal, Copy, Check } from 'lucide-react';
import { useMCPConnection } from '../../mcp';
import { cn } from '../../lib/utils';

interface MCPConnectionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MCPConnectionDialog: React.FC<MCPConnectionDialogProps> = ({
  isOpen,
  onOpenChange
}) => {
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
  const [copied, setCopied] = useState(false);

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

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('npx ascii-motion-mcp --live');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            MCP Connection
          </DialogTitle>
          <DialogDescription>
            Connect to the ASCII Motion MCP server for AI-assisted editing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection Status */}
          <Card className="border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      connectionState === 'connected' && 'bg-green-500',
                      connectionState === 'connecting' && 'bg-yellow-500 animate-pulse',
                      connectionState === 'error' && 'bg-red-500',
                      connectionState === 'disconnected' && 'bg-zinc-500'
                    )}
                  />
                  <span className={cn(
                    'text-sm font-medium',
                    connectionState === 'connected' && 'text-green-500',
                    connectionState === 'connecting' && 'text-yellow-500',
                    connectionState === 'error' && 'text-red-500',
                    connectionState === 'disconnected' && 'text-muted-foreground'
                  )}>
                    {connectionState === 'connected' && 'Connected'}
                    {connectionState === 'connecting' && 'Connecting...'}
                    {connectionState === 'error' && 'Error'}
                    {connectionState === 'disconnected' && 'Disconnected'}
                  </span>
                </div>
              </div>
              {isConnected && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Commands received</span>
                    <span className="font-mono">{commandsReceived}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <Card className="border-red-500/50 bg-red-500/10">
              <CardContent className="pt-4">
                <p className="text-sm text-red-400">{error}</p>
              </CardContent>
            </Card>
          )}

          {isConnected ? (
            <Button
              onClick={handleDisconnect}
              variant="destructive"
              className="w-full"
            >
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : (
            <>
              <Separator />

              {/* Instructions */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Start the MCP server and copy the auth token:
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono">
                    npx ascii-motion-mcp --live
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCommand}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Connection Form */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-token">Auth Token</Label>
                  <Input
                    id="mcp-token"
                    type="text"
                    placeholder="Paste token from MCP server"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mcp-port">Port</Label>
                  <Input
                    id="mcp-port"
                    type="number"
                    placeholder="9876"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>

                <Button
                  onClick={handleConnect}
                  disabled={!token.trim() || isConnecting}
                  className="w-full"
                >
                  <Plug className="mr-2 h-4 w-4" />
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
