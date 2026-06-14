// js/state.js

const TILE_SIZE = 48;
const PLAYER_SPEED = 4;
const EVENT_SPEED = 4;

const DEFAULT_RTP = { 
    tilesets: [ { id: 1, name: "Стандарт A", path: "img/tilesets/A.png", passability: {} }, { id: 2, name: "Стандарт B", path: "img/tilesets/B.png", passability: {} }, { id: 3, name: "Стандарт C", path: "img/tilesets/C.png", passability: {} } ], 
    characters: [ { id: 1, name: "Герой", path: "img/characters/Hero.png" } ],
    faces: [ { name: "Герой", path: "img/faces/Hero.png" } ]
};

// Единый объект состояния. Прикрепляем к window, чтобы видели другие файлы
const state = {
    projectTilesets: [],
    projectCharacters: [],
    projectPlayer: { name: "Герой", graphicCharId: 1, graphicCharIndex: 0, faceSrc: "", faceImg: null },
    activeTilesetId: 1,
    selectedTileIndex: 0,
    gameSwitches: [ { id: 1, name: "Переключатель 1", state: false } ],
    gameVariables: [ { id: 1, name: "Золото", value: 0 } ],
    currentMode: 'tile',
    isDrawing: false,
    maps: [],
    currentMapIndex: 0,
    currentEditEventKey: null,
    activeLineIndex: 0,
    isEditingCommand: false,
    editCommandIndex: -1,
    currentEventPageIndex: 0,
    isPlaying: false,
    isMessageShowing: false,
    isExecutingEvent: false,
    keysPressed: {},
    gameLoopId: null,
    isPlayerMoving: false,
    playerGridX: 0, playerGridY: 0, playerVisualX: 0, playerVisualY: 0, playerDir: 0, playerAnimFrame: 1, playerMoveStep: 0,
    gameEventStates: {},
    currentExecutingEventKey: null,
    isChoosing: false, selectedChoiceIndex: 0, currentChoices: [], choiceResolve: null,
    isDraggingEvent: false, draggedEventKey: null, lastClickTime: 0, lastClickKey: "",
    resolveMessagePromise: null
};

const editorCanvas = document.getElementById('editor-canvas'); 
const editorCtx = editorCanvas.getContext('2d');
const gameCanvas = document.getElementById('game-canvas'); 
const gameCtx = gameCanvas.getContext('2d');
const paletteCanvas = document.getElementById('palette-canvas'); 
const paletteCtx = paletteCanvas.getContext('2d');

function getCurrentMap() { return state.maps[state.currentMapIndex]; }

// Делаем всё глобальным!
window.TILE_SIZE = TILE_SIZE;
window.PLAYER_SPEED = PLAYER_SPEED;
window.EVENT_SPEED = EVENT_SPEED;
window.DEFAULT_RTP = DEFAULT_RTP;
window.state = state;
window.editorCanvas = editorCanvas;
window.editorCtx = editorCtx;
window.gameCanvas = gameCanvas;
window.gameCtx = gameCtx;
window.paletteCanvas = paletteCanvas;
window.paletteCtx = paletteCtx;
window.getCurrentMap = getCurrentMap;