import type { ExportDataBundle } from '../types/export';
import { useCanvasStore } from '../stores/canvasStore';
import { useAnimationStore } from '../stores/animationStore';
import { useToolStore } from '../stores/toolStore';
import { useCanvasContext } from '../contexts/CanvasContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePaletteStore } from '../stores/paletteStore';
import { VERSION, BUILD_DATE, BUILD_HASH } from '../constants/version';
import { useCharacterPaletteStore } from '../stores/characterPaletteStore';
import { useProjectMetadataStore } from '../stores/projectMetadataStore';
import { useTimelineStore } from '../stores/timelineStore';
import { compositeLayersAtFrame } from './layerCompositing';
import type { Frame } from '../types';
import type { FrameId } from '../types';

/**
 * Compute composited frames from all layers at each timeline frame.
 * Used for visual exports (image, video, HTML, text, JSON, code-gen).
 * 
 * Each frame composites all visible layers at that point in time,
 * applying transforms, visibility, and solo mode via layerCompositing.
 */
function computeCompositedFrames(
  width: number,
  height: number,
): Frame[] {
  const { layers, config } = useTimelineStore.getState();
  const frames: Frame[] = [];
  const frameDurationMs = 1000 / config.frameRate;

  for (let f = 0; f < config.durationFrames; f++) {
    const compositedCells = compositeLayersAtFrame(
      layers,
      f,
      width,
      height,
      undefined, // cellAspectRatio — use default
      true,      // clip to canvas bounds for export
    );

    frames.push({
      id: `composited-${f}` as FrameId,
      name: `Frame ${f + 1}`,
      duration: frameDurationMs,
      data: compositedCells,
    });
  }

  return frames;
}

/**
 * Collects all data needed for export operations
 * Gathers canvas data, animation frames, tool state, and UI settings
 */
export class ExportDataCollector {
  /**
   * Collect all export data from the current application state
   */
  static collect(): ExportDataBundle {
    // Get canvas data
    const canvasState = useCanvasStore.getState();
    const { 
      width, 
      height, 
      cells, 
      canvasBackgroundColor, 
      showGrid 
    } = canvasState;

    // Get animation data
    const animationState = useAnimationStore.getState();
    const {
      frames,
      currentFrameIndex,
      frameRate,
      looping
    } = animationState;

    // Get tool state
    const toolState = useToolStore.getState();
    const {
      activeTool,
      selectedColor,
      selectedBgColor,
      selectedChar,
      paintBucketContiguous,
      rectangleFilled
    } = toolState;

    const paletteStore = usePaletteStore.getState();
    const {
      customPalettes,
      activePaletteId,
      recentColors
    } = paletteStore;

    const characterPaletteStore = useCharacterPaletteStore.getState();
    const {
      customPalettes: customCharacterPalettes,
      activePalette,
      mappingMethod,
      invertDensity,
      characterSpacing
    } = characterPaletteStore;

    // Get project metadata
    const projectMetadataStore = useProjectMetadataStore.getState();
    const {
      projectName,
      projectDescription
    } = projectMetadataStore;

    // Check if we're in layer mode
    const timelineState = useTimelineStore.getState();
    const isLayerMode = timelineState.layers.length > 0;

    // Compute frames: layer-composited or legacy
    let exportFrames: Frame[];
    let exportFrameRate: number;
    let exportLooping: boolean;
    let exportCurrentFrameIndex: number;

    if (isLayerMode) {
      exportFrames = computeCompositedFrames(width, height);
      exportFrameRate = timelineState.config.frameRate;
      exportLooping = timelineState.view.looping;
      exportCurrentFrameIndex = Math.min(
        timelineState.view.currentFrame,
        Math.max(0, exportFrames.length - 1),
      );
    } else {
      exportFrames = frames.map(frame => ({
        ...frame,
        data: new Map(frame.data),
      }));
      exportFrameRate = frameRate;
      exportLooping = looping;
      exportCurrentFrameIndex = currentFrameIndex;
    }

    // Get UI context data (we'll need to pass this in since we can't use hooks here)
    // This will be handled by the calling component

    return {
      // Version metadata
      metadata: {
        version: VERSION,
        buildDate: BUILD_DATE,
        buildHash: BUILD_HASH,
        exportDate: new Date().toISOString(),
        projectName,
        projectDescription
      },
      
      // Animation data (composited from layers when in layer mode)
      frames: exportFrames,
      currentFrameIndex: exportCurrentFrameIndex,
      frameRate: exportFrameRate,
      looping: exportLooping,
      
      // Canvas data
      canvasData: new Map(cells), // Deep copy current canvas
      canvasDimensions: { width, height },
      canvasBackgroundColor,
      showGrid,
      
      // Typography & rendering (will be filled by calling component)
      fontMetrics: {
        characterWidth: 0,
        characterHeight: 0,
        aspectRatio: 0.6,
        fontSize: 16,
        fontFamily: 'monospace'
      },
      typography: {
        fontSize: 16,
        characterSpacing: 1.0,
        lineSpacing: 1.0,
        selectedFontId: 'auto'
      },
      
      // Tool state
      toolState: {
        activeTool,
        selectedColor,
        selectedBgColor,
        selectedCharacter: selectedChar,
        paintBucketContiguous,
        rectangleFilled
      },
      
      // UI state (will be filled by calling component)
      uiState: {
        zoom: 1.0,
        panOffset: { x: 0, y: 0 },
        theme: 'light'
      },

      // Palette state
      paletteState: {
        activePaletteId,
        customPalettes: customPalettes.map(palette => ({
          ...palette,
          colors: palette.colors.map(color => ({ ...color }))
        })),
        recentColors: [...recentColors]
      },

      // Character palette state
      characterPaletteState: {
        activePaletteId: activePalette?.id ?? 'minimal-ascii',
        customPalettes: customCharacterPalettes.map(palette => ({
          ...palette,
          characters: [...palette.characters]
        })),
        mappingMethod,
        invertDensity,
        characterSpacing
      },

      // Layer data for session exports (raw structure, not composited)
      sessionDataV2: isLayerMode ? timelineState.getSessionData() : undefined,
    };
  }
}

