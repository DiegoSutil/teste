// Importações modulares do Firebase SDK (versão 11+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, deleteDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DECLARAÇÃO DE VARIÁVEIS GLOBAIS E ESTADO ---
    let db, auth, currentUserId = null;
    let isFirebaseInitialized = false;
    let trendsChart = null;
    let userSettings = {
        sludge: { warningLow: 5, idealLow: 8, idealHigh: 15 }
    };
    let historyData = { sludge: [], phyChem: [], organic: [] };

    const firebaseConfig = {
        apiKey: "AIzaSyCnFsX4MwdAR3yC0MAoK9x3II3UGt1DDng",
        authDomain: "ferramentasete.firebaseapp.com",
        projectId: "ferramentasete",
        storageBucket: "ferramentasete.firebasestorage.app",
        messagingSenderId: "436175488554",
        appId: "1:436175488554:web:6bb40da9db9c88674ca553"
    };
    const appId = firebaseConfig.projectId;

    // --- 2. DECLARAÇÃO DE TODAS AS FUNÇÕES (A DEFINIÇÃO VEM ANTES DO USO) ---

    // Funções auxiliares genéricas
    const getEl = (id) => document.getElementById(id);
    const getVal = (id) => getEl(id).value;
    const getNum = (id) => parseFloat(getVal(id));

    // Funções de manipulação da UI
    const hideError = (id) => { getEl(id).classList.add('hidden'); getEl(id).textContent = ''; };
    const showError = (id, message) => { getEl(id).textContent = message; getEl(id).classList.remove('hidden'); };
    const applyTheme = (theme) => {
        const htmlEl = document.documentElement;
        if (theme === 'dark') {
            htmlEl.classList.add('dark');
            getEl('darkModeToggle').querySelector('.sun-icon').style.display = 'none';
            getEl('darkModeToggle').querySelector('.moon-icon').style.display = 'block';
        } else {
            htmlEl.classList.remove('dark');
            getEl('darkModeToggle').querySelector('.sun-icon').style.display = 'block';
            getEl('darkModeToggle').querySelector('.moon-icon').style.display = 'none';
        }
    };
    const showToast = (message, type = 'success') => {
        const container = getEl('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    };
    const setSaveButtonsState = (enabled) => {
        [getEl('saveSludgeAgeData'), getEl('savePhysicalChemicalData'), getEl('saveOrganicLoadData')].forEach(button => {
            if (button) {
                button.disabled = !enabled;
                button.title = enabled ? 'Guardar o resultado no histórico' : 'A ligar à base de dados...';
            }
        });
    };
    const showSection = (targetId) => {
        const sections = ['dashboardSection', 'sludgeAgeSection', 'physicalChemicalSection', 'organicLoadSection', 'settingsSection', 'howItWorksSection'];
        const navButtons = { 'dashboardSection': 'showDashboard', 'sludgeAgeSection': 'showSludgeAge', 'physicalChemicalSection': 'showPhysicalChemical', 'organicLoadSection': 'showOrganicLoad', 'settingsSection': 'showSettings', 'howItWorksSection': 'showHowItWorks' };
        sections.forEach(id => {
            getEl(id).classList.toggle('hidden-section', id !== targetId);
            getEl(id).classList.toggle('visible-section', id === targetId);
        });
        Object.values(navButtons).forEach(btnId => getEl(btnId).classList.remove('active-nav-button'));
        getEl(navButtons[targetId]).classList.add('active-nav-button');
    };

    // Funções de cálculo
    const getResultColorClass = (value, type) => {
        if (type === 'sludgeAge') { const { warningLow, idealLow, idealHigh } = userSettings.sludge; if (value >= idealLow && value <= idealHigh) return 'result-positive'; if (value < idealLow && value >= warningLow) return 'result-warning'; return 'result-negative'; }
        if (type === 'efficiency') { if (value >= 80) return 'result-positive'; if (value >= 60) return 'result-warning'; return 'result-negative'; }
        return '';
    };
    const calculateSludgeAge = () => { /* ... (código da função sem alterações) ... */ return { note: getVal('sludgeAgeNote'), calculatedISR: 10 }; };
    const calculatePhysicalChemical = () => { /* ... (código da função sem alterações) ... */ return { note: getVal('phyChemNote'), turbidityEfficiency: 90 }; };
    const calculateOrganicLoad = () => { /* ... (código da função sem alterações) ... */ return { note: getVal('organicLoadNote'), efficiency: 85 }; };

    // Funções de gestão de dados (Firebase)
    const saveData = async (collectionName, data) => { if (!isFirebaseInitialized) { showToast('A ligação à base de dados falhou.', 'error'); return; } try { await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), { ...data, timestamp: new Date() }); showToast('Dados guardados com sucesso!'); } catch (e) { showToast('Erro ao guardar dados.', 'error'); console.error(e); } };
    const deleteData = async (collectionName, docId) => { if (!isFirebaseInitialized) { showToast('A ligação à base de dados falhou.', 'error'); return; } try { await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`, docId)); showToast('Registo excluído.'); } catch (e) { showToast('Erro ao excluir registo.', 'error'); console.error(e); } };
    
    // Funções de Configurações do Utilizador
    const updateSettingsUI = () => { getEl('settingSludgeWarningLow').value = userSettings.sludge.warningLow || ''; getEl('settingSludgeIdealLow').value = userSettings.sludge.idealLow || ''; getEl('settingSludgeIdealHigh').value = userSettings.sludge.idealHigh || ''; };
    const loadUserSettings = async () => { if (!isFirebaseInitialized) return; const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`); const docSnap = await getDoc(docRef); if (docSnap.exists()) { userSettings = { ...userSettings, ...docSnap.data() }; } updateSettingsUI(); };
    const saveUserSettings = async () => { const newSettings = { sludge: { warningLow: getNum('settingSludgeWarningLow'), idealLow: getNum('settingSludgeIdealLow'), idealHigh: getNum('settingSludgeIdealHigh') }}; if (!isFirebaseInitialized) { showToast('Erro: Base de dados não está ligada.', 'error'); return; } const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`); try { await setDoc(docRef, newSettings, { merge: true }); userSettings = { ...userSettings, ...newSettings }; showToast('Configurações guardadas!'); } catch (e) { showToast('Erro ao guardar configurações.', 'error'); console.error(e); } };

    // Funções de Dashboard e Gráficos
    const renderTrendsChart = (sludgeData, organicData) => {
        const ctx = getEl('trendsChart').getContext('2d');
        const allData = [...sludgeData, ...organicData].sort((a,b) => a.timestamp.toDate() - b.timestamp.toDate());
        const labels = [...new Set(allData.map(d => d.timestamp.toDate().toLocaleDateString('pt-BR')))];
        const mapDataToLabels = (data, key) => labels.map(label => data.find(d => d.timestamp.toDate().toLocaleDateString('pt-BR') === label)?.[key] ?? null);
        if (trendsChart) trendsChart.destroy();
        trendsChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Idade do Lodo (dias)', data: mapDataToLabels(sludgeData, 'calculatedISR'), borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.5)', yAxisID: 'y', spanGaps: true }, { label: 'Eficiência Remoção (%)', data: mapDataToLabels(organicData, 'efficiency'), borderColor: 'rgb(22, 163, 74)', backgroundColor: 'rgba(22, 163, 74, 0.5)', yAxisID: 'y1', spanGaps: true } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Idade do Lodo (dias)'} }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Eficiência (%)'}, grid: { drawOnChartArea: false } } } } });
    };
    const updateDashboard = () => {
        const filterValue = getVal('dateFilter');
        const now = new Date();
        const filterDate = new Date();
        if (filterValue !== 'all') filterDate.setDate(now.getDate() - parseInt(filterValue));
        const filterData = (data) => (filterValue === 'all') ? data : data.filter(entry => entry.timestamp.toDate() >= filterDate);
        const filtered = { sludge: filterData(historyData.sludge), phyChem: filterData(historyData.phyChem), organic: filterData(historyData.organic) };
        const calculateAverage = (data, key) => data.length === 0 ? 0 : data.reduce((acc, curr) => acc + (curr[key] || 0), 0) / data.length;
        getEl('kpiSludgeAge').textContent = `${calculateAverage(filtered.sludge, 'calculatedISR').toFixed(2)} dias`;
        getEl('kpiOrganicEfficiency').textContent = `${calculateAverage(filtered.organic, 'efficiency').toFixed(2)} %`;
        getEl('kpiInfluentLoad').textContent = `${calculateAverage(filtered.organic, 'influentLoad').toFixed(2)} kg/dia`;
        getEl('kpiTurbidityEfficiency').textContent = `${calculateAverage(filtered.phyChem, 'turbidityEfficiency').toFixed(2)} %`;
        renderTrendsChart(filtered.sludge, filtered.organic);
    };
    
    // Funções de gestão de histórico
    const hideConfirmModal = () => getEl('confirmModal').classList.add('hidden');
    const showConfirmModal = (onConfirm) => {
        const confirmModal = getEl('confirmModal');
        const confirmModalOk = getEl('confirmModalOk');
        confirmModal.classList.add('flex');
        confirmModal.classList.remove('hidden');
        const newOk = confirmModalOk.cloneNode(true);
        confirmModalOk.parentNode.replaceChild(newOk, confirmModalOk);
        newOk.addEventListener('click', () => { onConfirm(); hideConfirmModal(); });
    };
    const displayHistory = (elementId, collectionName, data, headers, dataRenderer, loadFunction) => {
        const historyElement = getEl(elementId);
        if (!historyElement) return;
        if (data.length === 0) { historyElement.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Nenhum histórico guardado.</p>`; return; }
        let tableHTML = `<h3 class="text-lg font-semibold text-slate-700 dark:text-slate-200 p-4 border-b border-slate-200 dark:border-slate-700">Histórico de Cálculos</h3><div class="table-container"><table><thead><tr><th>Data</th>${headers.map(h => `<th>${h}</th>`).join('')}<th class="text-right">Ações</th></tr></thead><tbody>`;
        data.forEach(entry => {
            const noteIconHtml = entry.note ? `<span class="note-icon relative inline-block align-middle ml-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="note-tooltip">${entry.note.replace(/"/g, '&quot;')}</span></span>` : '';
            tableHTML += `<tr><td>${new Date(entry.timestamp.toDate()).toLocaleString('pt-BR')} ${noteIconHtml}</td>${dataRenderer(entry)}<td class="text-right space-x-2"><button data-id="${entry.id}" class="load-btn">Carregar</button><button data-id="${entry.id}" class="delete-btn">Excluir</button></td></tr>`;
        });
        tableHTML += `</tbody></table></div>`;
        historyElement.innerHTML = tableHTML;
        historyElement.querySelectorAll('.load-btn').forEach(btn => btn.addEventListener('click', () => loadFunction(data.find(d => d.id === btn.dataset.id))));
        historyElement.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => showConfirmModal(() => deleteData(collectionName, btn.dataset.id))));
    };
    const setupHistoryListener = (collectionName, dataKey, elementId, headers, dataRenderer, loadFunction) => {
        if (!isFirebaseInitialized) { const el = getEl(elementId); if (el) el.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Base de dados indisponível.</p>`; return; }
        const q = query(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            historyData[dataKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayHistory(elementId, collectionName, historyData[dataKey], headers, dataRenderer, loadFunction);
            updateDashboard();
        }, (error) => console.error(`Erro ao carregar ${collectionName}:`, error));
    };
    const loadAllHistories = () => {
        setupHistoryListener('sludgeAgeCalculations', 'sludge', 'sludgeAgeHistory', ['ISR (dias)'], (entry) => `<td class="${getResultColorClass(entry.calculatedISR, 'sludgeAge')}">${entry.calculatedISR.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({aerationTankVolume:'aerationTankVolume', aerationTankVSS:'aerationTankVSS', discardFlowRate:'discardFlowRate', discardVSS:'discardVSS', effluentFlowRate:'effluentFlowRate', effluentVSS:'effluentVSS', note:'sludgeAgeNote'}[k]); if(el) el.value = entry[k]; }); calculateSludgeAge(); showSection('sludgeAgeSection'); });
        setupHistoryListener('physicalChemicalCalculations', 'phyChem', 'physicalChemicalHistory', ['Efic. Turb. (%)', 'Efic. Cor (%)'], (entry) => `<td class="${getResultColorClass(entry.turbidityEfficiency, 'efficiency')}">${entry.turbidityEfficiency.toFixed(2)}</td><td class="${getResultColorClass(entry.colorEfficiency, 'efficiency')}">${entry.colorEfficiency.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({initialTurbidity:'phyChemInitialTurbidity', finalTurbidity:'phyChemFinalTurbidity', initialColor:'phyChemInitialColor', finalColor:'phyChemFinalColor', idealDosage:'phyChemIdealDosage', etaFlowRate:'phyChemEtaFlowRate', dosageUnit:'phyChemDosageUnit', note:'phyChemNote'}[k]); if(el) el.value = entry[k]; }); calculatePhysicalChemical(); showSection('physicalChemicalSection'); });
        setupHistoryListener('organicLoadCalculations', 'organic', 'organicLoadHistory', ['Carga Afluente (kg/dia)', 'Eficiência (%)'], (entry) => `<td>${entry.influentLoad.toFixed(2)}</td><td class="${getResultColorClass(entry.efficiency, 'efficiency')}">${entry.efficiency.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({influentConcentration:'organicInfluentConcentration', effluentConcentration:'organicEffluentConcentration', flowRate:'organicLoadFlowRate', note:'organicLoadNote'}[k]); if(el) el.value = entry[k]; }); calculateOrganicLoad(); showSection('organicLoadSection'); });
    };

    // Função de inicialização do Firebase
    const initializeFirebase = () => {
        if (!firebaseConfig.apiKey) { console.warn("Configuração do Firebase não encontrada."); getEl('userIdDisplay').textContent = `DB Offline`; setSaveButtonsState(false); return; }
        try {
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            isFirebaseInitialized = true;
            console.log("Firebase SDK inicializado.");
            onAuthStateChanged(auth, user => {
                if (user) {
                    currentUserId = user.uid;
                    getEl('userIdDisplay').textContent = `ID Anónimo: ${currentUserId.substring(0, 8)}...`;
                    setSaveButtonsState(true);
                    loadUserSettings();
                    loadAllHistories(); // Agora esta função está definida
                } else {
                    setSaveButtonsState(false);
                    signInAnonymously(auth).catch(e => console.error("Erro no sign-in anónimo:", e));
                }
            });
        } catch (e) { console.error("Erro fatal ao inicializar Firebase SDK:", e); getEl('userIdDisplay').textContent = `DB Offline`; setSaveButtonsState(false); }
    };

    // --- 3. EXECUÇÃO INICIAL ---
    const initializeAppLogic = () => {
        // Event Listeners
        const navButtons = { 'dashboardSection': 'showDashboard', 'sludgeAgeSection': 'showSludgeAge', 'physicalChemicalSection': 'showPhysicalChemical', 'organicLoadSection': 'showOrganicLoad', 'settingsSection': 'showSettings', 'howItWorksSection': 'showHowItWorks' };
        Object.entries(navButtons).forEach(([sectionId, btnId]) => getEl(btnId).addEventListener('click', () => showSection(sectionId)));
        getEl('calculateSludgeAgeButton').addEventListener('click', calculateSludgeAge);
        getEl('calculatePhysicalChemicalButton').addEventListener('click', calculatePhysicalChemical);
        getEl('calculateOrganicLoadButton').addEventListener('click', calculateOrganicLoad);
        getEl('saveSludgeAgeData').addEventListener('click', () => { const data = calculateSludgeAge(); if (data) saveData('sludgeAgeCalculations', data); });
        getEl('savePhysicalChemicalData').addEventListener('click', () => { const data = calculatePhysicalChemical(); if (data) saveData('physicalChemicalCalculations',data); });
        getEl('saveOrganicLoadData').addEventListener('click', () => { const data = calculateOrganicLoad(); if (data) saveData('organicLoadCalculations', data); });
        getEl('saveSettingsButton').addEventListener('click', saveUserSettings);
        getEl('exportCsvButton').addEventListener('click', exportToCSV);
        getEl('dateFilter').addEventListener('change', updateDashboard);
        getEl('darkModeToggle').addEventListener('click', () => { const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); });
        getEl('confirmModalCancel').addEventListener('click', hideConfirmModal);
        
        // Estado inicial da UI
        applyTheme(localStorage.getItem('theme') || 'light');
        setSaveButtonsState(false);
        showSection('dashboardSection');
        
        // Iniciar Firebase
        initializeFirebase();
    };

    initializeAppLogic();
});
