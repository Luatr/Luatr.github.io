// ====================================================================
// ==================== ИГРОВОЙ РЕЖИМ ====================
// ====================================================================

function startGame() { 
    const m = getCurrentMap(); 
    if (!m.playerStartPos) { alert("Нет стартовой позиции! (🧍)"); return; } 
    isPlaying = true; isMessageShowing = false; isExecutingEvent = false; 
    document.getElementById('game-message-box').style.display = 'none'; 
    gameSwitches.forEach(sw => sw.state = false); 
    gameVariables.forEach(v => v.value = 0); 
    playerGridX = m.playerStartPos.x; playerGridY = m.playerStartPos.y; 
    playerVisualX = playerGridX * TILE_SIZE; playerVisualY = playerGridY * TILE_SIZE; 
    playerDir = 0; playerAnimFrame = 1; playerMoveStep = 0; isPlayerMoving = false; 
    gameEventStates = {}; 
    for (let key in m.eventsData) { 
        ensureEventPages(m.eventsData[key]); 
        const [x, y] = key.split(',').map(Number); 
        gameEventStates[key] = { gridX: x, gridY: y, visualX: x * TILE_SIZE, visualY: y * TILE_SIZE, isMoving: false, dir: 0, animFrame: 1, moveStep: 0, waitTimer: Math.random() * 120 + 60, localSwitches: {A: false, B: false, C: false, D: false} }; 
    } 
    document.getElementById('editor-view').style.display = 'none'; 
    document.getElementById('game-view').style.display = 'flex'; 
    resizeGameCanvas(); keysPressed = {}; gameLoop(); 
}

function stopGame() { 
    isPlaying = false; cancelAnimationFrame(gameLoopId); 
    document.getElementById('editor-view').style.display = 'flex'; 
    document.getElementById('game-view').style.display = 'none'; 
}

function resizeGameCanvas() { const c = document.getElementById('game-canvas-container'); gameCanvas.width = c.clientWidth; gameCanvas.height = c.clientHeight; }

function gameLoop() { if (!isPlaying) return; updatePlayer(); updateEvents(); drawGameFrame(); gameLoopId = requestAnimationFrame(gameLoop); }

function isTilePassable(gx, gy) { 
    const m = getCurrentMap(); 
    if (gx < 0 || gx >= m.width || gy < 0 || gy >= m.height) return false; 
    for(let layerIdx = 0; layerIdx < 5; layerIdx++) { 
        const tileStr = m.mapData[gy][gx][layerIdx]; 
        if (tileStr !== "0") { 
            const parts = tileStr.split('_'); const tsId = parseInt(parts[0].substring(1)); const tIdx = parseInt(parts[1]); 
            const ts = projectTilesets.find(t => t.id === tsId); 
            if (ts && ts.passability[tIdx] === 1) return false; 
        } 
    } 
    for (let key in m.eventsData) { 
        const ev = m.eventsData[key]; const p = getActivePage(ev, gameEventStates[key]); 
        if (p && p.passable === false) { const state = gameEventStates[key]; if (state && state.gridX === gx && state.gridY === gy) return false; } 
    } 
    return true; 
}

