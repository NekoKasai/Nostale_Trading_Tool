// Items-Umrechner Funktionalität
const itemsCalculator = {
    data: {},
    nextItemId: 2000,
    collapsedCategories: {},

    init(itemsData) {
        this.data = itemsData;
        if (!this.data['Gillion-Rechner']) {
            this.data['Gillion-Rechner'] = [this.createDefaultGillionItem()];
        }
        for (const items of Object.values(this.data)) {
            items.forEach(item => {
                if (item.isGillionCalculator) {
                    item.isFavorite = false;
                    item.favoriteGroup = '';
                    item.priceHistory = item.priceHistory || [];
                    return;
                }
                if (item.sellAmount == null) {
                    item.sellAmount = item.amount;
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

    createDefaultGillionItem() {
        return {
            id: this.nextItemId++,
            name: 'Gillion Verarbeitung',
            gillionPrice: 0,
            cellaOutput: 0,
            cellaPrice: 0,
            cellonCost: 0,
            amount: 0,
            isFavorite: false,
            favoriteGroup: '',
            isGillionCalculator: true,
            priceHistory: []
        };
    },

    profitForItem(item, sellAmount = null) {
        if (item.isGillionCalculator) {
            return this.calculateGillionProfit(item);
        }

        const defaultSellAmount = item.sellAmount == null ? item.amount : item.sellAmount;
        const actualSellAmount = sellAmount !== null ? sellAmount : defaultSellAmount;
        const cost = item.buyPrice * item.amount;
        const grossRevenue = item.sellPrice * actualSellAmount;
        const revenue = grossRevenue * app.getFeeMultiplier();
        const profit = revenue - cost;
        const pct = cost === 0 ? 0 : (profit / cost) * 100;
        return { cost, profit, pct, revenue, sellAmount: actualSellAmount };
    },

    calculateGillionProfit(item) {
        const gillionCost = item.gillionPrice * item.amount;
        const cellonCost = item.cellonCost * item.amount;
        const totalCost = gillionCost + cellonCost;

        const totalCellaOutput = item.cellaOutput * item.amount;
        const grossRevenue = totalCellaOutput * item.cellaPrice;
        const revenue = grossRevenue * app.getFeeMultiplier();

        const profit = revenue - totalCost;
        const pct = totalCost === 0 ? 0 : (profit / totalCost) * 100;

        return {
            cost: totalCost,
            profit,
            pct,
            revenue,
            gillionCost,
            cellonCost,
            totalCellaOutput
        };
    },

    calculateBreakEven(item) {
        if (item.isGillionCalculator) {
            return this.calculateGillionBreakEven(item);
        }

        const sellNet = item.sellPrice * app.getFeeMultiplier();
        if (sellNet <= 0 || item.buyPrice <= 0) {
            return { breakEvenAmount: 0, isProfitable: false };
        }

        const totalCost = item.buyPrice * item.amount;
        const breakEvenAmount = Math.ceil(totalCost / sellNet);
        const isProfitable = breakEvenAmount <= item.amount;

        return { breakEvenAmount, isProfitable };
    },

    calculateGillionBreakEven(item) {
        if (item.cellaPrice <= 0 || item.gillionPrice <= 0 || item.cellaOutput <= 0) {
            return { breakEvenAmount: 0, isProfitable: false };
        }

        const costPerGillion = item.gillionPrice + item.cellonCost;
        const revenuePerGillion = item.cellaOutput * item.cellaPrice * app.getFeeMultiplier();
        const profitPerGillion = revenuePerGillion - costPerGillion;

        if (profitPerGillion < 0) {
            return { breakEvenAmount: Infinity, isProfitable: false };
        }

        return { breakEvenAmount: 1, isProfitable: true };
    },

    highlightText(text, search) {
        if (!search) return text;
        const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    },

    formatNumberWithDots(number) {
        return Number(number || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    },

    formatDecimal(number) {
        return number.toString().replace('.', ',');
    },

    async saveCategory(category) {
        await Database.saveData(Database.STORES.ITEMS_DATA, category, this.data[category]);
    },

    async loadCollapsedStates() {
        const states = await Database.loadData(Database.STORES.SETTINGS, 'collapsedItemsCategories');
        this.collapsedCategories = states || {};
    },

    async saveCollapsedStates() {
        await Database.saveData(Database.STORES.SETTINGS, 'collapsedItemsCategories', this.collapsedCategories);
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
            if (item.isGillionCalculator && field === 'cellaOutput') {
                item[field] = parseFloat(value) || 0;
            } else {
                item[field] = value;
            }
            if (field === 'sellPrice' || field === 'cellaPrice') {
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
        const row = document.getElementById(`item-${category}-${item.id}`);
        if (!row) return;

        if (item.isGillionCalculator) {
            this.updateGillionRow(category, item, row);
            return;
        }

        const sellAmountInput = row.querySelector('.sell-amount');
        const fallbackSellAmount = item.sellAmount == null ? item.amount : item.sellAmount;
        const currentSellAmount = sellAmountInput ? parseInt(sellAmountInput.value) || fallbackSellAmount : fallbackSellAmount;
        const { cost, profit, pct, revenue } = this.profitForItem(item, currentSellAmount);
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
            if (item.sellPrice > 0) {
                profitCell.textContent = `${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)`;
                profitCell.className = `profit-cell ${profit >= 0 ? 'profit-positive' : 'profit-negative'}`;
            } else {
                profitCell.textContent = '-';
                profitCell.className = 'profit-cell';
            }
        }

        if (breakEvenCell) {
            if (item.sellPrice > 0 && item.buyPrice > 0) {
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

    updateGillionRow(category, item, row) {
        const { cost, profit, pct, revenue, gillionCost, cellonCost, totalCellaOutput } = this.profitForItem(item);
        const { breakEvenAmount, isProfitable } = this.calculateBreakEven(item);

        const gillionCostCell = row.querySelector('.gillion-cost-cell');
        const cellonCostCell = row.querySelector('.cellon-cost-cell');
        const totalCostCell = row.querySelector('.total-cost-cell');
        const cellaOutputCell = row.querySelector('.cella-output-cell');
        const revenueCell = row.querySelector('.revenue-cell');
        const profitCell = row.querySelector('.profit-cell');
        const breakEvenCell = row.querySelector('.break-even-cell');
        const favoriteStar = row.querySelector('.favorite-star');
        const trendCell = row.querySelector('.trend-cell');

        if (gillionCostCell) gillionCostCell.textContent = this.formatNumberWithDots(gillionCost);
        if (cellonCostCell) cellonCostCell.textContent = this.formatNumberWithDots(cellonCost);
        if (totalCostCell) totalCostCell.textContent = this.formatNumberWithDots(cost);
        if (cellaOutputCell) cellaOutputCell.textContent = this.formatDecimal(totalCellaOutput);
        if (revenueCell) revenueCell.textContent = this.formatNumberWithDots(revenue);

        if (profitCell) {
            profitCell.textContent = `${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)`;
            profitCell.className = `profit-cell ${profit >= 0 ? 'profit-positive' : 'profit-negative'}`;
        }

        if (breakEvenCell) {
            if (isProfitable) {
                breakEvenCell.innerHTML = `<span class="badge">Ab ${breakEvenAmount} profitabel</span>`;
            } else {
                breakEvenCell.innerHTML = `<span class="badge loss">Nicht profitabel</span>`;
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
        const item = this.data[category].find(item => item.id === id);
        if (item && item.isGillionCalculator) {
            alert('Der Gillion-Rechner kann nicht gelöscht werden!');
            return;
        }

        if (confirm('Möchtest du dieses Item wirklich löschen?')) {
            this.data[category] = this.data[category].filter(item => item.id !== id);
            this.renderCategory(category);
            favorites.updateDisplay();
            await this.saveCategory(category);
            app.updateCompareOptions();
        }
    },

    async deleteCategory(category) {
        if (category === 'Gillion-Rechner') {
            alert('Die Gillion-Rechner Kategorie kann nicht gelöscht werden!');
            return;
        }

        if (confirm(`Möchtest du die Kategorie "${category}" wirklich löschen?`)) {
            delete this.data[category];
            await Database.deleteData(Database.STORES.ITEMS_DATA, category);
            this.renderAllCategories();
            app.updateCompareOptions();
        }
    },

    async addNewItem(category) {
        if (category === 'Gillion-Rechner') {
            alert('Im Gillion-Rechner können keine weiteren Items hinzugefügt werden!');
            return;
        }

        const newItem = {
            id: this.nextItemId++,
            name: 'Neues Item',
            buyPrice: 0,
            sellPrice: 0,
            amount: 0,
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
            const nameInput = document.getElementById(`item-${category}-${newItem.id}`)?.querySelector('.item-name');
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
        const content = document.getElementById(`content-items-${category}`);
        const icon = document.getElementById(`icon-items-${category}`);

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
        const container = document.getElementById(`tbody-items-${category}`);
        if (!container) return;

        container.innerHTML = '';
        let filteredItems = [...this.data[category]];

        filteredItems = filteredItems.filter(item => app.itemMatchesFilter(item, false));

        const sortedItems = filteredItems.sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return 0;
        });

        sortedItems.forEach(item => {
            if (item.isGillionCalculator) {
                this.renderGillionItem(category, item, container);
            } else {
                this.renderNormalItem(category, item, container);
            }
        });
    },

    renderNormalItem(category, item, container) {
        const { cost, profit, pct, revenue } = this.profitForItem(item);
        const { breakEvenAmount, isProfitable } = this.calculateBreakEven(item);

        const row = document.createElement('tr');
        row.id = `item-${category}-${item.id}`;

        row.innerHTML = `
            <td><span class="favorite-star ${item.isFavorite ? 'favorited' : ''}" onclick="itemsCalculator.toggleFavorite('${category}', ${item.id})">${item.isFavorite ? '★' : '☆'}</span></td>
            <td><input class="item-name" value="${item.name}"></td>
            <td><input type="number" min="0" class="buy-amount" value="${item.amount}"></td>
            <td><input type="number" min="0" class="buy-price" value="${item.buyPrice}"></td>
            <td class="cost-cell">${this.formatNumberWithDots(cost)}</td>
            <td><input type="number" min="0" max="${item.amount}" class="sell-amount" value="${item.sellAmount == null ? item.amount : item.sellAmount}"></td>
            <td><input type="text" class="sell-price" value="${this.formatNumberWithDots(item.sellPrice)}"></td>
            <td class="revenue-cell">${this.formatNumberWithDots(revenue)}</td>
            <td class="trend-cell">${this.renderTrend(item)}</td>
            <td class="profit-cell ${item.sellPrice > 0 ? (profit >= 0 ? 'profit-positive' : 'profit-negative') : ''}">
                ${item.sellPrice > 0 ? `${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)` : '-'}
            </td>
            <td class="break-even-cell">
                ${item.sellPrice > 0 && item.buyPrice > 0 ? (isProfitable ? `<span class="badge">Ab ${breakEvenAmount}</span>` : `<span class="badge loss">Nötig ${breakEvenAmount}</span>`) : '-'}
            </td>
            <td><button class="btn small" onclick="itemsCalculator.deleteItem('${category}', ${item.id})">Löschen</button></td>
        `;

        container.appendChild(row);
        this.setupNormalItemEventListeners(category, item, row);
    },

    renderGillionItem(category, item, container) {
        const { cost, profit, pct, revenue, gillionCost, cellonCost, totalCellaOutput } = this.profitForItem(item);
        const { breakEvenAmount, isProfitable } = this.calculateBreakEven(item);

        const row = document.createElement('tr');
        row.id = `item-${category}-${item.id}`;
        row.className = 'gillion-row';

        row.innerHTML = `
            <td><span class="favorite-star ${item.isFavorite ? 'favorited' : ''}" onclick="itemsCalculator.toggleFavorite('${category}', ${item.id})">${item.isFavorite ? '★' : '☆'}</span></td>
            <td><span>${item.name}</span></td>
            <td><input type="number" min="0" class="gillion-amount" value="${item.amount}"></td>
            <td><input type="text" class="gillion-price" value="${this.formatNumberWithDots(item.gillionPrice)}"></td>
            <td class="gillion-cost-cell">${this.formatNumberWithDots(gillionCost)}</td>
            <td><input type="text" class="cellon-cost" value="${this.formatNumberWithDots(item.cellonCost)}"></td>
            <td class="cellon-cost-cell">${this.formatNumberWithDots(cellonCost)}</td>
            <td class="total-cost-cell">${this.formatNumberWithDots(cost)}</td>
            <td><input type="number" step="0.1" class="cella-output" value="${this.formatDecimal(item.cellaOutput)}"></td>
            <td class="cella-output-cell">${this.formatDecimal(totalCellaOutput)}</td>
            <td><input type="text" class="cella-price" value="${this.formatNumberWithDots(item.cellaPrice)}"></td>
            <td class="revenue-cell">${this.formatNumberWithDots(revenue)}</td>
            <td class="trend-cell">${this.renderTrend(item)}</td>
            <td class="profit-cell ${profit >= 0 ? 'profit-positive' : 'profit-negative'}">${this.formatNumberWithDots(profit)} (${pct.toFixed(2)}%)</td>
            <td class="break-even-cell">
                ${isProfitable ? `<span class="badge">Ab ${breakEvenAmount} profitabel</span>` : `<span class="badge loss">Nicht profitabel</span>`}
            </td>
            <td><button class="btn small" disabled>Löschen</button></td>
        `;

        container.appendChild(row);
        this.setupGillionEventListeners(category, item, row);
    },

    setupNormalItemEventListeners(category, item, row) {
        const nameInput = row.querySelector('.item-name');
        const buyAmountInput = row.querySelector('.buy-amount');
        const sellAmountInput = row.querySelector('.sell-amount');
        const buyPriceInput = row.querySelector('.buy-price');
        const sellPriceInput = row.querySelector('.sell-price');

        nameInput.addEventListener('input', (e) => {
            this.updateItem(category, item.id, 'name', e.target.value);
        });

        buyAmountInput.addEventListener('input', (e) => {
            const newAmount = parseInt(e.target.value) || 0;
            this.updateItem(category, item.id, 'amount', newAmount);

            if (sellAmountInput) {
                sellAmountInput.max = newAmount;
                if (parseInt(sellAmountInput.value) > newAmount) {
                    sellAmountInput.value = newAmount;
                    this.updateItem(category, item.id, 'sellAmount', newAmount);
                }
            }
        });

        buyPriceInput.addEventListener('input', (e) => {
            this.updateItem(category, item.id, 'buyPrice', parseInt(e.target.value) || 0);
        });

        sellPriceInput.addEventListener('input', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            if (!isNaN(value)) {
                this.updateItem(category, item.id, 'sellPrice', value);
                e.target.value = this.formatNumberWithDots(value);
            }
        });

        sellAmountInput.addEventListener('input', (e) => {
            const newSellAmount = parseInt(e.target.value) || 0;
            if (newSellAmount > item.amount) {
                e.target.value = item.amount;
            }
            this.updateItem(category, item.id, 'sellAmount', parseInt(e.target.value) || 0);
        });

        buyPriceInput.addEventListener('blur', (e) => {
            const value = parseInt(e.target.value) || 0;
            e.target.value = this.formatNumberWithDots(value);
        });

        buyPriceInput.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/\./g, '');
        });

        sellPriceInput.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/\./g, '');
        });
    },

    setupGillionEventListeners(category, item, row) {
        const amountInput = row.querySelector('.gillion-amount');
        const gillionPriceInput = row.querySelector('.gillion-price');
        const cellonCostInput = row.querySelector('.cellon-cost');
        const cellaOutputInput = row.querySelector('.cella-output');
        const cellaPriceInput = row.querySelector('.cella-price');

        amountInput.addEventListener('input', (e) => {
            this.updateItem(category, item.id, 'amount', parseInt(e.target.value) || 0);
        });

        gillionPriceInput.addEventListener('input', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            if (!isNaN(value)) {
                this.updateItem(category, item.id, 'gillionPrice', value);
                e.target.value = this.formatNumberWithDots(value);
            }
        });

        cellonCostInput.addEventListener('input', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            if (!isNaN(value)) {
                this.updateItem(category, item.id, 'cellonCost', value);
                e.target.value = this.formatNumberWithDots(value);
            }
        });

        cellaOutputInput.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value.replace(',', '.')) || 0;
            this.updateItem(category, item.id, 'cellaOutput', value);
            e.target.value = this.formatDecimal(value);
        });

        cellaPriceInput.addEventListener('input', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            if (!isNaN(value)) {
                this.updateItem(category, item.id, 'cellaPrice', value);
                e.target.value = this.formatNumberWithDots(value);
            }
        });

        gillionPriceInput.addEventListener('blur', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            e.target.value = this.formatNumberWithDots(value);
        });

        gillionPriceInput.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/\./g, '');
        });

        cellonCostInput.addEventListener('blur', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            e.target.value = this.formatNumberWithDots(value);
        });

        cellonCostInput.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/\./g, '');
        });

        cellaPriceInput.addEventListener('blur', (e) => {
            const rawValue = e.target.value.replace(/\./g, '');
            const value = parseInt(rawValue) || 0;
            e.target.value = this.formatNumberWithDots(value);
        });

        cellaPriceInput.addEventListener('focus', (e) => {
            e.target.value = e.target.value.replace(/\./g, '');
        });
    },

    renderAllCategories() {
        const container = document.getElementById('items-container');
        container.innerHTML = '';

        for (const [category, items] of Object.entries(this.data)) {
            if (app.searchTerm) {
                const hasMatch = items.some(item => app.itemMatchesFilter(item, false));
                if (hasMatch) {
                    this.collapsedCategories[category] = false;
                }
            }
            const section = document.createElement('section');
            const key = `items-${category}`;
            const isGillionCategory = category === 'Gillion-Rechner';

            section.innerHTML = `
                <div class="category-header" onclick="itemsCalculator.toggleCategory('${category}')">
                    <div class="header-row">
                        <strong>${category}</strong>
                        <span class="badge">${this.formatNumberWithDots(items.length)} Items</span>
                        <span id="icon-${key}" class="badge">${this.collapsedCategories[category] ? '+' : '-'}</span>
                    </div>
                    <div class="header-actions">
                        ${!isGillionCategory ? `
                            <button class="btn small" onclick="event.stopPropagation(); itemsCalculator.addNewItem('${category}')">+ Item</button>
                            <button class="btn small" onclick="event.stopPropagation(); itemsCalculator.deleteCategory('${category}')">Löschen</button>
                        ` : `
                            <span class="badge">Spezial-Rechner</span>
                        `}
                    </div>
                </div>
                <div id="content-${key}" class="category-content ${this.collapsedCategories[category] ? 'hidden' : ''}">
                    <div class="panel">
                        <table>
                            <thead>
                                <tr>
                                    ${isGillionCategory ? `
                                        <th></th>
                                        <th>Item</th>
                                        <th>Gillion</th>
                                        <th>Preis</th>
                                        <th>Kosten</th>
                                        <th>Cellon</th>
                                        <th>Kosten</th>
                                        <th>Gesamt</th>
                                        <th>Cella</th>
                                        <th>Output</th>
                                        <th>Preis</th>
                                        <th>Erlös</th>
                                        <th>Trend</th>
                                        <th>Profit</th>
                                        <th>Schwelle</th>
                                        <th></th>
                                    ` : `
                                        <th></th>
                                        <th>Item</th>
                                        <th>Einkauf</th>
                                        <th>Preis</th>
                                        <th>Kosten</th>
                                        <th>Verkauf</th>
                                        <th>Preis</th>
                                        <th>Erlös</th>
                                        <th>Trend</th>
                                        <th>Profit</th>
                                        <th>Schwelle</th>
                                        <th></th>
                                    `}
                                </tr>
                            </thead>
                            <tbody id="tbody-items-${category}"></tbody>
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

            const isGillion = row.isGillionCalculator === '1';
            if (isGillion) {
                const gillionItem = {
                    id: this.nextItemId++,
                    name: row.name || 'Gillion Verarbeitung',
                    gillionPrice: parseInt(row.gillionPrice) || 0,
                    cellaOutput: parseFloat(row.cellaOutput) || 0,
                    cellaPrice: parseInt(row.cellaPrice) || 0,
                    cellonCost: parseInt(row.cellonCost) || 0,
                    amount: parseInt(row.amount) || 1,
                    isFavorite: false,
                    favoriteGroup: row.favoriteGroup || '',
                    isGillionCalculator: true,
                    priceHistory: []
                };
                this.data[category].push(gillionItem);
            } else {
                const item = {
                    id: this.nextItemId++,
                    name: row.name || 'Import Item',
                    buyPrice: parseInt(row.buyPrice) || 0,
                    sellPrice: parseInt(row.sellPrice) || 0,
                    amount: parseInt(row.amount) || 1,
                    sellAmount: parseInt(row.sellAmount) || parseInt(row.amount) || 1,
                    isFavorite: row.isFavorite === '1',
                    favoriteGroup: row.favoriteGroup || '',
                    priceHistory: []
                };
                this.data[category].push(item);
            }
        });

        for (const category of Object.keys(this.data)) {
            await this.saveCategory(category);
        }
        this.renderAllCategories();
        app.updateCompareOptions();
    }
};