/**
 * Hook-based data collector that can access React context
 * Use this from React components to get complete export data
 */
export const useExportDataCollector = (): ExportDataBundle => {
  // Get canvas data
  const { 
    width, 
    height, 
    cells, 
    canvasBackgroundColor, 
    showGrid 
  } = useCanvasStore();

  // Get animation data
  const {
    frames,
    currentFrameIndex,
    frameRate,
    looping
  } = useAnimationStore();

  // Get tool state
  const {
    activeTool,
    selectedColor,
    selectedBgColor,
    selectedChar,
    paintBucketContiguous,
    rectangleFilled
  } = useToolStore();

  const customPalettes = usePaletteStore(state => state.customPalettes);
  const activePaletteId = usePaletteStore(state => state.activePaletteId);
  const recentColors = usePaletteStore(state => state.recentColors);

  const customCharacterPalettes = useCharacterPaletteStore(state => state.customPalettes);
  const activeCharacterPalette = useCharacterPaletteStore(state => state.activePalette);
  const characterMappingMethod = useCharacterPaletteStore(state => state.mappingMethod);
  const invertCharacterDensity = useCharacterPaletteStore(state => state.invertDensity);
  const characterSpacingSetting = useCharacterPaletteStore(state => state.characterSpacing);

  // Get project metadata
  const projectName = useProjectMetadataStore(state => state.projectName);
  const projectDescription = useProjectMetadataStore(state => state.projectDescription);

  // Check if we're in layer mode
  const timelineLayers = useTimelineStore(state => state.layers);
  const timelineConfig = useTimelineStore(state => state.config);
  const timelineView = useTimelineStore(state => state.view);
  const isLayerMode = timelineLayers.length > 0;

  // Compute frames: layer-composited or legacy
  let exportFrames: Frame[];
  let exportFrameRate: number;
  let exportLooping: boolean;
  let exportCurrentFrameIndex: number;

  if (isLayerMode) {
    exportFrames = computeCompositedFrames(width, height);
    exportFrameRate = timelineConfig.frameRate;
    exportLooping = timelineView.looping;
    exportCurrentFrameIndex = Math.min(
      timelineView.currentFrame,
      Math.max(0, exportFrames.length - 1),
    );
  } else {
    exportFrames = frames.map(frame => ({
      ...frame,
      data: new Map(frame.data),
    }));
    exportFrameRate = frameRate;
    exportLooping = looping;
    exportCurrentFrameIndex = currentFrameIndex;
  }

  // Get canvas context data
  const {
    zoom,
    panOffset,
    fontMetrics,
    fontSize,
    characterSpacing,
    lineSpacing,
    selectedFontId
  } = useCanvasContext();

  // Get theme context
  const { theme } = useTheme();

  return {
    // Top-level name and description (for convenience)
    name: projectName,
    description: projectDescription,
    
    // Version metadata
    metadata: {
      version: VERSION,
      buildDate: BUILD_DATE,
      buildHash: BUILD_HASH,
      exportDate: new Date().toISOString(),
      projectName,
      projectDescription
    },
    
    // Animation data (composited from layers when in layer mode)
    frames: exportFrames,
    currentFrameIndex: exportCurrentFrameIndex,
    frameRate: exportFrameRate,
    looping: exportLooping,
    
    // Canvas data
    canvasData: new Map(cells), // Deep copy current canvas
    canvasDimensions: { width, height },
    canvasBackgroundColor,
    showGrid,
    
    // Typography & rendering
    fontMetrics,
    typography: {
      fontSize,
      characterSpacing,
      lineSpacing,
      selectedFontId
    },
    
    // Tool state
    toolState: {
      activeTool,
      selectedColor,
      selectedBgColor,
      selectedCharacter: selectedChar,
      paintBucketContiguous,
      rectangleFilled
    },
    
    // UI state
    uiState: {
      zoom,
      panOffset,
      theme
    },

    paletteState: {
      activePaletteId,
      customPalettes: customPalettes.map(palette => ({
        ...palette,
        colors: palette.colors.map(color => ({ ...color }))
      })),
      recentColors: [...recentColors]
    },

    characterPaletteState: {
      activePaletteId: activeCharacterPalette?.id ?? 'minimal-ascii',
      customPalettes: customCharacterPalettes.map(palette => ({
        ...palette,
        characters: [...palette.characters]
      })),
      mappingMethod: characterMappingMethod,
      invertDensity: invertCharacterDensity,
      characterSpacing: characterSpacingSetting
    },

    // Layer data for session exports (raw structure, not composited)
    sessionDataV2: isLayerMode ? useTimelineStore.getState().getSessionData() : undefined,
  };
};

