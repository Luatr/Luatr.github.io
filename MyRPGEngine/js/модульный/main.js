// js/main.js

async function loadRTP() { 
    return new Promise(async (resolve) => { 
        let promises = []; 
        DEFAULT_RTP.tilesets.forEach(defTs => { 
            state.projectTilesets.push({ id: defTs.id, name: defTs.name, imageSrc: defTs.path, image: null, passability: defTs.passability, isDefault: true }); 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ts = state.projectTilesets.find(t => t.id === defTs.id); if(ts) ts.image = img; res(); }; img.onerror = () => res(); img.src = defTs.path; })); 
        }); 
        DEFAULT_RTP.characters.forEach(defCh => { 
            state.projectCharacters.push({ id: defCh.id, name: defCh.name, imageSrc: defCh.path, image: null, isDefault: true }); 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { const ch = state.projectCharacters.find(c => c.id === defCh.id); if(ch) ch.image = img; res(); }; img.onerror = () => res(); img.src = defCh.path; })); 
        }); 
        if (DEFAULT_RTP.faces.length > 0) { 
            const defFace = DEFAULT_RTP.faces[0]; 
            state.projectPlayer.faceSrc = defFace.path; 
            promises.push(new Promise(res => { const img = new Image(); img.onload = () => { state.projectPlayer.faceImg = img; res(); }; img.onerror = () => res(); img.src = defFace.path; })); 
        } 
        await Promise.all(promises); resolve(); 
    }); 
}

async function init() { 
    await loadRTP(); 
    document.getElementById('loading-screen').style.display = 'none'; 
    let defaultMapData = createEmptyMap(17, 13); 
    for(let y=0; y<13; y++) for(let x=0; x<17; x++) defaultMapData[y][x][0] = "T1_1"; 
    for(let x=0; x<17; x++) { defaultMapData[0][x][0] = "T1_2"; defaultMapData[12][x][0] = "T1_2"; } 
    for(let y=0; y<13; y++) { defaultMapData[y][0][0] = "T1_2"; defaultMapData[y][16][0] = "T1_2"; } 
    state.maps.push({mapId: 'map_' + Date.now(), name: "MAP001", width: 17, height: 13, mapData: defaultMapData, eventsData: {}, playerStartPos: {x: 8, y: 8} }); 
    state.currentMapIndex = 0; 
    switchMap(0);
    setupTouchControls(); 
}

// Делаем функции глобальными, чтобы HTML кнопки (onclick) их видели
window.setMode = setMode;
window.applyMapSize = applyMapSize;
window.openDatabase = openDatabase;
window.saveProject = saveProject;
window.loadProject = loadProject;
window.closeTopModal = closeTopModal;
window.closeEventModal = closeEventModal;
window.deleteCurrentEvent = deleteCurrentEvent;
window.updateEventGraphic = updateEventGraphic;
window.openCreateMapModal = openCreateMapModal;
window.closeCreateMapModal = closeCreateMapModal;
window.createNewMap = createNewMap;
window.closeDatabase = closeDatabase;
window.switchDbTab = switchDbTab;
window.updatePlayerGraphicDb = updatePlayerGraphicDb;
window.handleFaceImport = handleFaceImport;
window.cycleTilePass = cycleTilePass;
window.addNewTileset = addNewTileset;
window.handleTilesetImport = handleTilesetImport;
window.addNewCharacter = addNewCharacter;
window.handleCharImport = handleCharImport;
window.renameSwitch = renameSwitch;
window.addNewSwitch = addNewSwitch;
window.renameVariable = renameVariable;
window.addNewVariable = addNewVariable;

window.startGame = startGame;
window.stopGame = stopGame;
window.gameAction = gameAction;

window.closeAddCmdModal = closeAddCmdModal;
window.showMessageInput = showMessageInput;
window.showSwitchInput = showSwitchInput;
window.showLocalSwitchInput = showLocalSwitchInput;
window.showVariableInput = showVariableInput;
window.showIfInput = showIfInput;
window.showChoiceInput = showChoiceInput;
window.showTeleportInput = showTeleportInput;
window.toggleIfUI = toggleIfUI;
window.saveMessageCommand = saveMessageCommand;
window.saveSwitchCommand = saveSwitchCommand;
window.saveLocalSwitchCommand = saveLocalSwitchCommand;
window.saveVariableCommand = saveVariableCommand;
window.saveIfCommand = saveIfCommand;
window.saveChoiceCommand = saveChoiceCommand;
window.saveTeleportCommand = saveTeleportCommand;
window.deleteEditingCommand = deleteEditingCommand;

// Запуск приложения
init();