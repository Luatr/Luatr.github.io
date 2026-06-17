const TILE_SIZE = 48;
const DEFAULT_RTP = { 
    tilesets: [ 
        { id: 1, name: "Тайлсет A", path: "img/tilesets/A.png", passability: {} }, 
        { id: 2, name: "Тайлсет B", path: "img/tilesets/B.png", passability: {} }, 
        { id: 3, name: "Тайлсет C", path: "img/tilesets/C.png", passability: {} }, 
        { id: 4, name: "Тайлсет D", path: "img/tilesets/D.png", passability: {} }, 
        { id: 5, name: "Тайлсет E", path: "img/tilesets/E.png", passability: {} }
    ], 
    characters: [ { id: 1, name: "Герой", path: "img/characters/Hero.png" } ],
    faces: [ { name: "Герой", path: "img/faces/Hero.png" } ]
};

let projectTilesets = [], projectCharacters = [];
let projectPlayer = { name: "Герой", graphicCharId: 1, graphicCharIndex: 0, faceSrc: "", faceImg: null };
let activeTilesetId = 1;
let gameSwitches = [ { id: 1, name: "Переключатель 1", state: false } ];
let gameVariables = [ { id: 1, name: "Золото", value: 0 } ];
let currentMode = 'tile', isDrawing = false;
let maps = [], currentMapIndex = 0, currentEditEventKey = null, activeLineIndex = 0;
let isEditingCommand = false, editCommandIndex = -1;
let currentEventPageIndex = 0;
const PLAYER_SPEED = 4; const EVENT_SPEED = 4;  
let isPlaying = false, isMessageShowing = false, isExecutingEvent = false, keysPressed = {}, gameLoopId = null;
let isPlayerMoving = false;
let playerGridX = 0, playerGridY = 0, playerVisualX = 0, playerVisualY = 0, playerDir = 0, playerAnimFrame = 1, playerMoveStep = 0;
let gameEventStates = {}, currentExecutingEventKey = null; 
let isChoosing = false, selectedChoiceIndex = 0, currentChoices = [], choiceResolve = null;
let isDraggingEvent = false, draggedEventKey = null, lastClickTime = 0, lastClickKey = "";
let isAdminMode = false; 
let teleportTargetX = 0, teleportTargetY = 0; 

let selectedArea = { x: 0, y: 0, w: 1, h: 1 }; 
let paletteCols = 1; 
let isDraggingPalette = false;
let paletteDragStart = { x: 0, y: 0 };
let isEraserActive = false;

let editorZoomLevels = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
let editorZoomIndex = 3;
let editorZoom = 1;
let editingMapIndex = -1;

const editorCanvas = document.getElementById('editor-canvas'); const editorCtx = editorCanvas.getContext('2d');
const gameCanvas = document.getElementById('game-canvas'); const gameCtx = gameCanvas.getContext('2d');
const paletteCanvas = document.getElementById('palette-canvas'); const paletteCtx = paletteCanvas.getContext('2d');
const teleportCanvas = document.getElementById('teleport-preview-canvas'); const teleportCtx = teleportCanvas.getContext('2d');

function loadRTP() { 
    return new Promise(async (resolve) => { 
        let promises = []; 
        DEFAULT_RTP.tilesets.forEach(defTs => { projectTilesets.push({ id: defTs.id, name: defTs.name, imageSrc: defTs.path, image: null, passability: defTs.passability, isDefault: true }); promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ts = projectTilesets.find(t => t.id === defTs.id); if(ts) ts.image = img; res(); }; img.onerror = () => res(); img.src = defTs.path; })); }); 
        DEFAULT_RTP.characters.forEach(defCh => { projectCharacters.push({ id: defCh.id, name: defCh.name, imageSrc: defCh.path, image: null, isDefault: true }); promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ch = projectCharacters.find(c => c.id === defCh.id); if(ch) ch.image = img; res(); }; img.onerror = () => res(); img.src = defCh.path; })); }); 
        if (DEFAULT_RTP.faces.length > 0) { const defFace = DEFAULT_RTP.faces[0]; projectPlayer.faceSrc = defFace.path; promises.push(new Promise(res => { const img = new Image(); img.onload = () => { projectPlayer.faceImg = img; res(); }; img.onerror = () => res(); img.src = defFace.path; })); } 
        await Promise.all(promises); 
        const savedDefaults = localStorage.getItem('rpgmaker_default_passability');
        if (savedDefaults) { try { const defaultPass = JSON.parse(savedDefaults); projectTilesets.forEach(ts => { if (defaultPass[ts.id]) { ts.passability = defaultPass[ts.id]; } }); } catch(e) {} }
        resolve(); 
    }); 
}

function ensureLayerFormat(m) { 
    for(let y=0; y<m.height; y++) {
        for(let x=0; x<m.width; x++) {
            if (typeof m.mapData[y][x] === 'string') { 
                let old = m.mapData[y][x]; 
                let arr = ["0", "0", "0", "0", "0"]; 
                if (old !== "0") { 
                    let tsId = parseInt(old.substring(1).split('_')[0]); 
                    if (tsId >= 1 && tsId <= 5) arr[tsId-1] = old; 
                    else arr[0] = old; 
                } 
                m.mapData[y][x] = arr; 
            } else if (m.mapData[y][x].length < 5) {
                while(m.mapData[y][x].length < 5) m.mapData[y][x].push("0");
            }
        }
    } 
}