/**
 * Validate export data bundle to ensure all required data is present
 */
export const validateExportData = (data: ExportDataBundle): boolean => {
  try {
    // Check required fields
    if (!data.frames || data.frames.length === 0) {
      console.error('Export validation failed: No frames data');
      return false;
    }

    if (!data.canvasData) {
      console.error('Export validation failed: No canvas data');
      return false;
    }

    if (!data.canvasDimensions || data.canvasDimensions.width <= 0 || data.canvasDimensions.height <= 0) {
      console.error('Export validation failed: Invalid canvas dimensions');
      return false;
    }

    if (!data.fontMetrics) {
      console.error('Export validation failed: No font metrics');
      return false;
    }

    if (!data.toolState) {
      console.error('Export validation failed: No tool state');
      return false;
    }

    // Validate frame data
    for (const frame of data.frames) {
      if (!frame.id || !frame.name || typeof frame.duration !== 'number') {
        console.error('Export validation failed: Invalid frame data', frame);
        return false;
      }
      
      if (!(frame.data instanceof Map)) {
        console.error('Export validation failed: Frame data is not a Map', frame);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Export validation failed with error:', error);
    return false;
  }
};

/**
 * Get export filename based on format and current date
 */
export const generateExportFilename = (
  format: 'png' | 'mp4' | 'session',
  projectName?: string
): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const baseName = projectName || 'ascii-motion';
  
  const extensions = {
    png: 'png',
    mp4: 'mp4',
    session: 'asciimtn'
  };
  
  return `${baseName}-${timestamp}.${extensions[format]}`;
};