function updatePlayer() { 
    if (isMessageShowing || isExecutingEvent) return; 
    if (isPlayerMoving) { 
        playerVisualX += Math.sign((playerGridX * TILE_SIZE) - playerVisualX) * PLAYER_SPEED; 
        playerVisualY += Math.sign((playerGridY * TILE_SIZE) - playerVisualY) * PLAYER_SPEED; 
        playerMoveStep++; playerAnimFrame = Math.floor(playerMoveStep / 8) % 4; 
        if (playerVisualX === playerGridX * TILE_SIZE && playerVisualY === playerGridY * TILE_SIZE) { 
            isPlayerMoving = false; playerAnimFrame = 1; playerMoveStep = 0; 
            checkTouchEvents(playerGridX, playerGridY, 'player_touch'); 
        } return; 
    } 
    let dx = 0, dy = 0; 
    if (keysPressed['ArrowUp'] || keysPressed['w'] || keysPressed['ц']) dy = -1; 
    if (keysPressed['ArrowDown'] || keysPressed['s'] || keysPressed['ы']) dy = 1; 
    if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['ф']) dx = -1; 
    if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['в']) dx = 1; 
    if (dx === 0 && dy === 0) return; 
    if (dy === 1 && dx === 0) playerDir = 0; else if (dx === -1) playerDir = 1; else if (dx === 1) playerDir = 2; else if (dy === -1 && dx === 0) playerDir = 3; 
    let targetGX = playerGridX + dx; let targetGY = playerGridY + dy; let moved = false; 
    if (dx !== 0 && dy !== 0) { 
        let passableX = isTilePassable(playerGridX + dx, playerGridY); let passableY = isTilePassable(playerGridX, playerGridY + dy); let passableDiag = isTilePassable(targetGX, targetGY); 
        if (passableX && passableY && passableDiag) { playerGridX = targetGX; playerGridY = targetGY; moved = true; } 
        else if (passableX) { playerGridX += dx; moved = true; } else if (passableY) { playerGridY += dy; moved = true; } 
    } else { if (isTilePassable(targetGX, targetGY)) { playerGridX = targetGX; playerGridY = targetGY; moved = true; } } 
    if (moved) isPlayerMoving = true; 
}

function updateEvents() { 
    if (isMessageShowing || isExecutingEvent) return; 
    const m = getCurrentMap(); 
    for (let key in m.eventsData) { 
        const ev = m.eventsData[key]; const p = getActivePage(ev, gameEventStates[key]); 
        if (!p) continue; const state = gameEventStates[key]; 
        if (p.movement === 'random' && state) { 
            if (state.isMoving) { 
                state.visualX += Math.sign((state.gridX * TILE_SIZE) - state.visualX) * EVENT_SPEED; 
                state.visualY += Math.sign((state.gridY * TILE_SIZE) - state.visualY) * EVENT_SPEED; 
                state.moveStep++; state.animFrame = Math.floor(state.moveStep / 8) % 4; 
                if (state.visualX === state.gridX * TILE_SIZE && state.visualY === state.gridY * TILE_SIZE) { 
                    state.isMoving = false; state.animFrame = 1; state.moveStep = 0; 
                    if (state.gridX === playerGridX && state.gridY === playerGridY) { checkTouchEvents(state.gridX, state.gridY, 'event_touch'); } 
                } 
            } else { 
                state.waitTimer--; if (state.waitTimer <= 0) { 
                    state.waitTimer = Math.random() * 120 + 60; 
                    const dirs = [ {dx: 0, dy: -1, dir: 3}, {dx: 0, dy: 1, dir: 0}, {dx: -1, dy: 0, dir: 1}, {dx: 1, dy: 0, dir: 2} ]; 
                    const d = dirs[Math.floor(Math.random() * dirs.length)]; let nextGX = state.gridX + d.dx; let nextGY = state.gridY + d.dy; 
                    let blocked = !isTilePassable(nextGX, nextGY); if (!blocked && nextGX === playerGridX && nextGY === playerGridY) blocked = true; 
                    if (!blocked) { state.gridX = nextGX; state.gridY = nextGY; state.dir = d.dir; state.isMoving = true; } else { state.dir = d.dir; } 
                } 
            } 
        } 
    } 
}

function checkTouchEvents(gx, gy, triggerType) { 
    const m = getCurrentMap(); 
    for (let key in gameEventStates) { 
        const state = gameEventStates[key]; if (state.gridX === gx && state.gridY === gy) { 
            const ev = m.eventsData[key]; const p = getActivePage(ev, state); 
            if (p && p.trigger === triggerType && !isExecutingEvent) { triggerEvent(p, key); } 
        } 
    } 
}

