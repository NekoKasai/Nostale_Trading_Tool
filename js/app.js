// Haupt-Applikation
const app = {
    talerPrice: 0,
    isEditingTaler: false,
    searchTerm: '',
    filterMode: 'all',
    feePercent: 0,
    talerPresets: [0],
    favoriteGroupFilter: 'all',
    compareMap: {},
    profiles: ['default'],
    profile: 'default',

    async init() {
        this.loadProfiles();
        try {
            await Database.init();
        } catch (error) {
            console.warn('Datenbank nicht verfügbar, starte mit Fallback:', error);
        }

        try {
            await this.loadDefaultData();
            this.initUI();
            this.updateKpis();
            this.updateCompareOptions();
            console.log('App erfolgreich initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
        }
    },

    async loadDefaultData() {
        let talerData = await Database.loadAllData(Database.STORES.TALER_ITEMS);
        if (Object.keys(talerData).length === 0) {
            const zeroTalerData = this.buildZeroTalerData(DEFAULT_TALER_DATA);
            for (const [category, items] of Object.entries(zeroTalerData)) {
                await Database.saveData(Database.STORES.TALER_ITEMS, category, items);
            }
            talerData = zeroTalerData;
        }

        let itemsData = await Database.loadAllData(Database.STORES.ITEMS_DATA);
        if (Object.keys(itemsData).length === 0) {
            const zeroItemsData = this.buildZeroItemsData(DEFAULT_ITEMS_DATA);
            for (const [category, items] of Object.entries(zeroItemsData)) {
                await Database.saveData(Database.STORES.ITEMS_DATA, category, items);
            }
            itemsData = zeroItemsData;
        }

        const savedTalerPrice = await Database.loadData(Database.STORES.SETTINGS, 'talerPrice');
        if (savedTalerPrice !== null && savedTalerPrice !== undefined) {
            this.talerPrice = savedTalerPrice;
        }

        const savedFee = await Database.loadData(Database.STORES.SETTINGS, 'feePercent');
        if (savedFee !== null && savedFee !== undefined) {
            this.feePercent = savedFee;
        }

        const savedPresets = await Database.loadData(Database.STORES.SETTINGS, 'talerPresets');
        if (Array.isArray(savedPresets) && savedPresets.length) {
            this.talerPresets = savedPresets;
        }

        const savedGroupFilter = await Database.loadData(Database.STORES.SETTINGS, 'favoriteGroupFilter');
        if (savedGroupFilter) {
            this.favoriteGroupFilter = savedGroupFilter;
        }

        talerCalculator.init(talerData);
        itemsCalculator.init(itemsData);
        tabs.init();
        favorites.init();
    },

    initUI() {
        this.initProfileUI();
        const talerValue = document.getElementById('taler-value');
        if (talerValue) {
            talerValue.textContent = this.formatNumber(this.talerPrice);
        }

        const feeInput = document.getElementById('fee-input');
        if (feeInput) {
            feeInput.value = this.feePercent;
        }
        this.updateFeeDisplay();

        document.getElementById('edit-taler-btn').addEventListener('click', () => this.toggleTalerEdit());
        document.getElementById('taler-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveTalerPrice();
            }
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.performSearch();
        });

        document.getElementById('filter-select').addEventListener('change', (e) => {
            this.filterMode = e.target.value;
            this.performSearch();
        });

        if (feeInput) {
            feeInput.addEventListener('input', async (e) => {
                this.feePercent = parseFloat(e.target.value) || 0;
                this.updateFeeDisplay();
                await Database.saveData(Database.STORES.SETTINGS, 'feePercent', this.feePercent);
                talerCalculator.updateAllCalculations();
                itemsCalculator.updateAllCalculations();
                this.updateKpis();
            });
        }

        document.getElementById('export-btn').addEventListener('click', () => this.exportCsv());
        document.getElementById('import-input').addEventListener('change', (e) => this.importCsv(e));

        document.getElementById('compare-a').addEventListener('change', () => this.updateCompareMetrics());
        document.getElementById('compare-b').addEventListener('change', () => this.updateCompareMetrics());

        document.getElementById('favorites-group-filter').addEventListener('change', async (e) => {
            this.favoriteGroupFilter = e.target.value;
            await Database.saveData(Database.STORES.SETTINGS, 'favoriteGroupFilter', this.favoriteGroupFilter);
            favorites.updateDisplay();
        });

        document.getElementById('save-preset-btn').addEventListener('click', () => this.savePreset());
        document.getElementById('taler-preset-select').addEventListener('change', (e) => this.applyPreset(e.target.value));

        this.updatePresetSelect();
    },

    safeReadLocal(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : value;
        } catch (error) {
            return fallback;
        }
    },

    safeWriteLocal(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            return;
        }
    },

    loadProfiles() {
        const rawProfiles = this.safeReadLocal(Database.PROFILES_KEY);
        let profiles = ['default'];
        if (rawProfiles) {
            try {
                const parsed = JSON.parse(rawProfiles);
                if (Array.isArray(parsed) && parsed.length) {
                    profiles = parsed;
                }
            } catch (error) {
                profiles = ['default'];
            }
        }

        this.profiles = Array.from(new Set(
            profiles
                .map(profile => profile.toString().trim())
                .filter(Boolean)
        ));
        if (!this.profiles.length) {
            this.profiles = ['default'];
        }

        const storedProfile = this.safeReadLocal(Database.PROFILE_KEY);
        if (storedProfile && this.profiles.includes(storedProfile)) {
            this.profile = storedProfile;
        } else {
            this.profile = this.profiles[0];
        }

        Database.setProfile(this.profile);
    },

    saveProfiles() {
        this.safeWriteLocal(Database.PROFILES_KEY, JSON.stringify(this.profiles));
        this.safeWriteLocal(Database.PROFILE_KEY, this.profile);
    },

    initProfileUI() {
        const select = document.getElementById('profile-select');
        const addButton = document.getElementById('add-profile-btn');
        if (!select || !addButton) return;

        select.innerHTML = '';
        this.profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile;
            option.textContent = profile;
            select.appendChild(option);
        });
        select.value = this.profile;

        select.addEventListener('change', (event) => {
            const next = event.target.value;
            if (!next || next === this.profile) return;
            this.profile = next;
            this.saveProfiles();
            location.reload();
        });

        addButton.addEventListener('click', () => this.addProfile());
    },

    addProfile() {
        const name = prompt('Neues Profil (nur lokal):');
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (trimmed.includes('::')) {
            alert('Bitte verwende keinen "::" im Profilnamen.');
            return;
        }

        if (!this.profiles.includes(trimmed)) {
            this.profiles.push(trimmed);
        }
        this.profile = trimmed;
        this.saveProfiles();
        location.reload();
    },

    buildZeroTalerData(source) {
        const result = {};
        Object.entries(source).forEach(([category, items]) => {
            result[category] = items.map(item => ({
                ...item,
                talerCost: 0,
                resaleGold: 0,
                buyAmount: 0,
                sellAmount: 0,
                isFavorite: false,
                favoriteGroup: '',
                priceHistory: []
            }));
        });
        return result;
    },

    buildZeroItemsData(source) {
        const result = {};
        Object.entries(source).forEach(([category, items]) => {
            result[category] = items.map(item => ({
                ...item,
                buyPrice: 0,
                sellPrice: 0,
                amount: 0,
                sellAmount: 0,
                gillionPrice: 0,
                cellaOutput: 0,
                cellaPrice: 0,
                cellonCost: 0,
                isFavorite: false,
                favoriteGroup: '',
                isGillionCalculator: !!item.isGillionCalculator,
                priceHistory: []
            }));
        });
        return result;
    },

    updateFeeDisplay() {
        const feeValue = document.getElementById('fee-value');
        if (feeValue) {
            feeValue.textContent = `${this.feePercent}%`;
        }
    },

    formatNumber(num) {
        return Number(num || 0).toLocaleString('de-DE');
    },

    parseNumber(str) {
        if (str === null || str === undefined) return 0;
        return Number(str.toString().replace(/\./g, '').replace(/,/g, '.'));
    },

    getFeeMultiplier() {
        return Math.max(0, 1 - this.feePercent / 100);
    },

    toggleTalerEdit() {
        this.isEditingTaler = !this.isEditingTaler;

        const display = document.getElementById('taler-display');
        const edit = document.getElementById('taler-edit');
        const button = document.getElementById('edit-taler-btn');

        if (this.isEditingTaler) {
            display.classList.add('hidden');
            edit.classList.remove('hidden');
            button.textContent = 'Abbrechen';

            const input = document.getElementById('taler-input');
            input.value = this.talerPrice;
            input.focus();
            input.select();
        } else {
            display.classList.remove('hidden');
            edit.classList.add('hidden');
            button.textContent = 'Preis ändern';
        }
    },

    async saveTalerPrice() {
        const input = document.getElementById('taler-input');
        const newPrice = parseInt(input.value);

        if (!isNaN(newPrice) && newPrice > 0) {
            this.talerPrice = newPrice;
            document.getElementById('taler-value').textContent = this.formatNumber(this.talerPrice);
            await Database.saveData(Database.STORES.SETTINGS, 'talerPrice', this.talerPrice);
            talerCalculator.updateAllCalculations();
            itemsCalculator.updateAllCalculations();
            favorites.updateDisplay();
            this.updateKpis();
        }

        this.toggleTalerEdit();
    },

    updatePresetSelect() {
        const select = document.getElementById('taler-preset-select');
        if (!select) return;
        select.innerHTML = '';

        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Benutzerdefiniert';
        select.appendChild(customOption);

        this.talerPresets.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = this.formatNumber(value);
            select.appendChild(option);
        });

        if (this.talerPresets.includes(this.talerPrice)) {
            select.value = this.talerPrice.toString();
        } else {
            select.value = 'custom';
        }
    },

    async applyPreset(value) {
        if (value === 'custom') return;
        const parsed = parseInt(value);
        if (!isNaN(parsed)) {
            this.talerPrice = parsed;
            document.getElementById('taler-value').textContent = this.formatNumber(this.talerPrice);
            await Database.saveData(Database.STORES.SETTINGS, 'talerPrice', this.talerPrice);
            talerCalculator.updateAllCalculations();
            itemsCalculator.updateAllCalculations();
            favorites.updateDisplay();
            this.updateKpis();
        }
    },

    async savePreset() {
        if (!this.talerPresets.includes(this.talerPrice)) {
            this.talerPresets.push(this.talerPrice);
            this.talerPresets.sort((a, b) => a - b);
            await Database.saveData(Database.STORES.SETTINGS, 'talerPresets', this.talerPresets);
            this.updatePresetSelect();
        }
    },

    recordPriceHistory(item, value) {
        if (value === null || value === undefined) return;
        const numeric = Number(value) || 0;
        item.priceHistory = item.priceHistory || [];
        const last = item.priceHistory[item.priceHistory.length - 1];
        if (last && last.value === numeric) return;
        item.priceHistory.push({ ts: Date.now(), value: numeric });
        if (item.priceHistory.length > 20) {
            item.priceHistory.shift();
        }
    },

    buildSparkline(values) {
        if (!values || values.length < 2) {
            return '<svg viewBox="0 0 100 24"><polyline fill="none" stroke="#b06c2a" stroke-width="2" points="0,20 100,20"></polyline></svg>';
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const points = values.map((val, index) => {
            const x = (index / (values.length - 1)) * 100;
            const y = 22 - ((val - min) / range) * 20;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return `<svg viewBox="0 0 100 24"><polyline fill="none" stroke="#b06c2a" stroke-width="2" points="${points}"></polyline></svg>`;
    },

    getHistoryValues(item) {
        if (!item.priceHistory || item.priceHistory.length === 0) return [];
        return item.priceHistory.map(entry => entry.value);
    },

    performSearch() {
        if (tabs.currentTab === 'taler') {
            talerCalculator.renderAllCategories();
        } else {
            itemsCalculator.renderAllCategories();
        }
        favorites.updateDisplay();
        this.updateKpis();
    },

    getItemMetrics(item, isTaler) {
        if (isTaler) {
            return talerCalculator.profitFor(item);
        }
        return itemsCalculator.profitForItem(item);
    },

    itemMatchesFilter(item, isTaler) {
        const searchOk = !this.searchTerm || (item.name || '').toLowerCase().includes(this.searchTerm);
        if (!searchOk) return false;

        if (this.filterMode === 'all') return true;

        const metrics = this.getItemMetrics(item, isTaler);
        const profit = metrics.profit || 0;
        const hasPrice = isTaler
            ? item.resaleGold > 0
            : item.isGillionCalculator
                ? item.cellaPrice > 0
                : item.sellPrice > 0;

        if (this.filterMode === 'profit') return profit > 0;
        if (this.filterMode === 'loss') return profit < 0;
        if (this.filterMode === 'no-price') return !hasPrice;
        return true;
    },

    updateKpis() {
        let totalCost = 0;
        let totalRevenue = 0;
        let totalProfit = 0;

        if (tabs.currentTab === 'taler') {
            for (const items of Object.values(talerCalculator.data)) {
                items.forEach(item => {
                    if (!this.itemMatchesFilter(item, true)) return;
                    const metrics = talerCalculator.profitFor(item);
                    totalCost += metrics.cost || 0;
                    totalRevenue += metrics.revenue || 0;
                    totalProfit += metrics.profit || 0;
                });
            }
        } else {
            for (const items of Object.values(itemsCalculator.data)) {
                items.forEach(item => {
                    if (!this.itemMatchesFilter(item, false)) return;
                    const metrics = itemsCalculator.profitForItem(item);
                    totalCost += metrics.cost || 0;
                    totalRevenue += metrics.revenue || 0;
                    totalProfit += metrics.profit || 0;
                });
            }
        }

        const roi = totalCost === 0 ? 0 : (totalProfit / totalCost) * 100;
        document.getElementById('kpi-cost').textContent = this.formatNumber(totalCost);
        document.getElementById('kpi-revenue').textContent = this.formatNumber(totalRevenue);
        document.getElementById('kpi-profit').textContent = this.formatNumber(totalProfit);
        document.getElementById('kpi-roi').textContent = `${roi.toFixed(2)}%`;
    },

    updateCompareOptions() {
        const selectA = document.getElementById('compare-a');
        const selectB = document.getElementById('compare-b');
        if (!selectA || !selectB) return;

        const options = [{ value: '', label: 'Auswählen' }];
        this.compareMap = {};

        for (const [category, items] of Object.entries(talerCalculator.data)) {
            items.forEach(item => {
                const key = `taler|${category}|${item.id}`;
                options.push({ value: key, label: `Taler / ${category} / ${item.name}` });
                this.compareMap[key] = { item, isTaler: true };
            });
        }

        for (const [category, items] of Object.entries(itemsCalculator.data)) {
            items.forEach(item => {
                const key = `items|${category}|${item.id}`;
                options.push({ value: key, label: `Item / ${category} / ${item.name}` });
                this.compareMap[key] = { item, isTaler: false };
            });
        }

        [selectA, selectB].forEach(select => {
            select.innerHTML = '';
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                select.appendChild(option);
            });
        });
    },

    updateCompareMetrics() {
        const valueA = document.getElementById('compare-a').value;
        const valueB = document.getElementById('compare-b').value;

        const metricsA = this.getCompareMetrics(valueA);
        const metricsB = this.getCompareMetrics(valueB);

        this.renderCompareMetrics('compare-a-metrics', metricsA);
        this.renderCompareMetrics('compare-b-metrics', metricsB);

        if (!metricsA || !metricsB) {
            this.renderCompareMetrics('compare-delta', null);
            return;
        }

        const delta = {
            cost: metricsA.cost - metricsB.cost,
            revenue: metricsA.revenue - metricsB.revenue,
            profit: metricsA.profit - metricsB.profit,
            roi: metricsA.roi - metricsB.roi
        };
        this.renderCompareMetrics('compare-delta', delta);
    },

    getCompareMetrics(value) {
        if (!value || !this.compareMap[value]) return null;
        const { item, isTaler } = this.compareMap[value];
        const metrics = isTaler ? talerCalculator.profitFor(item) : itemsCalculator.profitForItem(item);
        const roi = metrics.cost === 0 ? 0 : (metrics.profit / metrics.cost) * 100;
        return { cost: metrics.cost || 0, revenue: metrics.revenue || 0, profit: metrics.profit || 0, roi };
    },

    renderCompareMetrics(targetId, metrics) {
        const container = document.getElementById(targetId);
        if (!container) return;
        const values = metrics
            ? [
                this.formatNumber(metrics.cost),
                this.formatNumber(metrics.revenue),
                this.formatNumber(metrics.profit),
                `${metrics.roi.toFixed(2)}%`
            ]
            : ['-', '-', '-', '-'];
        const spans = container.querySelectorAll('.value');
        spans.forEach((span, index) => {
            span.textContent = values[index] || '-';
        });
    },

    escapeCsv(value) {
        if (value === null || value === undefined) return '';
        const str = value.toString();
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    },

    exportCsv() {
        const rows = [];
        if (tabs.currentTab === 'taler') {
            rows.push([
                'category', 'name', 'talerCost', 'resaleGold', 'buyAmount', 'sellAmount', 'isFavorite', 'favoriteGroup'
            ]);
            for (const [category, items] of Object.entries(talerCalculator.data)) {
                items.forEach(item => {
                    rows.push([
                        category,
                        item.name,
                        item.talerCost,
                        item.resaleGold,
                        item.buyAmount,
                        item.sellAmount,
                        item.isFavorite ? '1' : '0',
                        item.favoriteGroup || ''
                    ]);
                });
            }
        } else {
            rows.push([
                'category', 'name', 'buyPrice', 'sellPrice', 'amount', 'sellAmount', 'isFavorite', 'favoriteGroup',
                'isGillionCalculator', 'gillionPrice', 'cellaOutput', 'cellaPrice', 'cellonCost'
            ]);
            for (const [category, items] of Object.entries(itemsCalculator.data)) {
                items.forEach(item => {
                    rows.push([
                        category,
                        item.name,
                        item.buyPrice || 0,
                        item.sellPrice || 0,
                        item.amount || 0,
                        item.sellAmount || item.amount || 0,
                        item.isFavorite ? '1' : '0',
                        item.favoriteGroup || '',
                        item.isGillionCalculator ? '1' : '0',
                        item.gillionPrice || 0,
                        item.cellaOutput || 0,
                        item.cellaPrice || 0,
                        item.cellonCost || 0
                    ]);
                });
            }
        }

        const csv = rows.map(row => row.map(cell => this.escapeCsv(cell)).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = tabs.currentTab === 'taler' ? 'taler-items.csv' : 'items-umrechner.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    },

    importCsv(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            if (!lines.length) return;

            const headers = this.parseCsvLine(lines[0]);
            const rows = lines.slice(1).map(line => {
                const values = this.parseCsvLine(line);
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                return row;
            });

            if (headers.includes('talerCost')) {
                await talerCalculator.importRows(rows);
            } else if (headers.includes('buyPrice')) {
                await itemsCalculator.importRows(rows);
            }

            event.target.value = '';
            this.updateCompareOptions();
            this.performSearch();
        };
        reader.readAsText(file);
    }
};

// App starten
document.addEventListener('DOMContentLoaded', () => app.init());

