// Taler-Rechner Funktionalität
const talerCalculator = {
    data: {},
    nextItemId: 100,
    collapsedCategories: {},

    init(talerData) {
        this.data = talerData;
        for (const items of Object.values(this.data)) {
            items.forEach(item => {
                if (item.sellAmount == null) {
                    item.sellAmount = item.buyAmount;
                }
                if (!item.favoriteGroup) {
                    item.favoriteGroup = '';
                }
                item.priceHistory = item.priceHistory || [];
            });
        }
        this.refreshNextId();
        this.loadCollapsedStates();
        this.renderAllCategories();
    },

    refreshNextId() {
        let maxId = this.nextItemId;
        for (const items of Object.values(this.data)) {
            items.forEach(item => {
                if (item.id >= maxId) maxId = item.id + 1;
            });
        }
        this.nextItemId = maxId;
    },

    calcCostInGold(talerCost, amount) {
        return talerCost * app.talerPrice * amount;
    },

    profitFor(item, actualSellAmount = null) {
        const sellAmount = actualSellAmount !== null ? actualSellAmount : item.sellAmount;
        const cost = this.calcCostInGold(item.talerCost, item.buyAmount);
        const grossRevenue = item.resaleGold * sellAmount;
        const revenue = grossRevenue * app.getFeeMultiplier();
        const profit = revenue - cost;
        const pct = cost === 0 ? 0 : (profit / cost) * 100;
        return { cost, profit, pct, revenue, sellAmount };
    },

    calculateBreakEven(item) {
        const resaleNet = item.resaleGold * app.getFeeMultiplier();
        if (resaleNet <= 0 || item.talerCost <= 0) {
            return { breakEvenAmount: 0, isProfitable: false };
        }

        const totalCost = this.calcCostInGold(item.talerCost, item.buyAmount);
        const breakEvenAmount = Math.ceil(totalCost / resaleNet);
        const isProfitable = breakEvenAmount <= item.buyAmount;

        return { breakEvenAmount, isProfitable };
    },

    highlightText(text, search) {
        if (!search) return text;
        const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    },

    formatNumberWithDots(number) {
        return Number(number || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },

    async saveCategory(category) {
        await Database.saveData(Database.STORES.TALER_ITEMS, category, this.data[category]);
    },

    async loadCollapsedStates() {
        const states = await Database.loadData(Database.STORES.SETTINGS, 'collapsedTalerCategories');
        this.collapsedCategories = states || {};
    },

    async saveCollapsedStates() {
        await Database.saveData(Database.STORES.SETTINGS, 'collapsedTalerCategories', this.collapsedCategories);
    },

    async collapseAllCategories() {
        for (const category of Object.keys(this.data)) {
            this.collapsedCategories[category] = true;
        }
        await this.saveCollapsedStates();
        this.renderAllCategories();
    },

    async expandAllCategories() {
        for (const category of Object.keys(this.data)) {
            this.collapsedCategories[category] = false;
        }
        await this.saveCollapsedStates();
        this.renderAllCategories();
    },

    async updateItem(category, id, field, value) {
        const item = this.data[category].find(item => item.id === id);
        if (item) {
            item[field] = value;
            if (field === 'resaleGold') {
                app.recordPriceHistory(item, value);
            }
            this.updateItemRow(category, item);
            await this.saveCategory(category);

            if (item.isFavorite) {
                favorites.updateDisplay();
            }
            app.updateKpis();
            app.updateCompareOptions();
        }
    },

    updateItemRow(category, item) {
        const row = document.getElementById(`taler-${category}-${item.id}`);
        if (!row) return;

        const sellAmountInput = row.querySelector('.sell-amount');
        const currentSellAmount = sellAmountInput ? parseInt(sellAmountInput.value) || item.sellAmount : item.sellAmount;
        const { cost, profit, pct, revenue } = this.profitFor(item, currentSellAmount);
        const { breakEvenAmount, isProfitable } = this.calculateBreakEven(item);

        const costCell = row.querySelector('.cost-cell');
        const revenueCell = row.querySelector('.revenue-cell');
        const profitCell = row.querySelector('.profit-cell');
        const breakEvenCell = row.querySelector('.break-even-cell');
        const favoriteStar = row.querySelector('.favorite-star');
        const trendCell = row.querySelector('.trend-cell');

        if (costCell) costCell.textContent = this.formatNumberWithDots(cost);
        if (revenueCell) revenueCell.textContent = this.formatNumberWithDots(revenue);

        if (profitCell) {
            if (item.resaleGold > 0) {
                profitCell.textContent = `${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)`;
                profitCell.className = `profit-cell ${profit >= 0 ? 'profit-positive' : 'profit-negative'}`;
            } else {
                profitCell.textContent = '-';
                profitCell.className = 'profit-cell';
            }
        }

        if (breakEvenCell) {
            if (item.resaleGold > 0 && item.talerCost > 0) {
                if (isProfitable) {
                    breakEvenCell.innerHTML = `<span class="badge">Ab ${breakEvenAmount}</span>`;
                } else {
                    breakEvenCell.innerHTML = `<span class="badge loss">Nötig ${breakEvenAmount}</span>`;
                }
            } else {
                breakEvenCell.textContent = '-';
            }
        }

        if (trendCell) {
            trendCell.innerHTML = this.renderTrend(item);
        }

        if (favoriteStar) {
            favoriteStar.className = `favorite-star ${item.isFavorite ? 'favorited' : ''}`;
            favoriteStar.textContent = item.isFavorite ? '★' : '☆';
        }
    },

    renderTrend(item) {
        const values = app.getHistoryValues(item).slice(-10);
        const labels = values.slice(-7).map(value => this.formatNumberWithDots(value)).join(', ');
        return `
            <div class="sparkline">
                ${app.buildSparkline(values)}
                <div class="sparkline-values">${labels || '-'}</div>
            </div>
        `;
    },

    updateAllCalculations() {
        for (const [category, items] of Object.entries(this.data)) {
            for (const item of items) {
                this.updateItemRow(category, item);
            }
        }
        favorites.updateDisplay();
        app.updateKpis();
        app.updateCompareOptions();
    },

    async toggleFavorite(category, id) {
        const item = this.data[category].find(item => item.id === id);
        if (item) {
            item.isFavorite = !item.isFavorite;
            this.updateItemRow(category, item);
            favorites.updateDisplay();
            await this.saveCategory(category);
        }
    },

    async deleteItem(category, id) {
        if (confirm('Möchtest du dieses Item wirklich löschen?')) {
            this.data[category] = this.data[category].filter(item => item.id !== id);
            this.renderCategory(category);
            favorites.updateDisplay();
            await this.saveCategory(category);
            app.updateCompareOptions();
        }
    },

    async deleteCategory(category) {
        if (confirm(`Möchtest du die Kategorie "${category}" wirklich löschen?`)) {
            delete this.data[category];
            await Database.deleteData(Database.STORES.TALER_ITEMS, category);
            this.renderAllCategories();
            app.updateCompareOptions();
        }
    },

    async addNewItem(category) {
        const newItem = {
            id: this.nextItemId++,
            name: 'Neues Taler Item',
            talerCost: 0,
            resaleGold: 0,
            buyAmount: 0,
            sellAmount: 0,
            isFavorite: false,
            favoriteGroup: '',
            priceHistory: []
        };

        this.data[category].push(newItem);
        this.renderCategory(category);
        await this.saveCategory(category);
        app.updateCompareOptions();

        setTimeout(() => {
            const nameInput = document.getElementById(`taler-${category}-${newItem.id}`)?.querySelector('.item-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }, 100);
    },

    async addNewCategory() {
        const categoryName = prompt('Name der neuen Kategorie:');
        if (categoryName && categoryName.trim() !== '') {
            this.data[categoryName] = [];
            await this.saveCategory(categoryName);
            this.renderAllCategories();
            app.updateCompareOptions();
        }
    },

    toggleCategory(category) {
        this.collapsedCategories[category] = !this.collapsedCategories[category];
        const content = document.getElementById(`content-taler-${category}`);
        const icon = document.getElementById(`icon-taler-${category}`);

        if (this.collapsedCategories[category]) {
            content.classList.add('hidden');
            icon.textContent = '+';
        } else {
            content.classList.remove('hidden');
            icon.textContent = '-';
        }
        this.saveCollapsedStates();
    },

    renderCategory(category) {
        const container = document.getElementById(`tbody-taler-${category}`);
        if (!container) return;

        container.innerHTML = '';
        let filteredItems = [...this.data[category]];

        filteredItems = filteredItems.filter(item => app.itemMatchesFilter(item, true));

        const sortedItems = filteredItems.sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return 0;
        });

        sortedItems.forEach(item => {
            const { cost, profit, pct, revenue } = this.profitFor(item);
            const { breakEvenAmount, isProfitable } = this.calculateBreakEven(item);

            const row = document.createElement('tr');
            row.id = `taler-${category}-${item.id}`;

            row.innerHTML = `
                <td><span class="favorite-star ${item.isFavorite ? 'favorited' : ''}" onclick="talerCalculator.toggleFavorite('${category}', ${item.id})">${item.isFavorite ? '★' : '☆'}</span></td>
                <td>
                    <input class="item-name" value="${item.name}">
                </td>
                <td><input type="number" min="0" class="buy-amount" value="${item.buyAmount}"></td>
                <td><input type="number" min="0" class="taler-cost" value="${item.talerCost}"></td>
                <td class="cost-cell">${this.formatNumberWithDots(cost)}</td>
                <td><input type="number" min="0" max="${item.buyAmount}" class="sell-amount" value="${item.sellAmount}"></td>
                <td><input type="text" class="resale-gold" value="${this.formatNumberWithDots(item.resaleGold)}"></td>
                <td class="revenue-cell">${this.formatNumberWithDots(revenue)}</td>
                <td class="trend-cell">${this.renderTrend(item)}</td>
                <td class="profit-cell ${item.resaleGold > 0 ? (profit >= 0 ? 'profit-positive' : 'profit-negative') : ''}">
                    ${item.resaleGold > 0 ? `${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)` : '-'}
                </td>
                <td class="break-even-cell">
                    ${item.resaleGold > 0 && item.talerCost > 0 ? (isProfitable ? `<span class="badge">Ab ${breakEvenAmount}</span>` : `<span class="badge loss">Nötig ${breakEvenAmount}</span>`) : '-'}
                </td>
                <td><button class="btn small" onclick="talerCalculator.deleteItem('${category}', ${item.id})">Löschen</button></td>
            `;

            container.appendChild(row);

            const nameInput = row.querySelector('.item-name');
            const buyAmountInput = row.querySelector('.buy-amount');
            const sellAmountInput = row.querySelector('.sell-amount');
            const talerCostInput = row.querySelector('.taler-cost');
            const resaleGoldInput = row.querySelector('.resale-gold');

            nameInput.addEventListener('input', (e) => {
                this.updateItem(category, item.id, 'name', e.target.value);
            });

            buyAmountInput.addEventListener('input', (e) => {
                const newAmount = parseInt(e.target.value) || 0;
                this.updateItem(category, item.id, 'buyAmount', newAmount);

                if (sellAmountInput) {
                    sellAmountInput.max = newAmount;
                    if (parseInt(sellAmountInput.value) > newAmount) {
                        sellAmountInput.value = newAmount;
                        this.updateItem(category, item.id, 'sellAmount', newAmount);
                    }
                }
            });

            sellAmountInput.addEventListener('input', (e) => {
                const newSellAmount = parseInt(e.target.value) || 0;
                if (newSellAmount > item.buyAmount) {
                    e.target.value = item.buyAmount;
                }
                this.updateItem(category, item.id, 'sellAmount', parseInt(e.target.value) || 0);
            });

            talerCostInput.addEventListener('input', (e) => {
                this.updateItem(category, item.id, 'talerCost', parseInt(e.target.value) || 0);
            });

            resaleGoldInput.addEventListener('input', (e) => {
                const rawValue = e.target.value.replace(/\./g, '');
                const value = parseInt(rawValue) || 0;
                if (!isNaN(value)) {
                    this.updateItem(category, item.id, 'resaleGold', value);
                    e.target.value = this.formatNumberWithDots(value);
                }
            });

            talerCostInput.addEventListener('blur', (e) => {
                const value = parseInt(e.target.value) || 0;
                e.target.value = this.formatNumberWithDots(value);
            });

            talerCostInput.addEventListener('focus', (e) => {
                e.target.value = e.target.value.replace(/\./g, '');
            });

            resaleGoldInput.addEventListener('focus', (e) => {
                e.target.value = e.target.value.replace(/\./g, '');
            });
        });
    },

    renderAllCategories() {
        const container = document.getElementById('taler-items-container');
        container.innerHTML = '';

        for (const [category, items] of Object.entries(this.data)) {
            if (app.searchTerm) {
                const hasMatch = items.some(item => app.itemMatchesFilter(item, true));
                if (hasMatch) {
                    this.collapsedCategories[category] = false;
                }
            }
            const section = document.createElement('section');
            const key = `taler-${category}`;

            section.innerHTML = `
                <div class="category-header" onclick="talerCalculator.toggleCategory('${category}')">
                    <div class="header-row">
                        <strong>${category}</strong>
                        <span class="badge">${this.formatNumberWithDots(items.length)} Items</span>
                        <span id="icon-${key}" class="badge">${this.collapsedCategories[category] ? '+' : '-'}</span>
                    </div>
                    <div class="header-actions">
                        <button class="btn small" onclick="event.stopPropagation(); talerCalculator.addNewItem('${category}')">+ Item</button>
                        <button class="btn small" onclick="event.stopPropagation(); talerCalculator.deleteCategory('${category}')">Löschen</button>
                    </div>
                </div>
                <div id="content-${key}" class="category-content ${this.collapsedCategories[category] ? 'hidden' : ''}">
                    <div class="panel">
                        <table>
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Item</th>
                                    <th>Einkauf</th>
                                    <th>Taler</th>
                                    <th>Kosten</th>
                                    <th>Verkauf</th>
                                    <th>Preis</th>
                                    <th>Erlös</th>
                                    <th>Trend</th>
                                    <th>Profit</th>
                                    <th>Schwelle</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody id="tbody-taler-${category}"></tbody>
                        </table>
                    </div>
                </div>
            `;

            container.appendChild(section);
            this.renderCategory(category);
        }
    },

    async importRows(rows) {
        rows.forEach(row => {
            const category = (row.category || 'Import').trim();
            if (!this.data[category]) {
                this.data[category] = [];
            }
            const item = {
                id: this.nextItemId++,
                name: row.name || 'Import Item',
                talerCost: parseInt(row.talerCost) || 0,
                resaleGold: parseInt(row.resaleGold) || 0,
                buyAmount: parseInt(row.buyAmount) || 1,
                sellAmount: parseInt(row.sellAmount) || parseInt(row.buyAmount) || 1,
                isFavorite: row.isFavorite === '1',
                favoriteGroup: row.favoriteGroup || '',
                priceHistory: []
            };
            this.data[category].push(item);
        });

        for (const category of Object.keys(this.data)) {
            await this.saveCategory(category);
        }
        this.renderAllCategories();
        app.updateCompareOptions();
    }
};


