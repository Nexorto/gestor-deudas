// Inicialización de variables globales
let db;
let debtors = [];
let config = {
    penaltyDays: 30,
    penaltyAmount: 100
};
let currentDebtorId = null;

// Iniciar la aplicación cuando se carga la página
document.addEventListener('DOMContentLoaded', function() {
    initDB();
    setupEventListeners();
    checkDarkMode();
});

// Inicialización de la base de datos IndexedDB
function initDB() {
    const request = indexedDB.open('DebtManagerDB', 1);

    request.onerror = function(event) {
        console.error('Error al abrir la base de datos:', event.target.error);
        alert('Error al inicializar la base de datos. Por favor, intente de nuevo.');
    };

    request.onupgradeneeded = function(event) {
        const db = event.target.result;
        
        // Crear almacén para deudores
        if (!db.objectStoreNames.contains('debtors')) {
            const debtorsStore = db.createObjectStore('debtors', { keyPath: 'id' });
            debtorsStore.createIndex('name', 'name', { unique: false });
        }
        
        // Crear almacén para configuración
        if (!db.objectStoreNames.contains('config')) {
            db.createObjectStore('config', { keyPath: 'id' });
        }
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        loadConfig();
        loadDebtors();
        console.log('Base de datos inicializada correctamente');
    };
}

// Configurar escuchadores de eventos
function setupEventListeners() {
    // Botones principales
    document.getElementById('add-debtor-btn').addEventListener('click', addDebtor);
    document.getElementById('save-config-btn').addEventListener('click', saveConfig);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('export-simple-btn').addEventListener('click', exportSimpleList);
    document.getElementById('import-btn').addEventListener('click', function() {
        document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', importData);
    
    // Modales
    document.getElementById('confirm-delete').addEventListener('click', deleteDebtor);
    document.getElementById('cancel-delete').addEventListener('click', closeModals);
    document.getElementById('confirm-movement').addEventListener('click', addMovement);
    document.getElementById('cancel-movement').addEventListener('click', closeModals);
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });
    
    // Tema oscuro
    document.getElementById('theme-icon').addEventListener('click', toggleDarkMode);
}

// Alternar tema oscuro/claro
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    
    const isDarkMode = body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    
    const themeIcon = document.getElementById('theme-icon');
    themeIcon.className = isDarkMode ? 'fas fa-sun' : 'fas fa-moon';
}

// Verificar configuración de tema oscuro
function checkDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    const body = document.body;
    
    if (isDarkMode) {
        body.classList.add('dark-mode');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    } else {
        body.classList.remove('dark-mode');
        document.getElementById('theme-icon').className = 'fas fa-moon';
    }
}

// Cargar configuración desde IndexedDB
function loadConfig() {
    const transaction = db.transaction(['config'], 'readonly');
    const configStore = transaction.objectStore('config');
    const request = configStore.get('penaltyConfig');

    request.onsuccess = function(event) {
        if (event.target.result) {
            config = event.target.result;
            document.getElementById('penalty-days').value = config.penaltyDays;
            document.getElementById('penalty-amount').value = config.penaltyAmount;
        }
    };
}

// Guardar configuración en IndexedDB
function saveConfig() {
    const penaltyDays = parseInt(document.getElementById('penalty-days').value);
    const penaltyAmount = parseFloat(document.getElementById('penalty-amount').value);

    if (isNaN(penaltyDays) || isNaN(penaltyAmount) || penaltyDays < 1 || penaltyAmount < 0) {
        alert('Por favor, ingrese valores válidos para la configuración de penalización');
        return;
    }

    config = {
        id: 'penaltyConfig',
        penaltyDays,
        penaltyAmount
    };

    const transaction = db.transaction(['config'], 'readwrite');
    const configStore = transaction.objectStore('config');
    configStore.put(config);

    transaction.oncomplete = function() {
        alert('Configuración guardada correctamente');
        checkPenalties();
    };
}

// Cargar deudores desde IndexedDB
function loadDebtors() {
    const transaction = db.transaction(['debtors'], 'readonly');
    const debtorsStore = transaction.objectStore('debtors');
    const request = debtorsStore.getAll();

    request.onsuccess = function(event) {
        debtors = event.target.result;
        renderDebtors();
        updateTotals();
    };
}

