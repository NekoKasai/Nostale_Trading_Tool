// Tab-Management
const tabs = {
    currentTab: 'taler',

    init() {
        document.getElementById('tab-taler').addEventListener('click', () => this.switchTab('taler'));
        document.getElementById('tab-items').addEventListener('click', () => this.switchTab('items'));
    },

    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden-tab');
        });

        document.getElementById(`tab-${tabName}`).classList.add('active');
        document.getElementById(`tab-${tabName}-content`).classList.remove('hidden-tab');

        this.currentTab = tabName;

        const title = document.getElementById('main-title');
        const description = document.getElementById('main-description');
        const talerPanel = document.getElementById('taler-price-panel');

        if (tabName === 'taler') {
            title.textContent = '📊 Übersicht';
            description.textContent = 'Sieh sofort, was du am Ende verdienst.';
            talerPanel.classList.remove('hidden');
        } else {
            title.textContent = '💰 Gewinnrechner';
            description.textContent = 'Rechne schnell aus, was sich für dich lohnt.';
            talerPanel.classList.add('hidden');
        }

        favorites.updateDisplay();
        app.updateKpis();
    }
};
