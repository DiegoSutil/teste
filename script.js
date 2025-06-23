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
    
    // Aplica o tema guardado ao carregar
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    darkModeToggle.addEventListener('click', () => {
        const newTheme = htmlEl.classList.contains('dark') ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

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

    // --- INICIALIZAÇÃO DO FIREBASE E AUTENTICAÇÃO ---
    const initializeFirebase = () => {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            console.warn("Configuração do Firebase não encontrada.");
            getEl('userIdDisplay').textContent = `DB Offline (Sem Config)`;
            setSaveButtonsState(false);
            return;
        }
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
        } catch (e) {
            console.error("Erro fatal ao inicializar Firebase SDK:", e);
            getEl('userIdDisplay').textContent = `DB Offline (Erro)`;
            setSaveButtonsState(false);
        }
    };
    
    // --- GESTÃO DE CONFIGURAÇÕES DO UTILIZADOR ---
    const loadUserSettings = async () => {
        if (!db || !currentUserId) return;
        const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            userSettings = { ...userSettings, ...docSnap.data() };
            console.log("Configurações do utilizador carregadas.");
        }
        updateSettingsUI();
    };

    const saveUserSettings = async () => {
        const newSettings = {
            sludge: {
                warningLow: getNum('settingSludgeWarningLow'),
                idealLow: getNum('settingSludgeIdealLow'),
                idealHigh: getNum('settingSludgeIdealHigh')
            }
        };
        if (!db || !currentUserId) {
            showToast('Erro: Base de dados não está ligada.', 'error');
            return;
        }
        const docRef = doc(db, `artifacts/${appId}/users/${currentUserId}/settings/userPreferences`);
        try {
            await setDoc(docRef, newSettings, { merge: true });
            userSettings = { ...userSettings, ...newSettings };
            showToast('Configurações guardadas com sucesso!');
        } catch (e) {
            showToast('Erro ao guardar configurações.', 'error');
            console.error("Erro ao guardar configurações:", e);
        }
    };
    
    const updateSettingsUI = () => {
        getEl('settingSludgeWarningLow').value = userSettings.sludge.warningLow || '';
        getEl('settingSludgeIdealLow').value = userSettings.sludge.idealLow || '';
        getEl('settingSludgeIdealHigh').value = userSettings.sludge.idealHigh || '';
    };

    // --- LÓGICA DE CORES E CÁLCULOS ---
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

    // --- DADOS E HISTÓRICO (FIRESTORE) ---
    const saveData = async (collectionName, data) => {
        if (!isFirebaseInitialized || !db || !currentUserId) {
            showToast('A ligação à base de dados falhou.', 'error'); return;
        }
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), { ...data, timestamp: new Date() });
            showToast('Dados guardados com sucesso!');
        } catch (e) {
            showToast('Erro ao guardar dados.', 'error'); console.error(e);
        }
    };
    
    const deleteData = async (collectionName, docId) => {
        if (!isFirebaseInitialized || !db || !currentUserId) {
            showToast('A ligação à base de dados falhou.', 'error'); return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`, docId));
            showToast('Registo excluído.');
        } catch (e) {
            showToast('Erro ao excluir registo.', 'error'); console.error(e);
        }
    };
    
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
        trendsChart = new Chart(ctx, { /* ... Chart.js config ... */ });
    };

    getEl('dateFilter').addEventListener('change', updateDashboard);

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
                    `"${entry.note || ''}"`,
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
    getEl('exportCsvButton').addEventListener('click', exportToCSV);


    // --- GESTÃO DE HISTÓRICO E UI ---
    // (Inclui as funções displayHistory, setupHistoryListener, loadAllHistories)
    // ...

    // --- EVENT LISTENERS E INICIALIZAÇÃO ---
    // ...
    
    initializeFirebase();
    setSaveButtonsState(false);
    showSection('dashboardSection');
});
