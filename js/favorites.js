// Favoriten-Management
const favorites = {
    init() {
        this.updateDisplay();
    },

    updateDisplay() {
        const favoritesSection = document.getElementById('favorites-section');
        const favoritesTbody = document.getElementById('favorites-tbody');
        const noFavorites = document.getElementById('no-favorites');
        const favoritesCount = document.getElementById('favorites-count');
        const groupFilter = document.getElementById('favorites-group-filter');

        const activeFavorites = this.getFavoritesForTab(tabs.currentTab);
        const groups = Array.from(new Set(activeFavorites.map(item => item.favoriteGroup).filter(Boolean)));
        const activeGroupFilter = tabs.currentTab === 'taler'
            ? app.favoriteGroupFilterTaler
            : app.favoriteGroupFilterItems;

        if (groupFilter) {
            groupFilter.innerHTML = '';
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Alle Items';
            groupFilter.appendChild(allOption);
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                groupFilter.appendChild(option);
            });
            groupFilter.value = activeGroupFilter || 'all';
        }

        const filteredFavorites = activeFavorites.filter(item => {
            if (activeGroupFilter && activeGroupFilter !== 'all') {
                return item.favoriteGroup === activeGroupFilter;
            }
            return true;
        });

        if (filteredFavorites.length > 0) {
            favoritesSection.classList.remove('hidden');
            noFavorites.classList.add('hidden');
            favoritesCount.textContent = `(${filteredFavorites.length})`;
            this.renderFavorites(filteredFavorites, favoritesTbody);
        } else {
            favoritesSection.classList.add('hidden');
            noFavorites.classList.remove('hidden');
            favoritesCount.textContent = '';
        }
    },

    getFavoritesForTab(tabName) {
        const favorites = [];

        if (tabName === 'taler') {
            for (const [category, items] of Object.entries(talerCalculator.data)) {
                for (const item of items) {
                    if (item.isFavorite) {
                        favorites.push({ ...item, category, isTalerItem: true });
                    }
                }
            }
        } else {
            for (const [category, items] of Object.entries(itemsCalculator.data)) {
                for (const item of items) {
                    if (item.isFavorite) {
                        favorites.push({ ...item, category, isTalerItem: false });
                    }
                }
            }
        }

        return favorites;
    },

    renderFavorites(favorites, container) {
        container.innerHTML = '';

        favorites.forEach(item => {
            const { cost, profit, pct } = item.isTalerItem
                ? talerCalculator.profitFor(item)
                : itemsCalculator.profitForItem(item);

            const row = document.createElement('tr');
            row.id = `favorite-${item.isTalerItem ? 'taler' : 'item'}-${item.category}-${item.id}`;

            if (item.isTalerItem) {
                row.innerHTML = this.getTalerFavoriteRow(item, cost, profit, pct);
            } else {
                row.innerHTML = this.getItemFavoriteRow(item, cost, profit, pct);
            }

            container.appendChild(row);
            this.attachFavoriteEventListeners(row, item);
        });
    },

    getTalerFavoriteRow(item, cost, profit, pct) {
        return `
            <td><span class="favorite-star favorited" onclick="talerCalculator.toggleFavorite('${item.category}', ${item.id})">★</span></td>
            <td>
                <div>${talerCalculator.highlightText(item.name, app.searchTerm)}</div>
                <div class="sparkline-values">${item.category}</div>
            </td>
            <td><input type="text" class="favorite-group" value="${item.favoriteGroup || ''}"></td>
            <td><input type="number" min="1" class="buy-amount" value="${item.buyAmount}"></td>
            <td><input type="number" min="0" class="taler-cost" value="${item.talerCost}"></td>
            <td class="cost-cell">${app.formatNumber(cost)}</td>
            <td><input type="number" min="1" class="sell-amount" value="${item.sellAmount}"></td>
            <td><input type="text" class="resale-gold" value="${app.formatNumber(item.resaleGold)}"></td>
            <td class="profit-cell ${item.resaleGold > 0 ? (profit >= 0 ? 'profit-positive' : 'profit-negative') : ''}">
                ${item.resaleGold > 0 ? `${app.formatNumber(profit)} (${pct.toFixed(2)}%)` : '-'}
            </td>
            <td><button class="btn small" onclick="talerCalculator.deleteItem('${item.category}', ${item.id})">Löschen</button></td>
        `;
    },

    getItemFavoriteRow(item, cost, profit, pct) {
        const iconMarkup = item.icon ? `<img class="item-icon" src="${item.icon}" alt="">` : '';
        return `
            <td><span class="favorite-star favorited" onclick="itemsCalculator.toggleFavorite('${item.category}', ${item.id})">★</span></td>
            <td>
                <div class="favorite-name">${iconMarkup}<span>${itemsCalculator.highlightText(item.name, app.searchTerm)}</span></div>
                <div class="sparkline-values">${item.category}</div>
            </td>
            <td><input type="text" class="favorite-group" value="${item.favoriteGroup || ''}"></td>
            <td><input type="number" min="1" class="amount" value="${item.amount}"></td>
            <td><input type="number" min="0" class="buy-price" value="${item.buyPrice}"></td>
            <td class="cost-cell">${app.formatNumber(cost)}</td>
            <td><input type="number" min="1" class="sell-amount" value="${item.sellAmount || item.amount}"></td>
            <td><input type="text" class="sell-price" value="${app.formatNumber(item.sellPrice)}"></td>
            <td class="profit-cell ${item.sellPrice > 0 ? (profit >= 0 ? 'profit-positive' : 'profit-negative') : ''}">
                ${item.sellPrice > 0 ? `${app.formatNumber(profit)} (${pct.toFixed(2)}%)` : '-'}
            </td>
            <td><button class="btn small" onclick="itemsCalculator.deleteItem('${item.category}', ${item.id})">Löschen</button></td>
        `;
    },

    attachFavoriteEventListeners(row, item) {
        const inputs = row.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const fieldMap = {
                    'buy-amount': 'buyAmount',
                    'taler-cost': 'talerCost',
                    'buy-price': 'buyPrice',
                    'sell-amount': 'sellAmount',
                    'resale-gold': 'resaleGold',
                    'sell-price': 'sellPrice',
                    'amount': 'amount',
                    'favorite-group': 'favoriteGroup'
                };

                const className = input.className.split(' ').find(cls => cls in fieldMap);
                const field = fieldMap[className];
                if (!field) return;

                let value = input.type === 'text' ? app.parseNumber(e.target.value) : parseInt(e.target.value);
                if (field === 'favoriteGroup') {
                    value = e.target.value;
                }

                if (field === 'favoriteGroup' || !isNaN(value)) {
                    if (item.isTalerItem) {
                        talerCalculator.updateItem(item.category, item.id, field, value);
                    } else {
                        itemsCalculator.updateItem(item.category, item.id, field, value);
                    }
                }
            });
        });
    }
};

