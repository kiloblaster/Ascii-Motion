/**
 * Effects Store - Zustand store for managing effects system state
 * 
 * Features:
 * - Effects panel state (open/closed, active effect)
 * - Effect settings for all supported effects
 * - Canvas analysis caching for performance
 * - Timeline targeting toggle
 * - Integration with existing stores for apply/preview operations
 */

import { create } from 'zustand';
import type { 
  EffectType, 
  LevelsEffectSettings, 
  HueSaturationEffectSettings, 
  RemapColorsEffectSettings, 
  RemapCharactersEffectSettings,
  ScatterEffectSettings,
  CanvasAnalysis,
  LastAppliedEffect
} from '../types/effects';
import { 
  DEFAULT_LEVELS_SETTINGS,
  DEFAULT_HUE_SATURATION_SETTINGS,
  DEFAULT_REMAP_COLORS_SETTINGS,
  DEFAULT_REMAP_CHARACTERS_SETTINGS,
  DEFAULT_SCATTER_SETTINGS,
  CANVAS_ANALYSIS
} from '../constants/effectsDefaults';
import { useCanvasStore } from './canvasStore';
import { usePreviewStore } from './previewStore';
import { useSelectionStore } from './selectionStore';
import { processEffect } from '../utils/effectsProcessing';
import type { Cell } from '../types';

export interface EffectsState {
  // UI State
  isOpen: boolean;                           // Main effects panel visibility
  activeEffect: EffectType | null;           // Currently open effect panel
  applyToTimeline: boolean;                  // Timeline vs canvas targeting
  targetScope: 'active-layer' | 'all-layers'; // Which layers to target when applying to timeline
  
  // Effect Settings State
  levelsSettings: LevelsEffectSettings;
  hueSaturationSettings: HueSaturationEffectSettings;
  remapColorsSettings: RemapColorsEffectSettings;
  remapCharactersSettings: RemapCharactersEffectSettings;
  scatterSettings: ScatterEffectSettings;
  
  // Canvas Analysis State
  canvasAnalysis: CanvasAnalysis | null;     // Cached analysis results
  isAnalyzing: boolean;                      // Analysis in progress
  
  // Preview State
  isPreviewActive: boolean;                  // Live preview enabled
  previewEffect: EffectType | null;          // Effect being previewed
  
  // Last Applied Effect State
  lastAppliedEffect: LastAppliedEffect | null; // Last successfully applied effect
  
  // Error State
  lastError: string | null;                  // Last error message
  
  // Actions - Panel Management
  openEffectPanel: (effect: EffectType) => void;
  closeEffectPanel: () => void;
  setApplyToTimeline: (apply: boolean) => void;
  setTargetScope: (scope: 'active-layer' | 'all-layers') => void;
  
  // Actions - Effect Settings
  updateLevelsSettings: (settings: Partial<LevelsEffectSettings>) => void;
  updateHueSaturationSettings: (settings: Partial<HueSaturationEffectSettings>) => void;
  updateRemapColorsSettings: (settings: Partial<RemapColorsEffectSettings>) => void;
  updateRemapCharactersSettings: (settings: Partial<RemapCharactersEffectSettings>) => void;
  updateScatterSettings: (settings: Partial<ScatterEffectSettings>) => void;
  resetEffectSettings: (effect: EffectType) => void;
  
  // Actions - Canvas Analysis
  analyzeCanvas: () => Promise<void>;
  clearAnalysisCache: () => void;
  getUniqueColors: () => string[];
  getUniqueCharacters: () => string[];
  
  // Actions - Preview Management
  startPreview: (effect: EffectType) => void;
  stopPreview: () => void;
  updatePreview: () => Promise<void>;
  
  // Actions - Effect Application
  applyEffect: (effect: EffectType) => Promise<boolean>;
  setLastAppliedEffect: (effect: LastAppliedEffect) => void;
  
  // Actions - Error Management
  clearError: () => void;
  
  // Utility Actions
  reset: () => void;
}

