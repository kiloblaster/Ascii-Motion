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
import { useProjectMetadataStore } from '../stores/projectMetadataStore';
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
          
          // Send current state to MCP server so it knows what's in the browser
          // Small delay to ensure connection is fully established
          setTimeout(() => {
            console.log('[MCP] Sending initial state snapshot');
            this.sendStateSnapshot();
          }, 100);
          
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
   * Send a state snapshot to the server (includes full frame data for sync)
   */
  sendStateSnapshot(): void {
    if (!this.isConnected()) return;
    
    const canvas = useCanvasStore.getState();
    const animation = useAnimationStore.getState();
    const projectMeta = useProjectMetadataStore.getState();
    
    // Convert frames to serializable format with full cell data
    const frames = animation.frames.map(frame => {
      const data: Record<string, { char: string; color: string; bgColor: string }> = {};
      frame.data.forEach((cell, key) => {
        data[key] = { char: cell.char, color: cell.color, bgColor: cell.bgColor };
      });
      return {
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        data,
      };
    });
    
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
        frameRate: animation.frameRate,
        frames,
      },
      project: {
        name: projectMeta.name,
      }
    };
    
    console.log('[MCP] Sending full state snapshot with', frames.length, 'frames');
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
      const message = JSON.parse(data);
      
      // Handle JSON-RPC style notifications from MCP server
      if (message.jsonrpc === '2.0' && message.method) {
        this.handleNotification(message.method, message.params);
        return;
      }
      
      // Handle legacy message format
      const legacyMessage = message as MCPServerMessage;
      
      switch (legacyMessage.type) {
        case 'auth_result':
          if (!legacyMessage.success) {
            console.error('[MCP] Auth failed:', legacyMessage.error);
            useMCPStore.getState().setError(legacyMessage.error || 'Authentication failed');
            this.disconnect();
          }
          break;
          
        case 'command':
          if (legacyMessage.command) {
            this.executeCommand(legacyMessage.command);
            useMCPStore.getState().incrementCommandCount();
          }
          break;
          
        case 'state_request':
          this.sendStateSnapshot();
          break;
          
        case 'error':
          console.error('[MCP] Server error:', legacyMessage.error);
          break;
      }
    } catch (error) {
      console.error('[MCP] Failed to parse message:', error);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    console.log('[MCP] Received notification:', method, params);
    
    if (method === 'notifications/connected') {
      console.log('[MCP] Connected to server');
      return;
    }
    
    if (method === 'notifications/stateChanged') {
      const { type, data } = params as { type: string; data: unknown };
      this.handleStateChange(type, data);
      useMCPStore.getState().incrementCommandCount();
    }
  }

  private handleStateChange(type: string, data: unknown): void {
    console.log('[MCP] State change:', type, data);
    
    switch (type) {
      case 'new_project': {
        const projectData = data as { width: number; height: number; name: string; backgroundColor?: string };
        this.handleNewProject({
          width: projectData.width,
          height: projectData.height,
          name: projectData.name,
          backgroundColor: projectData.backgroundColor
        });
        break;
      }
      
      case 'set_cell': {
        const cellData = data as { x: number; y: number; cell: Cell };
        this.handleSetCell(cellData);
        break;
      }
      
      case 'resize_canvas': {
        const resizeData = data as { width: number; height: number };
        this.handleResizeCanvas(resizeData);
        break;
      }
      
      case 'set_cells_batch': {
        const batchData = data as { cells: Array<{ x: number; y: number; cell: Cell }> };
        this.handleSetCellsBatch({ cells: batchData.cells });
        break;
      }
      
      case 'clear_cell': {
        const clearData = data as { x: number; y: number };
        this.handleClearCell(clearData);
        break;
      }
      
      case 'fill_region': {
        // Fill region modifies many cells - request a full state refresh
        // For now, log it; a full sync would require the MCP server to send all cell data
        console.log('[MCP] Fill region completed, cells filled:', (data as { cellsFilled: number }).cellsFilled);
        break;
      }
      
      case 'clear_canvas': {
        // Clear all cells on the current frame
        useCanvasStore.getState().clearCanvas();
        break;
      }
      
      case 'add_frame': {
        // Add a new frame
        useAnimationStore.getState().addFrame();
        break;
      }
      
      case 'delete_frame': {
        const deleteData = data as { index: number; totalFrames: number };
        useAnimationStore.getState().removeFrame(deleteData.index);
        break;
      }
      
      case 'duplicate_frame':
      case 'copy_frame_and_modify': {
        // These create new frames with data - trigger a full frame sync
        // For now, just add a frame and the data will be synced on next interaction
        const copyData = data as { newFrame: { index: number; id: string; name: string; duration: number; data?: Record<string, Cell> }; totalFrames: number };
        // Add frame at the correct position
        useAnimationStore.getState().addFrame(copyData.newFrame.index);
        // Set the frame duration
        useAnimationStore.getState().updateFrameDuration(copyData.newFrame.index, copyData.newFrame.duration);
        // If data is provided, set it
        if (copyData.newFrame.data) {
          const cellMap = new Map<string, Cell>();
          for (const [key, cell] of Object.entries(copyData.newFrame.data)) {
            cellMap.set(key, cell);
          }
          useAnimationStore.getState().setFrameData(copyData.newFrame.index, cellMap);
        }
        break;
      }
      
      case 'go_to_frame': {
        const goToData = data as { index: number };
        useAnimationStore.getState().goToFrame(goToData.index);
        break;
      }
      
      case 'set_frame_duration': {
        const durationData = data as { index: number; duration: number };
        useAnimationStore.getState().updateFrameDuration(durationData.index, durationData.duration);
        break;
      }
      
      case 'set_frame_name': {
        // Frame names are currently not stored in the animation store
        // Just log for now
        console.log('[MCP] Frame name set:', data);
        break;
      }
      
      case 'set_foreground_color': {
        const colorData = data as { color: string };
        useToolStore.getState().setSelectedColor(colorData.color);
        break;
      }
      
      case 'set_background_color': {
        const colorData = data as { color: string };
        useToolStore.getState().setSelectedBgColor(colorData.color);
        break;
      }
      
      case 'set_selected_character': {
        const charData = data as { character: string };
        useToolStore.getState().setSelectedChar(charData.character);
        break;
      }
      
      default:
        console.log('[MCP] Unhandled state change type:', type);
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
    useToolStore.getState().undo();
  }

  private handleRedo(): void {
    useToolStore.getState().redo();
  }

  private handleNewProject(cmd: { width: number; height: number; backgroundColor?: string; name?: string }): void {
    // Reset canvas
    const canvasStore = useCanvasStore.getState();
    canvasStore.setCanvasSize(cmd.width, cmd.height);
    canvasStore.clearCanvas();
    if (cmd.backgroundColor) {
      canvasStore.setCanvasBackgroundColor(cmd.backgroundColor);
    }
    
    // Set project name
    if (cmd.name) {
      useProjectMetadataStore.getState().setProjectName(cmd.name);
    }
    
    // Reset animation
    useAnimationStore.getState().resetAnimation();
    
    // Clear history
    useToolStore.getState().clearHistory();
    
    // Clear selection
    useSelectionStore.getState().clearSelection();
  }

  private handleLoadProject(_cmd: { sessionData: unknown }): void {
    // This would need to integrate with the session importer
    // For now, log a warning
    console.warn('[MCP] load_project command received, but session import is not yet implemented in MCP client');
    // TODO: Integrate with sessionImporter.ts
  }

  private handleSetForegroundColor(cmd: { color: string }): void {
    useToolStore.getState().setSelectedColor(cmd.color);
  }

  private handleSetBackgroundColor(cmd: { color: string }): void {
    useToolStore.getState().setSelectedBgColor(cmd.color);
  }

  private handleSelectRectangle(cmd: { x: number; y: number; width: number; height: number }): void {
    // Build a Set of cell keys for the rectangle
    const cells = new Set<string>();
    for (let y = cmd.y; y < cmd.y + cmd.height; y++) {
      for (let x = cmd.x; x < cmd.x + cmd.width; x++) {
        cells.add(`${x},${y}`);
      }
    }
    useSelectionStore.getState().setSelection(cells);
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