// Renderizar lista de deudores
function renderDebtors() {
    const debtorsList = document.getElementById('debtors-list');
    debtorsList.innerHTML = '';

    if (debtors.length === 0) {
        debtorsList.innerHTML = '<p>No hay deudores registrados</p>';
        return;
    }

    debtors.forEach(debtor => {
        const debtorCard = document.createElement('div');
        debtorCard.className = 'debtor-card';

        // Verificar si debería estar penalizado
        const today = new Date();
        const startDate = new Date(debtor.currentDebt > 1 ? 
                                 (debtor.startDate || debtor.lastUpdate) : 
                                 today);
        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        const isPenalized = debtor.penaltyEnabled && debtor.currentDebt > 1 && daysSinceStart >= config.penaltyDays;

        debtorCard.innerHTML = `
            <div class="debtor-header">
                <div class="debtor-name">${debtor.name}</div>
                <div class="penalty-toggle">
                    <span>Penalización:</span>
                    <label class="switch">
                        <input type="checkbox" ${debtor.penaltyEnabled ? 'checked' : ''} 
                               onchange="togglePenalty('${debtor.id}')">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="debtor-info">
                <div class="debtor-detail">
                    <div>Deuda actual: <strong>${debtor.currentDebt.toFixed(2)}</strong></div>
                    <div>Deuda histórica: ${debtor.historicDebt.toFixed(2)}</div>
                </div>
                <div class="debtor-detail">
                    <div>Última actualización: ${formatDate(new Date(debtor.lastUpdate))}</div>
                    <div class="${isPenalized ? 'penalized' : ''}">
                        ${isPenalized ? `Penalizaciones: ${debtor.totalPenalty.toFixed(2)}` : 'Sin penalizar'}
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="action-btn" onclick="showMovementModal('${debtor.id}', '${debtor.name}')">
                    <i class="fas fa-dollar-sign"></i> Agregar Movimiento
                </button>
                <button class="action-btn info" onclick="showHistory('${debtor.id}')">
                    <i class="fas fa-history"></i> Ver Historial
                </button>
                <button class="action-btn danger" onclick="showDeleteModal('${debtor.id}', '${debtor.name}')">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        `;

        debtorsList.appendChild(debtorCard);
    });
}

// Actualizar totales
function updateTotals() {
    const totalDebt = debtors.reduce((sum, debtor) => sum + debtor.currentDebt, 0);
    const totalHistoric = debtors.reduce((sum, debtor) => sum + debtor.historicDebt, 0);
    const totalPenalties = debtors.reduce((sum, debtor) => sum + debtor.totalPenalty, 0);
    
    document.getElementById('total-debt').textContent = totalDebt.toFixed(2);
    document.getElementById('total-historic').textContent = totalHistoric.toFixed(2);
    document.getElementById('total-penalties').textContent = totalPenalties.toFixed(2);
}

// Generar ID único
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Formatear fecha
function formatDate(date) {
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

// Cerrar todos los modales
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    currentDebtorId = null;
}

// Agregar nuevo deudor
function addDebtor() {
    const nameInput = document.getElementById('debtor-name');
    const debtInput = document.getElementById('initial-debt');
    
    const name = nameInput.value.trim();
    const initialDebt = parseFloat(debtInput.value);
    
    if (name === '') {
        alert('Por favor, ingrese un nombre');
        return;
    }
    
    if (isNaN(initialDebt) || initialDebt < 0) {
        alert('Por favor, ingrese una deuda inicial válida');
        return;
    }

    const today = new Date();
    const newDebtor = {
        id: generateId(),
        name,
        currentDebt: initialDebt,
        historicDebt: initialDebt,
        startDate: today,
        lastUpdate: today,
        lastPenaltyCheck: today,
        totalPenalty: 0,
        penaltyEnabled: true,
        history: [
            {
                date: today,
                amount: initialDebt,
                type: 'initial',
                balance: initialDebt
            }
        ]
    };

    const transaction = db.transaction(['debtors'], 'readwrite');
    const debtorsStore = transaction.objectStore('debtors');
    const request = debtorsStore.add(newDebtor);

    request.onsuccess = function() {
        debtors.push(newDebtor);
        renderDebtors();
        updateTotals();
        
        nameInput.value = '';
        debtInput.value = '';
        
        alert(`Deudor "${name}" agregado correctamente`);
    };
}