// Canvas hash generation for cache invalidation
const generateCanvasHash = (cells: Map<string, Cell>, frameCount: number): string => {
  // Simple hash based on cell count, first few cells, and frame count
  const cellCount = cells.size;
  const firstCells = Array.from(cells.entries()).slice(0, 10);
  const hashData = `${cellCount}-${frameCount}-${JSON.stringify(firstCells)}`;
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashData.length; i++) {
    const char = hashData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

export const useEffectsStore = create<EffectsState>((set, get) => ({
  // Initial state
  isOpen: false,
  activeEffect: null,
  applyToTimeline: false,
  targetScope: 'active-layer' as const,
  
  // Default effect settings
  levelsSettings: { ...DEFAULT_LEVELS_SETTINGS },
  hueSaturationSettings: { ...DEFAULT_HUE_SATURATION_SETTINGS },
  remapColorsSettings: { ...DEFAULT_REMAP_COLORS_SETTINGS },
  remapCharactersSettings: { ...DEFAULT_REMAP_CHARACTERS_SETTINGS },
  scatterSettings: { ...DEFAULT_SCATTER_SETTINGS },
  
  // Analysis state
  canvasAnalysis: null,
  isAnalyzing: false,
  
  // Preview state
  isPreviewActive: false,
  previewEffect: null,
  
  // Last applied effect state
  lastAppliedEffect: null,
  
  // Error state
  lastError: null,
  
  // Panel Management Actions
  openEffectPanel: (effect: EffectType) => {
    set({ 
      isOpen: true, 
      activeEffect: effect 
    });
    
    // Analyze canvas when opening any effect
    get().analyzeCanvas();
  },
  
  closeEffectPanel: () => {
    // Stop any active preview when closing
    if (get().isPreviewActive) {
      get().stopPreview();
    }
    
    set({ 
      isOpen: false, 
      activeEffect: null 
    });
  },
  
  setApplyToTimeline: (apply: boolean) => {
    set({ applyToTimeline: apply });
    // Re-analyze canvas since available chars/colors depend on timeline scope
    get().clearAnalysisCache();
    get().analyzeCanvas();
  },
  
  setTargetScope: (scope: 'active-layer' | 'all-layers') => {
    set({ targetScope: scope });
    // Re-analyze canvas since available chars/colors depend on layer scope
    get().clearAnalysisCache();
    get().analyzeCanvas();
    // Refresh preview if it's currently active
    if (get().isPreviewActive) {
      get().updatePreview().catch(error => {
        console.error('Preview refresh on scope change failed:', error);
      });
    }
  },
  
  // Effect Settings Actions
  updateLevelsSettings: (settings: Partial<LevelsEffectSettings>) => {
    set(state => ({
      levelsSettings: { ...state.levelsSettings, ...settings }
    }));
  },
  
  updateHueSaturationSettings: (settings: Partial<HueSaturationEffectSettings>) => {
    set(state => ({
      hueSaturationSettings: { ...state.hueSaturationSettings, ...settings }
    }));
  },
  
  updateRemapColorsSettings: (settings: Partial<RemapColorsEffectSettings>) => {
    set(state => ({
      remapColorsSettings: { ...state.remapColorsSettings, ...settings }
    }));
  },
  
  updateRemapCharactersSettings: (settings: Partial<RemapCharactersEffectSettings>) => {
    set(state => ({
      remapCharactersSettings: { ...state.remapCharactersSettings, ...settings }
    }));
  },
  
  updateScatterSettings: (settings: Partial<ScatterEffectSettings>) => {
    set(state => ({
      scatterSettings: { ...state.scatterSettings, ...settings }
    }));
  },
  
  resetEffectSettings: (effect: EffectType) => {
    switch (effect) {
      case 'levels':
        set({ levelsSettings: { ...DEFAULT_LEVELS_SETTINGS } });
        break;
      case 'hue-saturation':
        set({ hueSaturationSettings: { ...DEFAULT_HUE_SATURATION_SETTINGS } });
        break;
      case 'remap-colors':
        set({ remapColorsSettings: { ...DEFAULT_REMAP_COLORS_SETTINGS } });
        break;
      case 'remap-characters':
        set({ remapCharactersSettings: { ...DEFAULT_REMAP_CHARACTERS_SETTINGS } });
        break;
      case 'scatter':
        set({ scatterSettings: { ...DEFAULT_SCATTER_SETTINGS } });
        break;
    }
  },
  
  // Canvas Analysis Actions
  analyzeCanvas: async () => {
    // Avoid concurrent analysis
    if (get().isAnalyzing) return;
    
    set({ isAnalyzing: true });
    
    try {
      // Import stores dynamically to avoid circular dependencies
      const { useCanvasStore } = await import('../stores/canvasStore');
      const { useAnimationStore } = await import('../stores/animationStore');
      
      const canvasStore = useCanvasStore.getState();
      const animationStore = useAnimationStore.getState();
      const { targetScope, applyToTimeline } = get();
      
      const { cells } = canvasStore;
      const { frames } = animationStore;
      
      // Generate hash for cache invalidation (include scope in hash)
      const canvasHash = generateCanvasHash(cells, frames.length) + `_${targetScope}_${applyToTimeline}`;
      
      // Check if analysis is still valid
      const currentAnalysis = get().canvasAnalysis;
      if (currentAnalysis && 
          currentAnalysis.canvasHash === canvasHash &&
          (Date.now() - currentAnalysis.analysisTimestamp) < CANVAS_ANALYSIS.CACHE_EXPIRY_MS) {
        set({ isAnalyzing: false });
        return;
      }
      
      // Analyze canvas for unique colors and characters
      const uniqueColors = new Set<string>();
      const uniqueCharacters = new Set<string>();
      const colorFrequency: Record<string, number> = {};
      const characterFrequency: Record<string, number> = {};
      
      // Helper to analyze a set of cells
      const analyzeCells = (cellMap: Map<string, import('../types').Cell>) => {
        cellMap.forEach(cell => {
          if (cell.color && cell.color !== 'transparent') {
            uniqueColors.add(cell.color);
            colorFrequency[cell.color] = (colorFrequency[cell.color] || 0) + 1;
          }
          if (cell.bgColor && cell.bgColor !== 'transparent') {
            uniqueColors.add(cell.bgColor);
            colorFrequency[cell.bgColor] = (colorFrequency[cell.bgColor] || 0) + 1;
          }
          if (cell.char && cell.char.trim()) {
            uniqueCharacters.add(cell.char);
            characterFrequency[cell.char] = (characterFrequency[cell.char] || 0) + 1;
          }
        });
      };
      
      if (targetScope === 'all-layers') {
        // All-layers scope: analyze all visible/unlocked layers
        const { useTimelineStore } = await import('./timelineStore');
        const { getContentFrameAtTime } = await import('../utils/layerCompositing');
        const tl = useTimelineStore.getState();
        const currentFrame = tl.view.currentFrame;
        const targetLayers = tl.layers.filter(l => l.visible && !l.locked);
        
        if (applyToTimeline) {
          // All frames on all target layers
          for (const layer of targetLayers) {
            for (const cf of layer.contentFrames) {
              // Use canvasStore cells for the active layer's current frame
              if (layer.id === tl.view.activeLayerId) {
                const activeCf = getContentFrameAtTime(layer, currentFrame);
                if (activeCf && cf.id === activeCf.id) {
                  analyzeCells(cells); // Use working copy
                  continue;
                }
              }
              analyzeCells(cf.data);
            }
          }
        } else {
          // Current frame only on all target layers
          for (const layer of targetLayers) {
            if (layer.id === tl.view.activeLayerId) {
              analyzeCells(cells); // Active layer uses working copy
            } else {
              const cf = getContentFrameAtTime(layer, currentFrame);
              if (cf) analyzeCells(cf.data);
            }
          }
        }
      } else {
        // Active-layer scope: analyze only active layer
        // Always analyze current canvas (active layer working copy)
        analyzeCells(cells);
        
        // If applying to timeline, also analyze all other frames on this layer
        if (applyToTimeline) {
          frames.forEach(frame => {
            analyzeCells(frame.data);
          });
        }
      }
      
      // Create analysis results
      const analysis: CanvasAnalysis = {
        // Basic unique values
        uniqueColors: Array.from(uniqueColors).slice(0, CANVAS_ANALYSIS.MAX_UNIQUE_ITEMS),
        uniqueCharacters: Array.from(uniqueCharacters).slice(0, CANVAS_ANALYSIS.MAX_UNIQUE_ITEMS),
        
        // Frequency data (original simple format)
        colorFrequency,
        characterFrequency,
        
        // Extended frequency data (sorted arrays) - add these for compatibility
        colorsByFrequency: Object.entries(colorFrequency)
          .map(([color, count]) => ({ color, count }))
          .sort((a, b) => b.count - a.count),
        charactersByFrequency: Object.entries(characterFrequency)
          .map(([char, count]) => ({ char, count }))
          .sort((a, b) => b.count - a.count),
        
        // Distribution data with percentages
        colorDistribution: Object.entries(colorFrequency)
          .map(([color, count]) => ({ 
            color, 
            count, 
            percentage: cells.size > 0 ? (count / cells.size) * 100 : 0 
          }))
          .sort((a, b) => b.count - a.count),
        characterDistribution: Object.entries(characterFrequency)
          .map(([char, count]) => ({ 
            char, 
            count, 
            percentage: cells.size > 0 ? (count / cells.size) * 100 : 0 
          }))
          .sort((a, b) => b.count - a.count),
        
        // Cross-reference mappings - simplified for now
        colorToCharMap: {},
        charToColorMap: {},
        
        // Canvas statistics
        totalCells: cells.size,
        filledCells: cells.size, // Simplified - all cells with data are filled
        fillPercentage: 100,
        
        // Color analysis - simplified for now
        colorBrightnessStats: {
          brightest: '',
          darkest: '',
          averageBrightness: 0,
          brightColors: [],
          darkColors: []
        },
        
        // Metadata
        canvasHash,
        frameCount: frames.length,
        analysisTimestamp: Date.now()
      };
      
      set({ 
        canvasAnalysis: analysis,
        isAnalyzing: false 
      });
      
    } catch (error) {
      console.error('Canvas analysis failed:', error);
      set({ isAnalyzing: false });
    }
  },
  
  clearAnalysisCache: () => {
    set({ canvasAnalysis: null });
  },
  
  getUniqueColors: () => {
    return get().canvasAnalysis?.uniqueColors || [];
  },
  
  getUniqueCharacters: () => {
    return get().canvasAnalysis?.uniqueCharacters || [];
  },
  
  // Preview Management Actions
  startPreview: (effect: EffectType) => {
    const { updatePreview } = get();
    set({ 
      isPreviewActive: true, 
      previewEffect: effect 
    });
    
    // Generate and show preview immediately
    updatePreview().catch(error => {
      console.error('Initial preview generation failed:', error);
    });
  },
  
  stopPreview: () => {
    set({ 
      isPreviewActive: false, 
      previewEffect: null 
    });
    
    // Clear preview from previewStore
    const previewStore = usePreviewStore.getState();
    previewStore.clearPreview();
  },
  
  // Generate and update preview
  updatePreview: async () => {
    const state = get();
    if (!state.isPreviewActive || !state.previewEffect) return;
    
    try {
      const canvasStore = useCanvasStore.getState();
      const previewStore = usePreviewStore.getState();
      
      // Get effect settings
      let effectSettings;
      switch (state.previewEffect) {
        case 'levels':
          effectSettings = state.levelsSettings;
          break;
        case 'hue-saturation':
          effectSettings = state.hueSaturationSettings;
          break;
        case 'remap-colors':
          effectSettings = state.remapColorsSettings;
          break;
        case 'remap-characters':
          effectSettings = state.remapCharactersSettings;
          break;
        case 'scatter':
          effectSettings = state.scatterSettings;
          break;
        default:
          return;
      }
      
      // Get canvas background color for blend operations
      const canvasBackgroundColor = canvasStore.canvasBackgroundColor;
      
      // Get selection mask if active (effects only apply within selection)
      const selectionState = useSelectionStore.getState();
      const selectionMask = selectionState.isActive ? selectionState.selectedCells : undefined;
      
      if (state.targetScope === 'all-layers') {
        // All-layers preview: process each visible/unlocked layer's current-frame cells,
        // then composite the full result so the user sees how the effect looks
        // across the entire composited stack.
        try {
          const { useTimelineStore } = await import('./timelineStore');
          const { compositeLayersAtFrame, getContentFrameAtTime } = await import('../utils/layerCompositing');
          const tl = useTimelineStore.getState();
          
          if (tl.layers.length === 0) {
            // No layers — fall through to single-canvas mode
            const result = await processEffect(state.previewEffect, canvasStore.cells, effectSettings, canvasBackgroundColor, { selectionMask });
            if (result.success && result.processedCells) {
              previewStore.setPreviewData(result.processedCells);
            }
            return;
          }
          
          const currentFrame = tl.view.currentFrame;
          const canvasWidth = canvasStore.width;
          const canvasHeight = canvasStore.height;
          
          // Build modified layers: for each visible/unlocked layer, process its current frame data
          const modifiedLayers = await Promise.all(tl.layers.map(async (layer) => {
            const isTarget = layer.visible && !layer.locked;
            if (!isTarget) return layer; // Keep non-target layers unchanged
            
            // Get the content frame at the current playhead
            const cf = getContentFrameAtTime(layer, currentFrame);
            if (!cf || cf.data.size === 0) return layer; // No content at this frame
            
            // Use canvasStore cells for the active layer (reflects in-progress edits)
            const cellsToProcess = (layer.id === tl.view.activeLayerId) ? canvasStore.cells : cf.data;
            
            // Process this layer's cells through the effect
            const result = await processEffect(state.previewEffect!, cellsToProcess, effectSettings, canvasBackgroundColor, { selectionMask });
            
            if (result.success && result.processedCells) {
              // Replace only the current content frame's data with processed cells
              return {
                ...layer,
                contentFrames: layer.contentFrames.map(f =>
                  f.id === cf.id ? { ...f, data: result.processedCells! } : f
                ),
              };
            }
            return layer;
          }));
          
          // Composite all layers with the modified data
          const compositedPreview = compositeLayersAtFrame(
            modifiedLayers as import('../types/timeline').Layer[],
            currentFrame,
            canvasWidth,
            canvasHeight,
            undefined,
            false,
            tl.layerGroups,
          );
          
          previewStore.setPreviewData(compositedPreview);
        } catch (err) {
          console.error('All-layers preview failed:', err);
          previewStore.clearPreview();
        }
      } else {
        // Active-layer preview: process current canvas cells (active layer's working copy)
        const currentCells = canvasStore.cells;
        
        const result = await processEffect(
          state.previewEffect,
          currentCells,
          effectSettings,
          canvasBackgroundColor,
          { selectionMask }
        );
        
        if (result.success && result.processedCells) {
          // For the preview to show correctly in the composited view,
          // we need to composite the full stack but with the active layer's
          // current frame replaced by the processed cells.
          try {
            const { useTimelineStore } = await import('./timelineStore');
            const { compositeLayersAtFrame, getContentFrameAtTime } = await import('../utils/layerCompositing');
            const tl = useTimelineStore.getState();
            
            if (tl.layers.length > 0) {
              const activeLayer = tl.layers.find(l => l.id === tl.view.activeLayerId);
              if (activeLayer) {
                const currentFrame = tl.view.currentFrame;
                const canvasWidth = canvasStore.width;
                const canvasHeight = canvasStore.height;
                const activeCf = getContentFrameAtTime(activeLayer, currentFrame);
                
                if (activeCf) {
                  // Build layers with the active layer's current frame replaced by processed cells
                  const modifiedLayers = tl.layers.map(layer => {
                    if (layer.id !== activeLayer.id) return layer;
                    return {
                      ...layer,
                      contentFrames: layer.contentFrames.map(cf =>
                        cf.id === activeCf.id ? { ...cf, data: result.processedCells! } : cf
                      ),
                    };
                  });
                  
                  const compositedPreview = compositeLayersAtFrame(
                    modifiedLayers as import('../types/timeline').Layer[],
                    currentFrame,
                    canvasWidth,
                    canvasHeight,
                    undefined,
                    false,
                    tl.layerGroups,
                  );
                  
                  previewStore.setPreviewData(compositedPreview);
                  return;
                }
              }
            }
          } catch {
            // Fall through to simple preview
          }
          
          // Fallback: transform to screen space and show just the active layer cells
          let previewCells = result.processedCells;
          try {
            const { transformCellMapToScreen } = await import('../utils/layerTransformUtils');
            previewCells = transformCellMapToScreen(previewCells);
          } catch {
            // Use local-space cells
          }
          previewStore.setPreviewData(previewCells);
        } else {
          console.error('Preview processing failed:', result);
          previewStore.clearPreview();
        }
      }
      
    } catch (error) {
      console.error('Preview generation error:', error);
      set({ lastError: error instanceof Error ? error.message : 'Preview generation failed' });
    }
  },
  
  // Effect Application Actions
  applyEffect: async (effect: EffectType): Promise<boolean> => {
    try {
      const state = get();
      
      // Clear any previous errors
      state.clearError();
      
      // Stop preview if active
      if (state.isPreviewActive) {
        state.stopPreview();
      }

      // Get effect settings
      const getEffectSettings = () => {
        switch (effect) {
          case 'levels':
            return state.levelsSettings;
          case 'hue-saturation':
            return state.hueSaturationSettings;
          case 'remap-colors':
            return state.remapColorsSettings;
          case 'remap-characters':
            return state.remapCharactersSettings;
          case 'scatter':
            return state.scatterSettings;
          default:
            throw new Error(`Unknown effect type: ${effect}`);
        }
      };

      const settings = getEffectSettings();

      // Import processing engine dynamically
      const { processEffect, processEffectOnFrames } = await import('../utils/effectsProcessing');

      if (state.applyToTimeline) {
        // Apply effect to content frames, scoped by targetScope
        const { useAnimationStore } = await import('./animationStore');
        const animationStore = useAnimationStore.getState();
        const { useTimelineStore } = await import('./timelineStore');
        const tl = useTimelineStore.getState();
        
        // Get canvas background color for blend operations
        const { useCanvasStore } = await import('./canvasStore');
        const canvasBackgroundColor = useCanvasStore.getState().canvasBackgroundColor;
        
        // Determine which layers to process based on scope
        const layersToProcess = state.targetScope === 'all-layers'
          ? tl.layers.filter(l => l.visible && !l.locked)
          : (() => {
              const activeLayer = tl.layers.find(l => l.id === tl.view.activeLayerId);
              return activeLayer ? [activeLayer] : [];
            })();
        
        if (layersToProcess.length === 0) {
          set({ lastError: state.targetScope === 'all-layers' ? 'No visible, unlocked layers' : 'No active layer' });
          return;
        }
        
        // Process each target layer
        for (const layer of layersToProcess) {
          // Build legacy frames from this layer's content frames
          const layerFrames = layer.contentFrames.map(cf => ({
            id: cf.id as unknown as import('../types').FrameId,
            name: cf.name,
            duration: Math.round(cf.durationFrames * (1000 / tl.config.frameRate)),
            data: cf.data,
          }));
          
          const result = await processEffectOnFrames(
            effect,
            layerFrames,
            settings,
            () => {},
            canvasBackgroundColor
          );

          if (result.errors.length > 0) {
            console.warn(`Effect processing had errors on layer "${layer.name}":`, result.errors);
          }

          // Write processed frames back to this layer's content frames
          for (let i = 0; i < result.processedFrames.length && i < layer.contentFrames.length; i++) {
            const processedFrame = result.processedFrames[i];
            const contentFrame = layer.contentFrames[i];
            tl.updateContentFrameData(layer.id, contentFrame.id, processedFrame.data);
          }
        }

        // Sync the canvas with the current frame's data
        const currentIdx = animationStore.currentFrameIndex;
        const currentData = animationStore.getFrameData(currentIdx);
        if (currentData) {
          const { useCanvasStore: cs } = await import('./canvasStore');
          cs.getState().setCanvasData(currentData);
        }

      } else {
        // Apply to current frame only
        const { useCanvasStore } = await import('./canvasStore');
        const canvasStore = useCanvasStore.getState();
        
        // Get selection mask if active (effects only apply within selection)
        const selectionState = useSelectionStore.getState();
        const selectionMask = selectionState.isActive ? selectionState.selectedCells : undefined;
        
        if (state.targetScope === 'all-layers') {
          // All-layers at current frame: process each visible/unlocked layer's
          // content frame that overlaps the playhead
          const { useTimelineStore } = await import('./timelineStore');
          const { getContentFrameAtTime } = await import('../utils/layerCompositing');
          const tl = useTimelineStore.getState();
          const currentFrame = tl.view.currentFrame;
          const canvasBackgroundColor = canvasStore.canvasBackgroundColor;
          
          const targetLayers = tl.layers.filter(l => l.visible && !l.locked);
          if (targetLayers.length === 0) {
            set({ lastError: 'No visible, unlocked layers' });
            return;
          }
          
          for (const layer of targetLayers) {
            const cf = getContentFrameAtTime(layer, currentFrame);
            if (!cf || cf.data.size === 0) continue;
            
            // Use canvasStore cells for the active layer (reflects in-progress edits)
            const cellsToProcess = (layer.id === tl.view.activeLayerId) ? canvasStore.cells : cf.data;
            
            const result = await processEffect(
              effect,
              cellsToProcess,
              settings,
              canvasBackgroundColor,
              { selectionMask }
            );
            
            if (result.success && result.processedCells) {
              tl.updateContentFrameData(layer.id, cf.id, result.processedCells);
              // If this is the active layer, also update the working canvas
              if (layer.id === tl.view.activeLayerId) {
                canvasStore.setCanvasData(result.processedCells);
              }
            }
          }
          
          // Re-sync canvas from the active layer (in case it wasn't a target)
          const { useAnimationStore: getAnim } = await import('./animationStore');
          const currentData = getAnim.getState().getFrameData(getAnim.getState().currentFrameIndex);
          if (currentData) {
            canvasStore.setCanvasData(currentData);
          }
        } else {
          // Active layer at current frame only (original behavior)
          const result = await processEffect(
            effect,
            canvasStore.cells,
            settings,
            canvasStore.canvasBackgroundColor,
            { selectionMask }
          );

          if (result.success && result.processedCells) {
            const { setCanvasData } = canvasStore;
            setCanvasData(result.processedCells);
          } else {
            throw new Error(result.error || 'Effect processing failed');
          }
        }
      }

      // Clear analysis cache since canvas changed
      state.clearAnalysisCache();
      
      // Close panel after successful application
      state.closeEffectPanel();
      
      return true;
    } catch (error) {
      console.error(`Failed to apply ${effect} effect:`, error);
      set(state => ({ ...state, lastError: `Failed to apply effect: ${error instanceof Error ? error.message : 'Unknown error'}` }));
      return false;
    }
  },
  
  // Set last applied effect (used after successful application)
  setLastAppliedEffect: (effect: LastAppliedEffect) => {
    set({ lastAppliedEffect: effect });
  },
  
  // Utility Actions
  clearError: () => {
    set({ lastError: null });
  },
  
  reset: () => {
    set({
      isOpen: false,
      activeEffect: null,
      applyToTimeline: false,
      targetScope: 'active-layer' as const,
      levelsSettings: { ...DEFAULT_LEVELS_SETTINGS },
      hueSaturationSettings: { ...DEFAULT_HUE_SATURATION_SETTINGS },
      remapColorsSettings: { ...DEFAULT_REMAP_COLORS_SETTINGS },
      remapCharactersSettings: { ...DEFAULT_REMAP_CHARACTERS_SETTINGS },
      canvasAnalysis: null,
      isAnalyzing: false,
      isPreviewActive: false,
      previewEffect: null,
      lastAppliedEffect: null,
      lastError: null
    });
  }
}));