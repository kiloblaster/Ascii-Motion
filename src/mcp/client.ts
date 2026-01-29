/**
 * MCP WebSocket Client
 * 
 * Connects to the ascii-motion-mcp server running in --live mode.
 * Receives commands and applies them to local Zustand stores.
 */

import type { Cell } from '../types';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useHistoryStore } from '../stores/historyStore';
import { useMCPStore } from './store';
import type { MCPCommand, MCPServerMessage, MCPClientAuth, MCPClientHeartbeat, MCPClientStateSnapshot } from './types';

const DEFAULT_PORT = 9876;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

export class MCPClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private sessionId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private port: number = DEFAULT_PORT;
  private autoReconnect: boolean = true;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  /**
   * Connect to the MCP server
   */
  connect(token: string, port: number = DEFAULT_PORT): Promise<void> {
    return new Promise((resolve, reject) => {
      this.token = token;
      this.port = port;
      
      const url = `ws://127.0.0.1:${port}?token=${encodeURIComponent(token)}`;
      
      useMCPStore.getState().setConnectionState('connecting');
      useMCPStore.getState().setServerUrl(url);
      
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('[MCP] Connected to server');
          useMCPStore.getState().setConnectionState('connected');
          useMCPStore.getState().setSessionId(this.sessionId);
          
          // Send auth message
          this.sendAuth();
          
          // Start heartbeat
          this.startHeartbeat();
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
        
        this.ws.onerror = (error) => {
          console.error('[MCP] WebSocket error:', error);
          useMCPStore.getState().setError('Connection error');
          reject(new Error('WebSocket connection failed'));
        };
        
        this.ws.onclose = (event) => {
          console.log('[MCP] Disconnected:', event.code, event.reason);
          this.cleanup();
          
          if (this.autoReconnect && this.token) {
            this.scheduleReconnect();
          }
        };
        
      } catch (error) {
        useMCPStore.getState().setError(String(error));
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    this.autoReconnect = false;
    this.cleanup();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    
    useMCPStore.getState().reset();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a state snapshot to the server
   */
  sendStateSnapshot(): void {
    if (!this.isConnected()) return;
    
    const canvas = useCanvasStore.getState();
    const animation = useAnimationStore.getState();
    
    const snapshot: MCPClientStateSnapshot = {
      type: 'state_snapshot',
      canvas: {
        width: canvas.width,
        height: canvas.height,
        cellCount: canvas.getCellCount(),
        backgroundColor: canvas.canvasBackgroundColor
      },
      animation: {
        frameCount: animation.frames.length,
        currentFrameIndex: animation.currentFrameIndex,
        isPlaying: animation.isPlaying,
        looping: animation.looping,
        frameRate: animation.frameRate
      }
    };
    
    this.send(snapshot);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private generateSessionId(): string {
    return `browser-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private sendAuth(): void {
    if (!this.token) return;
    
    const auth: MCPClientAuth = {
      type: 'auth',
      token: this.token,
      sessionId: this.sessionId
    };
    
    this.send(auth);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        const heartbeat: MCPClientHeartbeat = { type: 'heartbeat' };
        this.send(heartbeat);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    
    console.log(`[MCP] Reconnecting in ${RECONNECT_DELAY}ms...`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.token) {
        this.connect(this.token, this.port).catch(() => {
          // Retry again
          if (this.autoReconnect) {
            this.scheduleReconnect();
          }
        });
      }
    }, RECONNECT_DELAY);
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    useMCPStore.getState().setConnectionState('disconnected');
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as MCPServerMessage;
      
      switch (message.type) {
        case 'auth_result':
          if (!message.success) {
            console.error('[MCP] Auth failed:', message.error);
            useMCPStore.getState().setError(message.error || 'Authentication failed');
            this.disconnect();
          }
          break;
          
        case 'command':
          if (message.command) {
            this.executeCommand(message.command);
            useMCPStore.getState().incrementCommandCount();
          }
          break;
          
        case 'state_request':
          this.sendStateSnapshot();
          break;
          
        case 'error':
          console.error('[MCP] Server error:', message.error);
          break;
      }
    } catch (error) {
      console.error('[MCP] Failed to parse message:', error);
    }
  }

  private executeCommand(command: MCPCommand): void {
    console.log('[MCP] Executing command:', command.type);
    
    switch (command.type) {
      case 'set_cell':
        this.handleSetCell(command);
        break;
        
      case 'set_cells_batch':
        this.handleSetCellsBatch(command);
        break;
        
      case 'clear_cell':
        this.handleClearCell(command);
        break;
        
      case 'resize_canvas':
        this.handleResizeCanvas(command);
        break;
        
      case 'set_canvas_data':
        this.handleSetCanvasData(command);
        break;
        
      case 'add_frame':
        this.handleAddFrame(command);
        break;
        
      case 'delete_frame':
        this.handleDeleteFrame(command);
        break;
        
      case 'go_to_frame':
        this.handleGoToFrame(command);
        break;
        
      case 'set_frame_duration':
        this.handleSetFrameDuration(command);
        break;
        
      case 'set_frame_data':
        this.handleSetFrameData(command);
        break;
        
      case 'undo':
        this.handleUndo();
        break;
        
      case 'redo':
        this.handleRedo();
        break;
        
      case 'new_project':
        this.handleNewProject(command);
        break;
        
      case 'load_project':
        this.handleLoadProject(command);
        break;
        
      case 'set_foreground_color':
        this.handleSetForegroundColor(command);
        break;
        
      case 'set_background_color':
        this.handleSetBackgroundColor(command);
        break;
        
      case 'select_rectangle':
        this.handleSelectRectangle(command);
        break;
        
      case 'clear_selection':
        this.handleClearSelection();
        break;
        
      default:
        console.warn('[MCP] Unknown command type:', (command as { type: string }).type);
    }
  }

  // ==========================================================================
  // Command Handlers
  // ==========================================================================

  private handleSetCell(cmd: { x: number; y: number; cell: Cell }): void {
    useCanvasStore.getState().setCell(cmd.x, cmd.y, cmd.cell);
  }

  private handleSetCellsBatch(cmd: { cells: Array<{ x: number; y: number; cell: Cell }> }): void {
    const canvasStore = useCanvasStore.getState();
    for (const { x, y, cell } of cmd.cells) {
      canvasStore.setCell(x, y, cell);
    }
  }

  private handleClearCell(cmd: { x: number; y: number }): void {
    useCanvasStore.getState().clearCell(cmd.x, cmd.y);
  }

  private handleResizeCanvas(cmd: { width: number; height: number }): void {
    useCanvasStore.getState().setCanvasSize(cmd.width, cmd.height);
  }

  private handleSetCanvasData(cmd: { cells: Array<{ key: string; cell: Cell }> }): void {
    const newCells = new Map<string, Cell>();
    for (const { key, cell } of cmd.cells) {
      newCells.set(key, cell);
    }
    useCanvasStore.getState().setCanvasData(newCells);
  }

  private handleAddFrame(cmd: { atIndex?: number; cells?: Array<{ key: string; cell: Cell }>; duration?: number }): void {
    let canvasData: Map<string, Cell> | undefined;
    if (cmd.cells) {
      canvasData = new Map<string, Cell>();
      for (const { key, cell } of cmd.cells) {
        canvasData.set(key, cell);
      }
    }
    useAnimationStore.getState().addFrame(cmd.atIndex, canvasData, cmd.duration);
  }

  private handleDeleteFrame(cmd: { index: number }): void {
    useAnimationStore.getState().removeFrame(cmd.index);
  }

  private handleGoToFrame(cmd: { index: number }): void {
    useAnimationStore.getState().goToFrame(cmd.index);
  }

  private handleSetFrameDuration(cmd: { index: number; duration: number }): void {
    useAnimationStore.getState().updateFrameDuration(cmd.index, cmd.duration);
  }

  private handleSetFrameData(cmd: { index: number; cells: Array<{ key: string; cell: Cell }> }): void {
    const data = new Map<string, Cell>();
    for (const { key, cell } of cmd.cells) {
      data.set(key, cell);
    }
    useAnimationStore.getState().setFrameData(cmd.index, data);
  }

  private handleUndo(): void {
    useHistoryStore.getState().undo();
  }

  private handleRedo(): void {
    useHistoryStore.getState().redo();
  }

  private handleNewProject(cmd: { width: number; height: number; backgroundColor?: string; name?: string }): void {
    // Reset canvas
    const canvasStore = useCanvasStore.getState();
    canvasStore.setCanvasSize(cmd.width, cmd.height);
    canvasStore.clearCanvas();
    if (cmd.backgroundColor) {
      canvasStore.setCanvasBackgroundColor(cmd.backgroundColor);
    }
    
    // Reset animation
    useAnimationStore.getState().resetAnimation();
    
    // Clear history
    useHistoryStore.getState().clear();
    
    // Clear selection
    useSelectionStore.getState().clearSelection();
  }

  private handleLoadProject(cmd: { sessionData: unknown }): void {
    // This would need to integrate with the session importer
    // For now, log a warning
    console.warn('[MCP] load_project command received, but session import is not yet implemented in MCP client');
    // TODO: Integrate with sessionImporter.ts
  }

  private handleSetForegroundColor(cmd: { color: string }): void {
    useToolStore.getState().setColor(cmd.color);
  }

  private handleSetBackgroundColor(cmd: { color: string }): void {
    useToolStore.getState().setBackgroundColor(cmd.color);
  }

  private handleSelectRectangle(cmd: { x: number; y: number; width: number; height: number }): void {
    const selectionStore = useSelectionStore.getState();
    selectionStore.startSelection(cmd.x, cmd.y);
    selectionStore.updateSelection(cmd.x + cmd.width - 1, cmd.y + cmd.height - 1);
    selectionStore.endSelection();
  }

  private handleClearSelection(): void {
    useSelectionStore.getState().clearSelection();
  }
}

// Singleton instance
let mcpClientInstance: MCPClient | null = null;

/**
 * Get or create the MCP client singleton
 */
export function createMCPClient(): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient();
  }
  return mcpClientInstance;
}