// Mostrar modal de confirmación para eliminar deudor
function showDeleteModal(id, name) {
    document.getElementById('delete-name').textContent = name;
    currentDebtorId = id;
    
    const modal = document.getElementById('delete-modal');
    modal.style.display = 'flex';
}

// Eliminar deudor
function deleteDebtor() {
    const transaction = db.transaction(['debtors'], 'readwrite');
    const debtorsStore = transaction.objectStore('debtors');
    const request = debtorsStore.delete(currentDebtorId);

    request.onsuccess = function() {
        debtors = debtors.filter(debtor => debtor.id !== currentDebtorId);
        renderDebtors();
        updateTotals();
        
        closeModals();
        alert('Deudor eliminado correctamente');
    };
}

// Mostrar modal para agregar movimiento
function showMovementModal(id, name) {
    document.getElementById('movement-name').textContent = name;
    currentDebtorId = id;
    
    const modal = document.getElementById('movement-modal');
    modal.style.display = 'flex';
    document.getElementById('movement-amount').value = '';
    document.getElementById('movement-amount').focus();
}

// Agregar movimiento a un deudor
function addMovement() {
    const amountInput = document.getElementById('movement-amount');
    const amount = parseFloat(amountInput.value);
    
    if (isNaN(amount) || amount === 0) {
        alert('Por favor, ingrese un monto válido');
        return;
    }
    
    const debtorIndex = debtors.findIndex(debtor => debtor.id === currentDebtorId);
    if (debtorIndex === -1) return;
    
    const debtor = debtors[debtorIndex];
    const today = new Date();
    const newBalance = debtor.currentDebt + amount;
    
    if (newBalance < 0) {
        alert('La deuda no puede ser negativa');
        return;
    }

    // Crear objeto de movimiento
    const movement = {
        date: today,
        amount: amount,
        type: amount > 0 ? 'increment' : 'payment',
        balance: newBalance
    };

    // Actualizar deudor
    debtor.currentDebt = newBalance;
    if (amount > 0) {
        debtor.historicDebt += amount;
    }
    debtor.lastUpdate = today;
    debtor.history.push(movement);

    // Guardar en la base de datos
    const transaction = db.transaction(['debtors'], 'readwrite');
    const debtorsStore = transaction.objectStore('debtors');
    const request = debtorsStore.put(debtor);

    request.onsuccess = function() {
        renderDebtors();
        updateTotals();
        closeModals();
        alert('Movimiento agregado correctamente');
    };
}

// Mostrar historial de un deudor
function showHistory(id) {
    const debtor = debtors.find(d => d.id === id);
    if (!debtor) return;
    
    document.getElementById('history-name').textContent = debtor.name;
    
    const historyContent = document.getElementById('history-content');
    historyContent.innerHTML = '';
    
    debtor.history.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const date = new Date(item.date);
        const formattedDate = `${date.getDate()}/${date.getMonth()+1}/${date.getFullYear()}`;
        
        let typeText = '';
        switch(item.type) {
            case 'initial': typeText = 'Deuda inicial'; break;
            case 'increment': typeText = 'Incremento'; break;
            case 'payment': typeText = 'Pago'; break;
            case 'penalty': typeText = 'Penalización'; break;
            default: typeText = 'Movimiento';
        }
        
        historyItem.innerHTML = `
            <div>
                <div>${formattedDate}</div>
                <div>${typeText}</div>
            </div>
            <div>
                <div class="${item.amount >= 0 ? 'text-danger' : 'text-success'}">
                    ${item.amount >= 0 ? '+' : ''}${item.amount}
                </div>
                <div>Balance: ${item.balance}</div>
            </div>
        `;
        
        historyContent.appendChild(historyItem);
    });
    
    const modal = document.getElementById('history-modal');
    modal.style.display = 'flex';
}