function ensureEventPages(ev) { if (!ev.pages) { ev.pages = [{ conditionSwitchId: ev.conditionSwitchId !== undefined ? ev.conditionSwitchId : -1, conditionLocalSwitch: "None", graphicCharId: ev.graphicCharId !== undefined ? ev.graphicCharId : -1, graphicCharIndex: ev.graphicCharIndex !== undefined ? ev.graphicCharIndex : 0, movement: ev.movement || "fixed", passable: ev.passable !== undefined ? ev.passable : false, priority: ev.priority !== undefined ? ev.priority : 0, trigger: ev.trigger || "action", commands: ev.commands || [] }]; } delete ev.conditionSwitchId; delete ev.graphicCharId; delete ev.graphicCharIndex; delete ev.movement; delete ev.passable; delete ev.priority; delete ev.trigger; delete ev.commands; }

function createEmptyMap(w, h) { let d=[]; for(let y=0;y<h;y++){d[y]=[];for(let x=0;x<w;x++)d[y][x]=["0","0","0","0","0"];} return d; }
function getCurrentMap() { return maps[currentMapIndex]; }

function drawMapOnCanvas(ctx, m, isGame, drawOverhead) { for(let layerIdx = 0; layerIdx < 5; layerIdx++) { for(let y=0; y<m.height; y++) { for(let x=0; x<m.width; x++) { const tileStr = m.mapData[y][x][layerIdx]; if(tileStr !== "0") { const parts = tileStr.split('_'); const tsId = parseInt(parts[0].substring(1)); const tIdx = parseInt(parts[1]); const ts = projectTilesets.find(t => t.id === tsId); if(ts && ts.image) { const pass = ts.passability[tIdx] || 0; if (!drawOverhead && pass === 2) continue; if (drawOverhead && pass !== 2) continue; const imgW = ts.image.width / TILE_SIZE; const srcX = ((tIdx - 1) % imgW) * TILE_SIZE; const srcY = Math.floor((tIdx - 1) / imgW) * TILE_SIZE; try { ctx.drawImage(ts.image, srcX, srcY, TILE_SIZE, TILE_SIZE, x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE); } catch(e) {} } } }} } }
function drawCharacter(ctx, char, index, destX, destY, dir, frame) { if(!char || !char.image || char.image.width === 0) return false; const colsPerChar = 3; const rowsPerChar = 4; const charsPerRow = Math.floor(char.image.width / (TILE_SIZE * colsPerChar)) || 1; const charsPerCol = Math.floor(char.image.height / (TILE_SIZE * rowsPerChar)) || 1; if (charsPerRow === 0 || charsPerCol === 0) return false; index = index % (charsPerRow * charsPerCol); const baseCol = (index % charsPerRow) * colsPerChar; const baseRow = Math.floor(index / charsPerRow) * rowsPerChar; const actualFrame = [1, 0, 1, 2][frame % 4]; const srcX = (baseCol + actualFrame) * TILE_SIZE; const srcY = (baseRow + dir) * TILE_SIZE; if (srcX < 0 || srcY < 0 || srcX + TILE_SIZE > char.image.width || srcY + TILE_SIZE > char.image.height) return false; try { ctx.drawImage(char.image, srcX, srcY, TILE_SIZE, TILE_SIZE, destX, destY, TILE_SIZE, TILE_SIZE); return true; } catch(e) { return false; } }
function getActivePage(ev, state) { if (!ev.pages || ev.pages.length === 0) return null; for (let i = ev.pages.length - 1; i >= 0; i--) { const p = ev.pages[i]; let met = true; if (p.conditionSwitchId && p.conditionSwitchId !== -1) { const sw = gameSwitches.find(s => s.id === p.conditionSwitchId); if (!sw || !sw.state) met = false; } if (met && p.conditionLocalSwitch && p.conditionLocalSwitch !== "None") { if (!state || !state.localSwitches[p.conditionLocalSwitch]) met = false; } if (met) return p; } return null; }

async function init() { 
    await loadRTP(); 
    document.getElementById('loading-screen').style.display = 'none'; 
    let defaultMapData = createEmptyMap(17, 13); 
    for(let y=0; y<13; y++) for(let x=0; x<17; x++) defaultMapData[y][x][0] = "T1_1"; 
    for(let x=0; x<17; x++) { defaultMapData[0][x][0] = "T1_2"; defaultMapData[12][x][0] = "T1_2"; } 
    for(let y=0; y<13; y++) { defaultMapData[y][0][0] = "T1_2"; defaultMapData[y][16][0] = "T1_2"; } 
    maps.push({mapId: 'map_' + Date.now(), name: "MAP001", width: 17, height: 13, mapData: defaultMapData, eventsData: {}, playerStartPos: {x: 8, y: 8} }); 
    currentMapIndex = 0; 
    switchMap(0); 
    renderTilesetTabs(); 
    renderPalette();     
    setupTouchControls(); 
}