function drawGameFrame() { 
    const m = getCurrentMap(); const ctx = gameCtx; 
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height); ctx.fillStyle = '#000'; ctx.fillRect(0,0, gameCanvas.width, gameCanvas.height); 
    const camX = gameCanvas.width / 2 - (playerVisualX + TILE_SIZE / 2), camY = gameCanvas.height / 2 - (playerVisualY + TILE_SIZE / 2); 
    ctx.save(); ctx.translate(camX, camY); 
    drawMapOnCanvas(ctx, m, true, false); 
    
    for (let key in m.eventsData) { const ev = m.eventsData[key]; const p = getActivePage(ev, gameEventStates[key]); if(!p || (p.priority || 0) !== 1) continue; const state = gameEventStates[key]; if(!state) continue; const char = projectCharacters.find(c => c.id === p.graphicCharId); drawCharacter(ctx, char, p.graphicCharIndex || 0, state.visualX, state.visualY, state.dir, state.animFrame); }
    const playerChar = projectCharacters.find(c => c.id === projectPlayer.graphicCharId); 
    const drawn = drawCharacter(ctx, playerChar, projectPlayer.graphicCharIndex || 0, playerVisualX, playerVisualY, playerDir, playerAnimFrame); 
    if (!drawn) { ctx.fillStyle = '#4CAF50'; ctx.fillRect(playerVisualX + 8, playerVisualY + 8, TILE_SIZE - 16, TILE_SIZE - 16); } 
    for (let key in m.eventsData) { const ev = m.eventsData[key]; const p = getActivePage(ev, gameEventStates[key]); if(!p || (p.priority || 0) !== 0) continue; const state = gameEventStates[key]; if(!state) continue; const char = projectCharacters.find(c => c.id === p.graphicCharId); drawCharacter(ctx, char, p.graphicCharIndex || 0, state.visualX, state.visualY, state.dir, state.animFrame); }
    
    drawMapOnCanvas(ctx, m, true, true); 
    for (let key in m.eventsData) { const ev = m.eventsData[key]; const p = getActivePage(ev, gameEventStates[key]); if(!p || (p.priority || 0) !== 2) continue; const state = gameEventStates[key]; if(!state) continue; const char = projectCharacters.find(c => c.id === p.graphicCharId); drawCharacter(ctx, char, p.graphicCharIndex || 0, state.visualX, state.visualY, state.dir, state.animFrame); }
    ctx.restore(); 
}

// ====================================================================
// ==================== ДИАЛОГИ И ВЫБОРЫ ====================
// ====================================================================

let resolveMessagePromise = null;
function showAsyncMessage(text, keepOpen = false) { return new Promise(resolve => { isMessageShowing = true; const b = document.getElementById('game-message-box'); const t = document.getElementById('game-message-text'); const c = document.getElementById('game-choice-container'); t.innerText = text; c.innerHTML = ''; b.style.display = 'flex'; if (keepOpen) { resolve(); } else { resolveMessagePromise = resolve; } }); }
function updateChoiceSelection() { const items = document.querySelectorAll('#game-choice-container .choice-item'); items.forEach((item, i) => { item.classList.toggle('selected', i === selectedChoiceIndex); }); }
function showAsyncChoice(choices, cancelType) { return new Promise(resolve => { isChoosing = true; currentChoices = choices.filter(c => c); choiceResolve = resolve; selectedChoiceIndex = 0; const c = document.getElementById('game-choice-container'); c.innerHTML = ''; currentChoices.forEach((ch, i) => { const btn = document.createElement('div'); btn.className = 'choice-item' + (i === selectedChoiceIndex ? ' selected' : ''); btn.innerText = ch; btn.onclick = () => { isChoosing = false; isMessageShowing = false; document.getElementById('game-message-box').style.display = 'none'; resolve(i); }; c.appendChild(btn); }); document.getElementById('game-message-box').style.display = 'flex'; }); }

