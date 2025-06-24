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

    // --- 2. DEFINIÇÃO DE TODAS AS FUNÇÕES ---

    // Funções auxiliares genéricas
    function getEl(id) { return document.getElementById(id); }
    function getVal(id) { return getEl(id).value; }
    function getNum(id) { return parseFloat(getVal(id)); }

    // Funções de manipulação da UI
    function hideError(id) { getEl(id).classList.add('hidden'); getEl(id).textContent = ''; }
    function showError(id, message) { getEl(id).textContent = message; getEl(id).classList.remove('hidden'); }
    function applyTheme(theme) {
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
    }
    function showToast(message, type = 'success') {
        const container = getEl('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }
    function setSaveButtonsState(enabled) {
        [getEl('saveSludgeAgeData'), getEl('savePhysicalChemicalData'), getEl('saveOrganicLoadData')].forEach(button => {
            if (button) {
                button.disabled = !enabled;
                button.title = enabled ? 'Guardar o resultado no histórico' : 'A ligar à base de dados...';
            }
        });
    }
    function showSection(targetId) {
        const sections = ['dashboardSection', 'sludgeAgeSection', 'physicalChemicalSection', 'organicLoadSection', 'settingsSection', 'howItWorksSection'];
        const navButtons = { 'dashboardSection': 'showDashboard', 'sludgeAgeSection': 'showSludgeAge', 'physicalChemicalSection': 'showPhysicalChemical', 'organicLoadSection': 'showOrganicLoad', 'settingsSection': 'showSettings', 'howItWorksSection': 'showHowItWorks' };
        sections.forEach(id => {
            getEl(id).classList.toggle('hidden-section', id !== targetId);
            getEl(id).classList.toggle('visible-section', id === targetId);
        });
        Object.values(navButtons).forEach(btnId => getEl(btnId).classList.remove('active-nav-button'));
        getEl(navButtons[targetId]).classList.add('active-nav-button');
    }

    // Funções de cálculo
    function getResultColorClass(value, type) {
        if (type === 'sludgeAge') { const { warningLow, idealLow, idealHigh } = userSettings.sludge; if (value >= idealLow && value <= idealHigh) return 'result-positive'; if (value < idealLow && value >= warningLow) return 'result-warning'; return 'result-negative'; }
        if (type === 'efficiency') { if (value >= 80) return 'result-positive'; if (value >= 60) return 'result-warning'; return 'result-negative'; }
        return '';
    }
    function calculateSludgeAge() {
        hideError('sludgeAgeErrorDisplay');
        const inputs = { aerationTankVolume: getNum('aerationTankVolume'), aerationTankVSS: getNum('aerationTankVSS'), discardFlowRate: getNum('discardFlowRate'), discardVSS: getNum('discardVSS'), effluentFlowRate: getNum('effluentFlowRate'), effluentVSS: getNum('effluentVSS') };
        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) { showError('sludgeAgeErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos válidos.'); return null; }
        const massInTank = inputs.aerationTankVolume * 1000 * inputs.aerationTankVSS;
        const massDiscarded = inputs.discardFlowRate * 1440 * inputs.discardVSS;
        const massInEffluent = inputs.effluentFlowRate * 1000 * inputs.effluentVSS;
        const denominator = massDiscarded + massInEffluent;
        if (denominator === 0) { showError('sludgeAgeErrorDisplay', 'A soma das massas de SSV removidas é zero.'); return null; }
        const calculatedISR = massInTank / denominator;
        const resultSpan = getEl('sludgeAgeResult');
        resultSpan.textContent = `${calculatedISR.toFixed(2)} dias`;
        resultSpan.className = `text-2xl font-bold ${getResultColorClass(calculatedISR, 'sludgeAge')}`;
        getEl('sludgeAgeResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('sludgeAgeNote'), calculatedISR };
    }
    function calculatePhysicalChemical() {
        hideError('phyChemErrorDisplay');
        const inputs = { initialTurbidity: getNum('phyChemInitialTurbidity'), finalTurbidity: getNum('phyChemFinalTurbidity'), initialColor: getNum('phyChemInitialColor'), finalColor: getNum('phyChemFinalColor'), idealDosage: getNum('phyChemIdealDosage'), etaFlowRate: getNum('phyChemEtaFlowRate'), dosageUnit: getVal('phyChemDosageUnit') };
        if (Object.values(inputs).slice(0, 6).some(isNaN) || Object.values(inputs).some(v => v < 0)) { showError('phyChemErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.'); return null; }
        const turbidityEfficiency = inputs.initialTurbidity > 0 ? ((inputs.initialTurbidity - inputs.finalTurbidity) / inputs.initialTurbidity) * 100 : (inputs.finalTurbidity === 0 ? 100 : 0);
        const colorEfficiency = inputs.initialColor > 0 ? ((inputs.initialColor - inputs.finalColor) / inputs.initialColor) * 100 : (inputs.finalColor === 0 ? 100 : 0);
        const dailyDosage = inputs.dosageUnit === 'mg/L' ? (inputs.idealDosage * inputs.etaFlowRate) / 1000 : inputs.idealDosage * inputs.etaFlowRate;
        const dailyDosageUnit = inputs.dosageUnit === 'mg/L' ? 'kg/dia' : 'L/dia';
        getEl('phyChemTurbidityEfficiency').textContent = `${turbidityEfficiency.toFixed(2)} %`;
        getEl('phyChemColorEfficiency').textContent = `${colorEfficiency.toFixed(2)} %`;
        getEl('phyChemDailyDosage').textContent = `${dailyDosage.toFixed(2)} ${dailyDosageUnit}`;
        getEl('phyChemResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('phyChemNote'), turbidityEfficiency, colorEfficiency, dailyDosage, dailyDosageUnit };
    }
    function calculateOrganicLoad() {
        hideError('organicLoadErrorDisplay');
        const inputs = { influentConcentration: getNum('organicInfluentConcentration'), effluentConcentration: getNum('organicEffluentConcentration'), flowRate: getNum('organicLoadFlowRate') };
        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) { showError('organicLoadErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.'); return null; }
        const influentLoad = (inputs.influentConcentration * inputs.flowRate) / 1000;
        const effluentLoad = (inputs.effluentConcentration * inputs.flowRate) / 1000;
        const efficiency = influentLoad > 0 ? ((influentLoad - effluentLoad) / influentLoad) * 100 : 0;
        getEl('influentOrganicLoadResult').textContent = `${influentLoad.toFixed(2)} kg/dia`;
        getEl('effluentOrganicLoadResult').textContent = `${effluentLoad.toFixed(2)} kg/dia`;
        getEl('organicLoadEfficiencyResult').textContent = `${efficiency.toFixed(2)} %`;
        getEl('organicLoadEfficiencyResult').className = `font-semibold ${getResultColorClass(efficiency, 'efficiency')}`;
        getEl('organicLoadResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('organicLoadNote'), influentLoad, effluentLoad, efficiency };
    }

    // Funções de gestão de dados (Firebase)
    async function saveData(collectionName, data) { if (!isFirebaseInitialized) { showToast('A ligação à base de dados falhou.', 'error'); return; } try { await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), { ...data, timestamp: new Date() }); showToast('Dados guardados com sucesso!'); } catch (e) { showToast('Erro ao guardar dados.', 'error'); console.error(e); } }
    async function deleteData(collectionName, docId) { if (!isFirebaseInitialized) { showToast('A ligação à base de dados falhou.', 'error'); return; } try { await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`, docId)); showToast('Registo excluído.'); } catch (e) { showToast('Erro ao excluir registo.', 'error'); console.error(e); } }
    
    // Funções de Configurações do Utilizador
    function updateSettingsUI() { getEl('settingSludgeWarningLow').value = userSettings.sludge.warningLow || ''; getEl('settingSludgeIdealLow').value = userSettings.sludge.idealLow || ''; getEl('settingSludgeIdealHigh').value = userSettings.sludge.idealHigh || ''; }
    async function loadUserSettings() { if (!isFirebaseInitialized) return; const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`); const docSnap = await getDoc(docRef); if (docSnap.exists()) { userSettings = { ...userSettings, ...docSnap.data() }; } updateSettingsUI(); }
    async function saveUserSettings() { const newSettings = { sludge: { warningLow: getNum('settingSludgeWarningLow'), idealLow: getNum('settingSludgeIdealLow'), idealHigh: getNum('settingSludgeIdealHigh') }}; if (!isFirebaseInitialized) { showToast('Erro: Base de dados não está ligada.', 'error'); return; } const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`); try { await setDoc(docRef, newSettings, { merge: true }); userSettings = { ...userSettings, ...newSettings }; showToast('Configurações guardadas!'); } catch (e) { showToast('Erro ao guardar configurações.', 'error'); console.error(e); } }

    // Funções de Dashboard e Gráficos
    function renderTrendsChart(sludgeData, organicData) {
        const ctx = getEl('trendsChart').getContext('2d');
        const allData = [...sludgeData, ...organicData].sort((a,b) => a.timestamp.toDate() - b.timestamp.toDate());
        const labels = [...new Set(allData.map(d => d.timestamp.toDate().toLocaleDateString('pt-BR')))];
        const mapDataToLabels = (data, key) => labels.map(label => data.find(d => d.timestamp.toDate().toLocaleDateString('pt-BR') === label)?.[key] ?? null);
        if (trendsChart) trendsChart.destroy();
        trendsChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Idade do Lodo (dias)', data: mapDataToLabels(sludgeData, 'calculatedISR'), borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.5)', yAxisID: 'y', spanGaps: true }, { label: 'Eficiência Remoção (%)', data: mapDataToLabels(organicData, 'efficiency'), borderColor: 'rgb(22, 163, 74)', backgroundColor: 'rgba(22, 163, 74, 0.5)', yAxisID: 'y1', spanGaps: true } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Idade do Lodo (dias)'} }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Eficiência (%)'}, grid: { drawOnChartArea: false } } } } });
    }
    function updateDashboard() {
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
    }
    
    function exportToCSV() {
        const headers = ['Data', 'Tipo', 'Resultado Principal', 'Observações', 'Dados Completos'];
        const rows = [];
        const filterAndMap = (data, type, resultKey) => {
            const filterValue = getVal('dateFilter');
            const now = new Date();
            const filterDate = new Date();
            if (filterValue !== 'all') filterDate.setDate(now.getDate() - parseInt(filterValue));
            const filteredData = (filterValue === 'all') ? data : data.filter(entry => entry.timestamp.toDate() >= filterDate);
            filteredData.forEach(entry => { rows.push([ entry.timestamp.toDate().toLocaleString('pt-BR'), type, entry[resultKey]?.toFixed(2) || 'N/A', `"${(entry.note || '').replace(/"/g, '""')}"`, `"${JSON.stringify(entry).replace(/"/g, '""')}"` ].join(',')); });
        };
        filterAndMap(historyData.sludge, 'Idade do Lodo', 'calculatedISR');
        filterAndMap(historyData.organic, 'Carga Orgânica', 'efficiency');
        filterAndMap(historyData.phyChem, 'Físico-Químico', 'turbidityEfficiency');
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "relatorio_ete_analise.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Funções de gestão de histórico
    function hideConfirmModal() { getEl('confirmModal').classList.add('hidden'); }
    function showConfirmModal(onConfirm) {
        const confirmModal = getEl('confirmModal');
        const confirmModalOk = getEl('confirmModalOk');
        confirmModal.classList.add('flex');
        confirmModal.classList.remove('hidden');
        const newOk = confirmModalOk.cloneNode(true);
        confirmModalOk.parentNode.replaceChild(newOk, confirmModalOk);
        newOk.addEventListener('click', () => { onConfirm(); hideConfirmModal(); });
    }
    function displayHistory(elementId, collectionName, data, headers, dataRenderer, loadFunction) {
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
    }
    function setupHistoryListener(collectionName, dataKey, elementId, headers, dataRenderer, loadFunction) {
        if (!isFirebaseInitialized) { const el = getEl(elementId); if (el) el.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Base de dados indisponível.</p>`; return; }
        const q = query(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            historyData[dataKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayHistory(elementId, collectionName, historyData[dataKey], headers, dataRenderer, loadFunction);
            updateDashboard();
        }, (error) => console.error(`Erro ao carregar ${collectionName}:`, error));
    }
    function loadAllHistories() {
        setupHistoryListener('sludgeAgeCalculations', 'sludge', 'sludgeAgeHistory', ['ISR (dias)'], (entry) => `<td class="${getResultColorClass(entry.calculatedISR, 'sludgeAge')}">${entry.calculatedISR.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({aerationTankVolume:'aerationTankVolume', aerationTankVSS:'aerationTankVSS', discardFlowRate:'discardFlowRate', discardVSS:'discardVSS', effluentFlowRate:'effluentFlowRate', effluentVSS:'effluentVSS', note:'sludgeAgeNote'}[k]); if(el) el.value = entry[k]; }); calculateSludgeAge(); showSection('sludgeAgeSection'); });
        setupHistoryListener('physicalChemicalCalculations', 'phyChem', 'physicalChemicalHistory', ['Efic. Turb. (%)', 'Efic. Cor (%)'], (entry) => `<td class="${getResultColorClass(entry.turbidityEfficiency, 'efficiency')}">${entry.turbidityEfficiency.toFixed(2)}</td><td class="${getResultColorClass(entry.colorEfficiency, 'efficiency')}">${entry.colorEfficiency.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({initialTurbidity:'phyChemInitialTurbidity', finalTurbidity:'phyChemFinalTurbidity', initialColor:'phyChemInitialColor', finalColor:'phyChemFinalColor', idealDosage:'phyChemIdealDosage', etaFlowRate:'phyChemEtaFlowRate', dosageUnit:'phyChemDosageUnit', note:'phyChemNote'}[k]); if(el) el.value = entry[k]; }); calculatePhysicalChemical(); showSection('physicalChemicalSection'); });
        setupHistoryListener('organicLoadCalculations', 'organic', 'organicLoadHistory', ['Carga Afluente (kg/dia)', 'Eficiência (%)'], (entry) => `<td>${entry.influentLoad.toFixed(2)}</td><td class="${getResultColorClass(entry.efficiency, 'efficiency')}">${entry.efficiency.toFixed(2)}</td>`, (entry) => { Object.keys(entry).forEach(k => { const el = getEl({influentConcentration:'organicInfluentConcentration', effluentConcentration:'organicEffluentConcentration', flowRate:'organicLoadFlowRate', note:'organicLoadNote'}[k]); if(el) el.value = entry[k]; }); calculateOrganicLoad(); showSection('organicLoadSection'); });
    }

    // Função de inicialização do Firebase
    function initializeFirebase() {
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
                    loadAllHistories();
                } else {
                    setSaveButtonsState(false);
                    signInAnonymously(auth).catch(e => console.error("Erro no sign-in anónimo:", e));
                }
            });
        } catch (e) { console.error("Erro fatal ao inicializar Firebase SDK:", e); getEl('userIdDisplay').textContent = `DB Offline`; setSaveButtonsState(false); }
    }

    // --- 3. EXECUÇÃO INICIAL E EVENT LISTENERS ---
    function initializeAppLogic() {
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
        
        applyTheme(localStorage.getItem('theme') || 'light');
        setSaveButtonsState(false);
        showSection('dashboardSection');
        initializeFirebase();
    }

    initializeAppLogic();
});
