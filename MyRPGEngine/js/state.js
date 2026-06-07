// js/state.js

export const TILE_SIZE = 48;
export const DEFAULT_RTP = { 
    tilesets: [ { id: 1, name: "Стандарт A", path: "img/tilesets/A.png", passability: {} }, { id: 2, name: "Стандарт B", path: "img/tilesets/B.png", passability: {} }, { id: 3, name: "Стандарт C", path: "img/tilesets/C.png", passability: {} } ], 
    characters: [ { id: 1, name: "Герой", path: "img/characters/Hero.png" } ],
    faces: [ { name: "Герой", path: "img/faces/Hero.png" } ]
};

export let projectTilesets = [];
export let projectCharacters = [];
export let projectPlayer = { name: "Герой", graphicCharId: 1, graphicCharIndex: 0, faceSrc: "", faceImg: null };
export let activeTilesetId = 1, selectedTileIndex = 0;
export let gameSwitches = [ { id: 1, name: "Переключатель 1", state: false } ];
export let gameVariables = [ { id: 1, name: "Золото", value: 0 } ];
export let currentMode = 'tile', isDrawing = false;
export let maps = [], currentMapIndex = 0, currentEditEventKey = null, activeLineIndex = 0;
export let isEditingCommand = false, editCommandIndex = -1;
export let currentEventPageIndex = 0;
export const PLAYER_SPEED = 4; export const EVENT_SPEED = 4;  
export let isPlaying = false, isMessageShowing = false, isExecutingEvent = false, keysPressed = {}, gameLoopId = null;
export let isPlayerMoving = false;
export let playerGridX = 0, playerGridY = 0, playerVisualX = 0, playerVisualY = 0, playerDir = 0, playerAnimFrame = 1, playerMoveStep = 0;
export let gameEventStates = {}, currentExecutingEventKey = null; 
export let isChoosing = false, selectedChoiceIndex = 0, currentChoices = [], choiceResolve = null;
export let isDraggingEvent = false, draggedEventKey = null, lastClickTime = 0, lastClickKey = "";

// Канвасы тоже делаем глобальными экспортируемыми
export const editorCanvas = document.getElementById('editor-canvas'); 
export const editorCtx = editorCanvas.getContext('2d');
export const gameCanvas = document.getElementById('game-canvas'); 
export const gameCtx = gameCanvas.getContext('2d');
export const paletteCanvas = document.getElementById('palette-canvas'); 
export const paletteCtx = paletteCanvas.getContext('2d');

// Функции-помощники для изменения переменных (обязательно для модулей!)
export function setCurrentMode(mode) { currentMode = mode; }
export function setDrawing(val) { isDrawing = val; }
export function setIsPlaying(val) { isPlaying = val; }
export function setPlayerMoving(val) { isPlayerMoving = val; }
export function setMessageShowing(val) { isMessageShowing = val; }
export function setExecutingEvent(val) { isExecutingEvent = val; }
export function setChoosing(val) { isChoosing = val; }
// И так далее для тех переменных, которые нужно будет менять из других модулей