// js/editor.js
import { TILE_SIZE, maps, projectTilesets, projectCharacters, currentMapIndex, editorCanvas, editorCtx, paletteCanvas, paletteCtx } from './state.js';

export function ensureLayerFormat(m) { /* весь код функции */ }
export function ensureEventPages(ev) { /* весь код функции */ }
export function createEmptyMap(w, h) { /* весь код функции */ }
export function getCurrentMap() { return maps[currentMapIndex]; }

export function renderEditorMap() { /* весь код рендера редактора */ }
export function renderPalette() { /* весь код палитры */ }
export function renderMapList() { /* весь код списка карт */ }

// Все функции, начинающиеся с handleMapInteraction, handlePointerDown и т.д.
// Все функции модалок событий: openEventModal, closeEventModal, updateEventGraphic...