async function gameAction() { 
    if (!isPlaying) return; if (isChoosing) return; 
    if (isMessageShowing) { isMessageShowing = false; document.getElementById('game-message-box').style.display = 'none'; if (resolveMessagePromise) { resolveMessagePromise(); resolveMessagePromise = null; } return; } 
    if (isExecutingEvent || isPlayerMoving) return; 
    const m = getCurrentMap(); 
    const dirMap = { 0: {x: 0, y: 1}, 1: {x: -1, y: 0}, 2: {x: 1, y: 0}, 3: {x: 0, y: -1} }; 
    let frontX = playerGridX + dirMap[playerDir].x; let frontY = playerGridY + dirMap[playerDir].y; 
    let activeEventKey = null; 
    for (let key in gameEventStates) { 
        const state = gameEventStates[key]; const ev = m.eventsData[key]; const p = getActivePage(ev, state); if(!p) continue; 
        if (state.gridX === frontX && state.gridY === frontY) { activeEventKey = key; break; } 
        if (p.passable !== false && state.gridX === playerGridX && state.gridY === playerGridY) { activeEventKey = key; break; } 
    } 
    if (activeEventKey && m.eventsData[activeEventKey]) { 
        const ev = m.eventsData[activeEventKey]; const p = getActivePage(ev, gameEventStates[activeEventKey]); if(!p) return; 
        const state = gameEventStates[activeEventKey]; const oppositeDirs = [3, 2, 1, 0]; if(state) state.dir = oppositeDirs[playerDir]; 
        await triggerEvent(p, activeEventKey); 
    } 
}

// ====================================================================
// ==================== ВЫПОЛНЕНИЕ КОМАНД ====================
// ====================================================================

function evaluateCondition(cond, localSwitches) { 
    if (cond.conditionType === 'switch') { const sw = gameSwitches.find(s => s.id === cond.switchId); return sw ? sw.state === cond.conditionValue : false; } 
    else if (cond.conditionType === 'local_switch') { return localSwitches ? localSwitches[cond.switch] === cond.conditionValue : false; } 
    else if (cond.conditionType === 'variable') { const v = gameVariables.find(x => x.id === cond.variableId); if (!v) return false; if (cond.conditionOp === '==') return v.value == cond.conditionVal; if (cond.conditionOp === '>') return v.value > cond.conditionVal; if (cond.conditionOp === '<') return v.value < cond.conditionVal; } 
    return false; 
}

async function triggerEvent(page, key) { isExecutingEvent = true; currentExecutingEventKey = key; await executeCommands(page.commands); isExecutingEvent = false; currentExecutingEventKey = null; }