// Cambiar estado de penalización para un deudor
function togglePenalty(id) {
    const debtorIndex = debtors.findIndex(debtor => debtor.id === id);
    if (debtorIndex === -1) return;
    
    const debtor = debtors[debtorIndex];
    debtor.penaltyEnabled = !debtor.penaltyEnabled;
    
    const transaction = db.transaction(['debtors'], 'readwrite');
    const debtorsStore = transaction.objectStore('debtors');
    const request = debtorsStore.put(debtor);

    request.onsuccess = function() {
        renderDebtors();
    };
}

// Verificar penalizaciones
function checkPenalties() {
    const today = new Date();
    
    debtors.forEach(debtor => {
        if (!debtor.penaltyEnabled || debtor.currentDebt <= 0) return;
        
        const startDate = new Date(debtor.currentDebt > 1 ? 
                                 (debtor.startDate || debtor.lastUpdate) : 
                                 today);
        
        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceStart >= config.penaltyDays) {
            // Calcular días desde la última verificación
            const lastCheck = new Date(debtor.lastPenaltyCheck || startDate);
            const daysSinceLastCheck = Math.floor((today - lastCheck) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastCheck >= 1) {  // Verificar al menos una vez al día
                // Aplicar penalización
                const penaltyAmount = config.penaltyAmount;
                debtor.currentDebt += penaltyAmount;
                debtor.historicDebt += penaltyAmount;
                debtor.totalPenalty += penaltyAmount;
                debtor.lastPenaltyCheck = today;
                
                // Registrar en el historial
                debtor.history.push({
                    date: today,
                    amount: penaltyAmount,
                    type: 'penalty',
                    balance: debtor.currentDebt
                });
                
                // Actualizar en la base de datos
                const transaction = db.transaction(['debtors'], 'readwrite');
                const debtorsStore = transaction.objectStore('debtors');
                debtorsStore.put(debtor);
            }
        }
    });
    
    renderDebtors();
    updateTotals();
}

// Exportar datos completos
function exportData() {
    const dataToExport = {
        debtors: debtors,
        config: config
    };
    
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `deudas_${formatDate(new Date())}.json`;
    link.click();
}

// Exportar lista simple
function exportSimpleList() {
    let simpleList = 'Nombre:Deuda\n';
    
    debtors.forEach(debtor => {
        simpleList += `${debtor.name}: ${debtor.currentDebt}\n`;
    });
    
    const dataBlob = new Blob([simpleList], { type: 'text/plain' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `deudas_simple_${formatDate(new Date())}.txt`;
    link.click();
}

// Importar datos
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!importedData.debtors || !Array.isArray(importedData.debtors)) {
                throw new Error('Formato de archivo inválido');
            }
            
            // Importar configuración
            if (importedData.config) {
                importedData.config.id = 'main'; // asignar ID
            
                const configTx = db.transaction(['config'], 'readwrite');
                const configStore = configTx.objectStore('config');
                configStore.put(importedData.config);
                config = importedData.config;
            
                document.getElementById('penalty-days').value = config.penaltyDays;
                document.getElementById('penalty-amount').value = config.penaltyAmount;
            }
            
            // Importar deudores
            const transaction = db.transaction(['debtors'], 'readwrite');
            const debtorsStore = transaction.objectStore('debtors');
            
            // Limpiar almacén actual
            const clearRequest = debtorsStore.clear();
            
            clearRequest.onsuccess = function() {
                // Agregar deudores importados
                importedData.debtors.forEach(debtor => {
                    debtorsStore.add(debtor);
                });
                
                transaction.oncomplete = function() {
                    // Recargar datos
                    debtors = importedData.debtors;
                    renderDebtors();
                    updateTotals();
                    alert('Datos importados correctamente');
                };
            };
        } catch (error) {
            console.error('Error al importar datos:', error);
            alert('Error al importar datos: ' + error.message);
        }
        
        // Limpiar input de archivo
        event.target.value = '';
    };
    
    reader.readAsText(file);
}
// Verificar penalizaciones automáticamente cada día
setInterval(checkPenalties, 24 * 60 * 60 * 1000);
// También verificar al inicio
setTimeout(checkPenalties, 2000); // Pequeño retraso para asegurar carga de datos
