// Importações modulares do Firebase SDK (versão 11+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, deleteDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // --- VARIÁVEIS GLOBAIS E ESTADO DA APLICAÇÃO ---
    let db, auth, currentUserId = null;
    let isFirebaseInitialized = false;
    let trendsChart = null;
    let userSettings = {
        sludge: { warningLow: 5, idealLow: 8, idealHigh: 15 } // Metas padrão
    };
    let historyData = { sludge: [], phyChem: [], organic: [] };

    // Configuração do Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyCnFsX4MwdAR3yC0MAoK9x3II3UGt1DDng",
        authDomain: "ferramentasete.firebaseapp.com",
        projectId: "ferramentasete",
        storageBucket: "ferramentasete.firebasestorage.app",
        messagingSenderId: "436175488554",
        appId: "1:436175488554:web:6bb40da9db9c88674ca553"
    };

    const appId = (firebaseConfig && firebaseConfig.projectId) ? firebaseConfig.projectId : 'default-app-id';
    
    // --- FUNÇÕES AUXILIARES GENÉRICAS ---
    const getEl = (id) => document.getElementById(id);
    const getVal = (id) => getEl(id).value;
    const getNum = (id) => parseFloat(getVal(id));

    // --- MANIPULAÇÃO DA UI E LÓGICA DE CÁLCULO (DECLARAÇÕES PRIMEIRO) ---

    const hideError = (id) => {
        const el = getEl(id);
        el.classList.add('hidden');
        el.textContent = '';
    }

    const showError = (id, message) => {
        const el = getEl(id);
        el.textContent = message;
        el.classList.remove('hidden');
    }
    
    const getResultColorClass = (value, type) => {
        if (type === 'sludgeAge') {
            const { warningLow, idealLow, idealHigh } = userSettings.sludge;
            if (value >= idealLow && value <= idealHigh) return 'result-positive';
            if (value < idealLow && value >= warningLow) return 'result-warning';
            return 'result-negative';
        }
        if (type === 'efficiency') {
            if (value >= 80) return 'result-positive';
            if (value >= 60) return 'result-warning';
            return 'result-negative';
        }
        return '';
    };

    const calculateSludgeAge = () => {
        hideError('sludgeAgeErrorDisplay');
        const inputs = {
            aerationTankVolume: getNum('aerationTankVolume'), aerationTankVSS: getNum('aerationTankVSS'),
            discardFlowRate: getNum('discardFlowRate'), discardVSS: getNum('discardVSS'),
            effluentFlowRate: getNum('effluentFlowRate'), effluentVSS: getNum('effluentVSS'),
        };
        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('sludgeAgeErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos válidos.');
            return null;
        }
        const massInTank = inputs.aerationTankVolume * 1000 * inputs.aerationTankVSS;
        const massDiscarded = inputs.discardFlowRate * 1440 * inputs.discardVSS;
        const massInEffluent = inputs.effluentFlowRate * 1000 * inputs.effluentVSS;
        const denominator = massDiscarded + massInEffluent;
        if (denominator === 0) {
            showError('sludgeAgeErrorDisplay', 'A soma das massas de SSV removidas é zero.');
            return null;
        }
        const calculatedISR = massInTank / denominator;
        const resultSpan = getEl('sludgeAgeResult');
        resultSpan.textContent = `${calculatedISR.toFixed(2)} dias`;
        resultSpan.className = `text-2xl font-bold ${getResultColorClass(calculatedISR, 'sludgeAge')}`;
        getEl('sludgeAgeResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('sludgeAgeNote'), calculatedISR };
    };

    const calculatePhysicalChemical = () => {
        hideError('phyChemErrorDisplay');
        const inputs = {
            initialTurbidity: getNum('phyChemInitialTurbidity'), finalTurbidity: getNum('phyChemFinalTurbidity'),
            initialColor: getNum('phyChemInitialColor'), finalColor: getNum('phyChemFinalColor'),
            idealDosage: getNum('phyChemIdealDosage'), etaFlowRate: getNum('phyChemEtaFlowRate'),
            dosageUnit: getVal('phyChemDosageUnit')
        };
        if (Object.values(inputs).slice(0, 6).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('phyChemErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.');
            return null;
        }
        const turbidityEfficiency = inputs.initialTurbidity > 0 ? ((inputs.initialTurbidity - inputs.finalTurbidity) / inputs.initialTurbidity) * 100 : (inputs.finalTurbidity === 0 ? 100 : 0);
        const colorEfficiency = inputs.initialColor > 0 ? ((inputs.initialColor - inputs.finalColor) / inputs.initialColor) * 100 : (inputs.finalColor === 0 ? 100 : 0);
        const dailyDosage = inputs.dosageUnit === 'mg/L' ? (inputs.idealDosage * inputs.etaFlowRate) / 1000 : inputs.idealDosage * inputs.etaFlowRate;
        const dailyDosageUnit = inputs.dosageUnit === 'mg/L' ? 'kg/dia' : 'L/dia';
        getEl('phyChemTurbidityEfficiency').textContent = `${turbidityEfficiency.toFixed(2)} %`;
        getEl('phyChemColorEfficiency').textContent = `${colorEfficiency.toFixed(2)} %`;
        getEl('phyChemDailyDosage').textContent = `${dailyDosage.toFixed(2)} ${dailyDosageUnit}`;
        getEl('phyChemResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('phyChemNote'), turbidityEfficiency, colorEfficiency, dailyDosage, dailyDosageUnit };
    };

    const calculateOrganicLoad = () => {
        hideError('organicLoadErrorDisplay');
        const inputs = {
            influentConcentration: getNum('organicInfluentConcentration'),
            effluentConcentration: getNum('organicEffluentConcentration'),
            flowRate: getNum('organicLoadFlowRate')
        };
        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('organicLoadErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.');
            return null;
        }
        const influentLoad = (inputs.influentConcentration * inputs.flowRate) / 1000;
        const effluentLoad = (inputs.effluentConcentration * inputs.flowRate) / 1000;
        const efficiency = influentLoad > 0 ? ((influentLoad - effluentLoad) / influentLoad) * 100 : 0;
        getEl('influentOrganicLoadResult').textContent = `${influentLoad.toFixed(2)} kg/dia`;
        getEl('effluentOrganicLoadResult').textContent = `${effluentLoad.toFixed(2)} kg/dia`;
        getEl('organicLoadEfficiencyResult').textContent = `${efficiency.toFixed(2)} %`;
        getEl('organicLoadEfficiencyResult').className = `font-semibold ${getResultColorClass(efficiency, 'efficiency')}`;
        getEl('organicLoadResultDisplay').classList.remove('hidden');
        return { ...inputs, note: getVal('organicLoadNote'), influentLoad, effluentLoad, efficiency };
    };
    
    // --- DARK MODE ---
    const darkModeToggle = getEl('darkModeToggle');
    const htmlEl = document.documentElement;
    const applyTheme = (theme) => {
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
    
    // --- NOTIFICAÇÕES (TOASTS) ---
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

    // --- ESTADO DOS BOTÕES DE GUARDAR ---
    const setSaveButtonsState = (enabled) => {
        [getEl('saveSludgeAgeData'), getEl('savePhysicalChemicalData'), getEl('saveOrganicLoadData')].forEach(button => {
            if (button) {
                button.disabled = !enabled;
                button.title = enabled ? 'Guardar o resultado no histórico' : 'A ligar à base de dados...';
            }
        });
    };

    // --- MODAL DE CONFIRMAÇÃO ---
    const confirmModal = getEl('confirmModal');
    const confirmModalOk = getEl('confirmModalOk');
    const confirmModalCancel = getEl('confirmModalCancel');

    const showConfirmModal = (onConfirm) => {
        confirmModal.classList.add('flex');
        confirmModal.classList.remove('hidden');
        const newOk = confirmModalOk.cloneNode(true); // Evita listeners duplicados
        confirmModalOk.parentNode.replaceChild(newOk, confirmModalOk);
        newOk.addEventListener('click', () => {
            onConfirm();
            hideConfirmModal();
        });
    };
    
    const hideConfirmModal = () => {
        confirmModal.classList.add('hidden');
        confirmModal.classList.remove('flex');
    };
    
    confirmModalCancel.addEventListener('click', hideConfirmModal);
    
    // --- LÓGICA DO DASHBOARD E GRÁFICOS ---
    const updateDashboard = () => {
        const filterValue = getVal('dateFilter');
        const now = new Date();
        const filterDate = new Date();
        if (filterValue !== 'all') filterDate.setDate(now.getDate() - parseInt(filterValue));
        const filterData = (data) => (filterValue === 'all') ? data : data.filter(entry => entry.timestamp.toDate() >= filterDate);
        
        const filtered = {
            sludge: filterData(historyData.sludge),
            phyChem: filterData(historyData.phyChem),
            organic: filterData(historyData.organic)
        };
        const calculateAverage = (data, key) => data.length === 0 ? 0 : data.reduce((acc, curr) => acc + (curr[key] || 0), 0) / data.length;

        getEl('kpiSludgeAge').textContent = `${calculateAverage(filtered.sludge, 'calculatedISR').toFixed(2)} dias`;
        getEl('kpiOrganicEfficiency').textContent = `${calculateAverage(filtered.organic, 'efficiency').toFixed(2)} %`;
        getEl('kpiInfluentLoad').textContent = `${calculateAverage(filtered.organic, 'influentLoad').toFixed(2)} kg/dia`;
        getEl('kpiTurbidityEfficiency').textContent = `${calculateAverage(filtered.phyChem, 'turbidityEfficiency').toFixed(2)} %`;
        
        renderTrendsChart(filtered.sludge, filtered.organic);
    };

    const renderTrendsChart = (sludgeData, organicData) => {
        const ctx = getEl('trendsChart').getContext('2d');
        const allData = [...sludgeData, ...organicData].sort((a,b) => a.timestamp.toDate() - b.timestamp.toDate());
        const labels = [...new Set(allData.map(d => d.timestamp.toDate().toLocaleDateString('pt-BR')))];
        const mapDataToLabels = (data, key) => labels.map(label => data.find(d => d.timestamp.toDate().toLocaleDateString('pt-BR') === label)?.[key] ?? null);

        if (trendsChart) trendsChart.destroy();
        trendsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Idade do Lodo (dias)', data: mapDataToLabels(sludgeData, 'calculatedISR'), borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.5)', yAxisID: 'y', spanGaps: true },
                    { label: 'Eficiência Remoção (%)', data: mapDataToLabels(organicData, 'efficiency'), borderColor: 'rgb(22, 163, 74)', backgroundColor: 'rgba(22, 163, 74, 0.5)', yAxisID: 'y1', spanGaps: true }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Idade do Lodo (dias)'} },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Eficiência (%)'}, grid: { drawOnChartArea: false } }
                }
            }
        });
    };
    
    // --- EXPORTAÇÃO CSV ---
    const exportToCSV = () => {
        const headers = ['Data', 'Tipo', 'Resultado Principal', 'Observações', 'Dados Completos'];
        const rows = [];
        const filterAndMap = (data, type, resultKey) => {
            const filterValue = getVal('dateFilter');
            const now = new Date();
            const filterDate = new Date();
            if (filterValue !== 'all') filterDate.setDate(now.getDate() - parseInt(filterValue));
            const filteredData = (filterValue === 'all') ? data : data.filter(entry => entry.timestamp.toDate() >= filterDate);
            filteredData.forEach(entry => {
                rows.push([
                    entry.timestamp.toDate().toLocaleString('pt-BR'),
                    type,
                    entry[resultKey]?.toFixed(2) || 'N/A',
                    `"${(entry.note || '').replace(/"/g, '""')}"`,
                    `"${JSON.stringify(entry).replace(/"/g, '""')}"`
                ].join(','));
            });
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
    };

    // --- GESTÃO DE HISTÓRICO E UI ---
    const displayHistory = (elementId, collectionName, data, headers, dataRenderer, loadFunction) => {
        const historyElement = getEl(elementId);
        if (!historyElement) return;
        if (data.length === 0) {
            historyElement.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Nenhum histórico guardado.</p>`; return;
        }
        historyElement.innerHTML = `
            <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-200 p-4 border-b border-slate-200 dark:border-slate-700">Histórico de Cálculos</h3>
            <div class="table-container">
                <table>
                    <thead><tr><th>Data</th>${headers.map(h => `<th>${h}</th>`).join('')}<th class="text-right">Ações</th></tr></thead>
                    <tbody>
                        ${data.map(entry => `
                            <tr>
                                <td>${new Date(entry.timestamp.toDate()).toLocaleString('pt-BR')} ${entry.note ? '<span class="note-icon" title="' + entry.note + '">ⓘ</span>' : ''}</td>
                                ${dataRenderer(entry)}
                                <td class="text-right space-x-2">
                                    <button data-id="${entry.id}" class="load-btn">Carregar</button>
                                    <button data-id="${entry.id}" class="delete-btn">Excluir</button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        historyElement.querySelectorAll('.load-btn').forEach(btn => btn.addEventListener('click', () => loadFunction(data.find(d => d.id === btn.dataset.id))));
        historyElement.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => showConfirmModal(() => deleteData(collectionName, btn.dataset.id))));
    };

    const setupHistoryListener = (collectionName, dataKey, elementId, headers, dataRenderer, loadFunction) => {
        if (!isFirebaseInitialized || !db || !currentUserId) {
            const el = getEl(elementId);
            if (el) el.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Base de dados indisponível.</p>`;
            return;
        }
        const q = query(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            historyData[dataKey] = freshData;
            displayHistory(elementId, collectionName, freshData, headers, dataRenderer, loadFunction);
            updateDashboard();
        }, (error) => {
            console.error(`Erro ao carregar ${collectionName}:`, error);
        });
    };
    
    // --- CARREGAMENTO DE DADOS INICIAL ---
    const loadAllHistories = () => {
        setupHistoryListener('sludgeAgeCalculations', 'sludge', 'sludgeAgeHistory', ['ISR (dias)'],
            (entry) => `<td class="${getResultColorClass(entry.calculatedISR, 'sludgeAge')}">${entry.calculatedISR.toFixed(2)}</td>`,
            (entry) => { /* ... load function ... */ }
        );
        setupHistoryListener('physicalChemicalCalculations', 'phyChem', 'physicalChemicalHistory', ['Efic. Turb. (%)', 'Efic. Cor (%)'],
            (entry) => `<td class="${getResultColorClass(entry.turbidityEfficiency, 'efficiency')}">${entry.turbidityEfficiency.toFixed(2)}</td><td class="${getResultColorClass(entry.colorEfficiency, 'efficiency')}">${entry.colorEfficiency.toFixed(2)}</td>`,
            (entry) => { /* ... load function ... */ }
        );
        setupHistoryListener('organicLoadCalculations', 'organic', 'organicLoadHistory', ['Carga Afluente (kg/dia)', 'Eficiência (%)'],
            (entry) => `<td>${entry.influentLoad.toFixed(2)}</td><td class="${getResultColorClass(entry.efficiency, 'efficiency')}">${entry.efficiency.toFixed(2)}</td>`,
            (entry) => { /* ... load function ... */ }
        );
    };
    
    // --- GESTÃO DE CONFIGURAÇÕES DO UTILIZADOR ---
    const loadUserSettings = async () => {
        if (!db || !currentUserId) return;
        const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            userSettings = { ...userSettings, ...docSnap.data() };
        }
        updateSettingsUI();
    };

    const saveUserSettings = async () => {
        const newSettings = { sludge: { warningLow: getNum('settingSludgeWarningLow'), idealLow: getNum('settingSludgeIdealLow'), idealHigh: getNum('settingSludgeIdealHigh') }};
        if (!db || !currentUserId) { showToast('Erro: Base de dados não está ligada.', 'error'); return; }
        const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`);
        try {
            await setDoc(docRef, newSettings, { merge: true });
            userSettings = { ...userSettings, ...newSettings };
            showToast('Configurações guardadas!');
        } catch (e) {
            showToast('Erro ao guardar configurações.', 'error'); console.error(e);
        }
    };
    
    const updateSettingsUI = () => {
        getEl('settingSludgeWarningLow').value = userSettings.sludge.warningLow || '';
        getEl('settingSludgeIdealLow').value = userSettings.sludge.idealLow || '';
        getEl('settingSludgeIdealHigh').value = userSettings.sludge.idealHigh || '';
    };

    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    const initializeAppLogic = () => {
        // Navegação
        const sections = ['dashboardSection', 'sludgeAgeSection', 'physicalChemicalSection', 'organicLoadSection', 'settingsSection', 'howItWorksSection'];
        const navButtons = {
            'dashboardSection': 'showDashboard', 'sludgeAgeSection': 'showSludgeAge',
            'physicalChemicalSection': 'showPhysicalChemical', 'organicLoadSection': 'showOrganicLoad',
            'settingsSection': 'showSettings', 'howItWorksSection': 'showHowItWorks'
        };
        const showSection = (targetId) => {
            sections.forEach(id => getEl(id).classList.toggle('hidden-section', id !== targetId).classList.toggle('visible-section', id === targetId));
            Object.values(navButtons).forEach(btnId => getEl(btnId).classList.remove('active-nav-button'));
            getEl(navButtons[targetId]).classList.add('active-nav-button');
        };
        Object.entries(navButtons).forEach(([sectionId, btnId]) => getEl(btnId).addEventListener('click', () => showSection(sectionId)));

        // Ações
        getEl('calculateSludgeAgeButton').addEventListener('click', calculateSludgeAge);
        getEl('calculatePhysicalChemicalButton').addEventListener('click', calculatePhysicalChemical);
        getEl('calculateOrganicLoadButton').addEventListener('click', calculateOrganicLoad);
        getEl('saveSludgeAgeData').addEventListener('click', () => { const data = calculateSludgeAge(); if (data) saveData('sludgeAgeCalculations', data); });
        getEl('savePhysicalChemicalData').addEventListener('click', () => { const data = calculatePhysicalChemical(); if (data) saveData('physicalChemicalCalculations', data); });
        getEl('saveOrganicLoadData').addEventListener('click', () => { const data = calculateOrganicLoad(); if (data) saveData('organicLoadCalculations', data); });
        getEl('saveSettingsButton').addEventListener('click', saveUserSettings);
        getEl('exportCsvButton').addEventListener('click', exportToCSV);
        getEl('dateFilter').addEventListener('change', updateDashboard);

        // Estado inicial
        applyTheme(localStorage.getItem('theme') || 'light');
        setSaveButtonsState(false);
        showSection('dashboardSection');
        initializeFirebase();
    };

    initializeAppLogic();
});
