/* --- GERAL --- */
body {
    font-family: 'Roboto', sans-serif;
    @apply bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-300;
}

/* --- LOGO LIGHT/DARK MODE --- */
/* O JavaScript vai controlar qual logo é mostrado adicionando a classe 'hidden' */

/* --- TRANSIÇÕES DE SECÇÃO --- */
.section-content { transition: opacity 0.5s ease-in-out, transform 0.5s ease-in-out; }
.hidden-section { opacity: 0; transform: translateY(20px); display: none; position: absolute; width: 100%; }
.visible-section { opacity: 1; transform: translateY(0); position: relative; }

/* --- CARDS --- */
.calculator-card { @apply bg-white dark:bg-slate-800 rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1; }

/* --- INPUTS E SELECTS --- */
.custom-input, .custom-select { @apply w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-3 text-slate-800 dark:text-slate-200 transition-all duration-200; }
.custom-input:focus, .custom-select:focus { @apply outline-none border-blue-500 ring-2 ring-blue-500/50; }
textarea.custom-input { resize: vertical; }

/* --- BOTÕES DE NAVEGAÇÃO --- */
.nav-button { @apply flex items-center justify-center gap-2 w-full p-3 font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg shadow-sm transition-all duration-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-500; }
.active-nav-button, .active-nav-button:hover { @apply bg-blue-600 text-white dark:bg-blue-600 ring-2 ring-offset-2 ring-blue-500 ring-offset-slate-50 dark:ring-offset-slate-900; }

/* --- BOTÕES DE AÇÃO --- */
.action-button { @apply px-5 py-3 font-semibold rounded-lg shadow-sm transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none; }
.primary-button { @apply bg-blue-600 text-white hover:bg-blue-700; }
.secondary-button { @apply bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600; }
.danger-button { @apply bg-red-600 text-white hover:bg-red-700; }

/* --- DARK MODE TOGGLE --- */
.theme-toggle { @apply p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors; }

/* --- NOTIFICAÇÕES (TOASTS) --- */
#toast-container { width: 320px; }
.toast { @apply flex items-center p-4 w-full max-w-xs text-white rounded-lg shadow-lg transition-all duration-300 transform;
    animation: toast-in 0.5s ease;
}
.toast-success { @apply bg-green-500; }
.toast-error { @apply bg-red-500; }
.toast.toast-out { animation: toast-out 0.5s ease forwards; }

@keyframes toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes toast-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }

/* --- FEEDBACK VISUAL --- */
.feedback-box { @apply p-4 border rounded-lg; }
.success-box { @apply bg-green-50 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300; }
.error-box { @apply bg-red-50 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300; }
.result-positive { color: #16a34a; } .dark .result-positive { color: #4ade80; }
.result-warning { color: #f59e0b; } .dark .result-warning { color: #facc15; }
.result-negative { color: #dc2626; } .dark .result-negative { color: #f87171; }

/* --- TABELA DE HISTÓRICO --- */
.history-table { @apply w-full overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg; }
.history-table h3 { @apply text-lg font-semibold text-slate-700 dark:text-slate-200 p-4 border-b border-slate-200 dark:border-slate-700; }
.history-table .table-container { @apply overflow-x-auto; }
.history-table table { @apply min-w-full text-sm; }
.history-table thead { @apply bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300; }
.history-table th { @apply p-3 text-left font-semibold; }
.history-table tbody { @apply divide-y divide-slate-200 dark:divide-slate-700; }
.history-table tr:hover { @apply bg-slate-50 dark:bg-slate-700/50; }
.history-table td { @apply p-3 whitespace-nowrap; }
.history-table .load-btn { @apply font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300; }
.history-table .delete-btn { @apply font-semibold text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300; }
.note-icon { @apply h-5 w-5 text-slate-400 cursor-pointer relative; }
.note-tooltip { @apply invisible opacity-0 absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-48 p-2 bg-slate-800 text-white text-xs rounded-md shadow-lg transition-opacity duration-200 z-10; }
.note-icon:hover .note-tooltip { @apply visible opacity-100; }

/* --- DASHBOARD --- */
.kpi-card { @apply bg-slate-50 dark:bg-slate-800 p-6 rounded-xl text-center border border-slate-200 dark:border-slate-700 shadow-sm; }
.kpi-title { @apply text-sm font-medium text-slate-600 dark:text-slate-400 mb-2; }
.kpi-value { @apply text-4xl font-bold text-slate-800 dark:text-slate-100; }