async function executeCommands(commands) { 
    for (let i = 0; i < commands.length; i++) { 
        const cmd = commands[i]; if (!cmd) continue; 
        const ls = gameEventStates[currentExecutingEventKey] ? gameEventStates[currentExecutingEventKey].localSwitches : {}; 
        
        if (cmd.type === 'message') { 
            let nextCmd = commands[i+1]; if (nextCmd && nextCmd.type === 'choice') { await showAsyncMessage(cmd.text, true); } else { await showAsyncMessage(cmd.text, false); } 
        } else if (cmd.type === 'switch') { const sw = gameSwitches.find(s => s.id === cmd.switchId); if (sw) sw.state = cmd.value; } 
        else if (cmd.type === 'local_switch') { if (gameEventStates[currentExecutingEventKey]) gameEventStates[currentExecutingEventKey].localSwitches[cmd.switch] = cmd.value; } 
        else if (cmd.type === 'variable') { const v = gameVariables.find(x => x.id === cmd.variableId); if (v) { if (cmd.operation === 'set') v.value = cmd.operand; else if (cmd.operation === 'add') v.value += cmd.operand; else if (cmd.operation === 'sub') v.value -= cmd.operand; } } 
        else if (cmd.type === 'teleport') { 
            const targetMapIdx = maps.findIndex(m => m.mapId === cmd.mapId); 
            if(targetMapIdx !== -1) { 
                currentMapIndex = targetMapIdx; ensureLayerFormat(getCurrentMap()); 
                playerGridX = cmd.x; playerGridY = cmd.y; playerVisualX = playerGridX * TILE_SIZE; playerVisualY = playerGridY * TILE_SIZE; isPlayerMoving = false; 
                gameEventStates = {}; const m = getCurrentMap(); 
                for (let key in m.eventsData) { ensureEventPages(m.eventsData[key]); const [x, y] = key.split(',').map(Number); gameEventStates[key] = { gridX: x, gridY: y, visualX: x * TILE_SIZE, visualY: y * TILE_SIZE, isMoving: false, dir: 0, animFrame: 1, moveStep: 0, waitTimer: Math.random() * 120 + 60, localSwitches: {A: false, B: false, C: false, D: false} }; } 
                await new Promise(r => setTimeout(r, 100)); 
            } 
        } else if (cmd.type === 'if_start') { 
            const conditionMet = evaluateCondition(cmd, ls); let trueBlock = []; let falseBlock = []; let depth = 1; let inTrueBlock = true; 
            for (let j = i + 1; j < commands.length; j++) { const subCmd = commands[j]; if (subCmd && subCmd.type === 'if_start') depth++; else if (subCmd && subCmd.type === 'if_end') { depth--; if (depth === 0) { i = j; break; } } if (depth === 1 && subCmd && subCmd.type === 'else') { inTrueBlock = false; continue; } if (inTrueBlock) trueBlock.push(subCmd); else falseBlock.push(subCmd); } 
            if (conditionMet) { await executeCommands(trueBlock); } else { await executeCommands(falseBlock); } 
        } else if (cmd.type === 'choice') { 
            const chosenIndex = await showAsyncChoice(cmd.choices, cmd.cancelType); let branchStart = -1; let branchEnd = -1; let depth = 1; 
            for (let j = i + 1; j < commands.length; j++) { const sub = commands[j]; if (sub && sub.type === 'choice') depth++; else if (sub && sub.type === 'choice_end') { depth--; if (depth === 0) { branchEnd = j; break; } } else if (sub && sub.type === 'choice_branch' && depth === 1) { if (sub.branchIndex === chosenIndex) branchStart = j; else if (branchStart !== -1 && sub.branchIndex > chosenIndex) { branchEnd = j; break; } } } 
            if (branchStart !== -1 && branchEnd !== -1) { const block = commands.slice(branchStart + 1, branchEnd); await executeCommands(block); } 
            depth = 1; for (let j = i + 1; j < commands.length; j++) { const sub = commands[j]; if (sub && sub.type === 'choice') depth++; else if (sub && sub.type === 'choice_end') { depth--; if (depth === 0) { i = j; break; } } } 
        } 
    } 
}

// ====================================================================
// ==================== УПРАВЛЕНИЕ (КЛАВИАТУРА И ТАЧ) ====================
// ====================================================================

document.addEventListener('keydown', (e) => { 
    if (!isPlaying) return; 
    if (isChoosing) { 
        if (e.key === 'ArrowUp') { selectedChoiceIndex = (selectedChoiceIndex - 1 + currentChoices.length) % currentChoices.length; updateChoiceSelection(); e.preventDefault(); } 
        else if (e.key === 'ArrowDown') { selectedChoiceIndex = (selectedChoiceIndex + 1) % currentChoices.length; updateChoiceSelection(); e.preventDefault(); } 
        else if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'у') { if (choiceResolve) { isChoosing = false; isMessageShowing = false; document.getElementById('game-message-box').style.display = 'none'; choiceResolve(selectedChoiceIndex); choiceResolve = null; } } 
        return; 
    } 
    keysPressed[e.key] = true; if (e.key === ' ' || e.key === 'e' || e.key === 'у') gameAction(); if (e.key === 'Escape') stopGame(); 
});
document.addEventListener('keyup', (e) => { keysPressed[e.key] = false; });

function setupTouchControls() { 
    document.querySelectorAll('.dpad-btn').forEach(btn => { 
        const dir = btn.dataset.dir; const keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }; 
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); keysPressed[keyMap[dir]] = true; }); 
        btn.addEventListener('touchend', (e) => { e.preventDefault(); keysPressed[keyMap[dir]] = false; }); 
        btn.addEventListener('mousedown', (e) => { keysPressed[keyMap[dir]] = true; }); 
        btn.addEventListener('mouseup', (e) => { keysPressed[keyMap[dir]] = false; }); 
        btn.addEventListener('mouseleave', (e) => { keysPressed[keyMap[dir]] = false; }); 
    }); 
}

// Запуск движка
init();