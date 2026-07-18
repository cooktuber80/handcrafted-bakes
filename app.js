// --- Handcrafted Bakes Frontend Application Logic ---

const API_BASE = (window.location.protocol === 'file:' || !window.location.origin.includes('5000'))
    ? 'https://handcrafted-bakes.onrender.com'
    : '/api';

// --- State ---
const state = {
    currentView: 'landing',
    activeRecipeId: null,
    activeRecipeName: '',
    ingredients: [],
    recipes: [],
    recipeItems: [],
    categories: [],
    pricingData: [],          // recipe cost summary rows
    sellingRates: {},         // { recipeId: rateString } — persisted in memory per session
    // For recipe item form dropdown binding
    selectedItemRate: 0,
    // Sorting state
    sortField: null,
    sortAscending: true,
    recipeSortField: null,
    recipeSortAscending: true
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkDatabaseStatus();
    
    // Start at landing page
    switchView('landing');
});

// --- Database Status Check ---
function checkDatabaseStatus() {
    fetch(`${API_BASE}/status`)
        .then(res => res.json())
        .then(data => {
            if (!data.database_initialized) {
                showToast('Warning: Database connection or table initialization failed on server.', 'error');
            }
        })
        .catch(err => {
            console.error('Error connecting to backend:', err);
            showToast('Unable to connect to the backend server.', 'error');
        });
}

// --- View Router ---
function switchView(viewName, recipeId = null) {
    state.currentView = viewName;
    state.activeRecipeId = recipeId;

    // Toggle Sidebar visibility
    const sidebar = document.getElementById('app-sidebar');
    const mainContent = document.getElementById('app-main');
    
    if (viewName === 'landing') {
        sidebar.classList.add('hidden');
        mainContent.classList.add('full-width');
    } else {
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('full-width');
    }

    // Toggle views active class
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Activate sidebar highlights
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    if (viewName === 'ingredients') {
        document.getElementById('view-ingredients').classList.add('active');
        document.getElementById('nav-ingredients').classList.add('active');
        loadIngredients();
    } else if (viewName === 'recipes') {
        document.getElementById('view-recipes').classList.add('active');
        document.getElementById('nav-recipes').classList.add('active');
        loadRecipes();
    } else if (viewName === 'recipe-details') {
        document.getElementById('view-recipe-detail').classList.add('active');
        document.getElementById('nav-recipes').classList.add('active'); // Highlight Recipes in sidebar
        loadRecipeDetails(recipeId);
    } else if (viewName === 'pricing') {
        document.getElementById('view-pricing').classList.add('active');
        document.getElementById('nav-pricing').classList.add('active');
        loadPricing();
    } else if (viewName === 'landing') {
        document.getElementById('view-landing').classList.add('active');
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    // Sidebar Nav
    document.getElementById('nav-ingredients').addEventListener('click', (e) => { e.preventDefault(); switchView('ingredients'); });
    document.getElementById('nav-recipes').addEventListener('click', (e) => { e.preventDefault(); switchView('recipes'); });
    document.getElementById('nav-pricing').addEventListener('click', (e) => { e.preventDefault(); switchView('pricing'); });
    document.getElementById('nav-home').addEventListener('click', (e) => { e.preventDefault(); switchView('landing'); });
    
    // Landing Cards
    document.getElementById('card-ingredients').addEventListener('click', () => switchView('ingredients'));
    document.getElementById('card-recipes').addEventListener('click', () => switchView('recipes'));
    document.getElementById('card-pricing').addEventListener('click', () => switchView('pricing'));

    // Pricing Sheet: Download PDF
    document.getElementById('btn-download-pricing-pdf').addEventListener('click', downloadPricingPDF);
    
    // Main Ingredients Form: Auto Unit Price Preview
    const ingWeightInput = document.getElementById('ing-weight');
    const ingAmountInput = document.getElementById('ing-amount');
    const updateRatePreview = () => {
        const weight = parseFloat(ingWeightInput.value);
        const amount = parseFloat(ingAmountInput.value);
        const preview = document.getElementById('ing-calc-preview-val');
        if (weight > 0 && amount > 0) {
            const rate = amount / weight;
            preview.textContent = `₹${rate.toFixed(4)} / gm`;
        } else {
            preview.textContent = '₹0.0000 / gm';
        }
    };
    ingWeightInput.addEventListener('input', updateRatePreview);
    ingAmountInput.addEventListener('input', updateRatePreview);
    
    // Main Ingredients Form: Submit
    document.getElementById('form-add-ingredient').addEventListener('submit', handleAddIngredientSubmit);
    
    // Inventory search filter
    document.getElementById('inventory-search').addEventListener('input', filterIngredientsTable);
    
    // Download Inventory PDF
    document.getElementById('btn-download-inventory-pdf').addEventListener('click', downloadInventoryPDF);
    
    // Sort inventory by category click listener
    const thCategory = document.getElementById('th-category');
    if (thCategory) {
        thCategory.addEventListener('click', () => {
            toggleCategorySort();
        });
    }
    
    // Sort recipe items by category click listener
    const thRecipeCategory = document.getElementById('th-recipe-category');
    if (thRecipeCategory) {
        thRecipeCategory.addEventListener('click', () => {
            toggleRecipeCategorySort();
        });
    }
    
    // Recipes: Modal triggers
    document.getElementById('btn-trigger-create-recipe').addEventListener('click', () => openModal('modal-create-recipe'));
    document.getElementById('btn-close-create-modal').addEventListener('click', () => closeModal('modal-create-recipe'));
    document.getElementById('btn-cancel-create-modal').addEventListener('click', () => closeModal('modal-create-recipe'));
    document.getElementById('form-create-recipe').addEventListener('submit', handleCreateRecipeSubmit);
    
    // Edit Ingredient Modal close triggers
    document.getElementById('btn-close-edit-modal').addEventListener('click', () => closeModal('modal-edit-ingredient'));
    document.getElementById('btn-cancel-edit-modal').addEventListener('click', () => closeModal('modal-edit-ingredient'));
    document.getElementById('form-edit-ingredient').addEventListener('submit', handleEditIngredientSubmit);
    
    // Edit Ingredient Form auto-calculation preview
    const editIngWeight = document.getElementById('edit-ing-weight');
    const editIngAmount = document.getElementById('edit-ing-amount');
    const updateEditRatePreview = () => {
        const weight = parseFloat(editIngWeight.value);
        const amount = parseFloat(editIngAmount.value);
        const preview = document.getElementById('edit-ing-calc-preview-val');
        if (weight > 0 && amount > 0) {
            const rate = amount / weight;
            preview.textContent = `₹${rate.toFixed(4)} / gm`;
        } else {
            preview.textContent = '₹0.0000 / gm';
        }
    };
    editIngWeight.addEventListener('input', updateEditRatePreview);
    editIngAmount.addEventListener('input', updateEditRatePreview);
    
    // Recipe Detail Page: Back Button, Delete Button, Download PDF & Rename
    document.getElementById('btn-back-to-recipes').addEventListener('click', () => switchView('recipes'));
    document.getElementById('btn-delete-recipe').addEventListener('click', handleDeleteRecipe);
    document.getElementById('btn-download-pdf').addEventListener('click', downloadRecipePDF);
    
    // Recipe title edit/rename controls
    document.getElementById('btn-edit-recipe-title').addEventListener('click', () => {
        const titleEl = document.getElementById('recipe-detail-title');
        const renameForm = document.getElementById('recipe-rename-form');
        const renameInput = document.getElementById('recipe-rename-input');
        renameInput.value = titleEl.textContent.trim();
        renameForm.classList.remove('hidden');
        renameInput.focus();
        renameInput.select();
    });
    document.getElementById('btn-rename-cancel').addEventListener('click', () => {
        document.getElementById('recipe-rename-form').classList.add('hidden');
    });
    document.getElementById('btn-rename-save').addEventListener('click', handleRenameRecipe);
    document.getElementById('recipe-rename-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRenameRecipe();
        if (e.key === 'Escape') document.getElementById('recipe-rename-form').classList.add('hidden');
    });
    
    // Recipe Ingredient Form: Dropdowns binding and calculations
    const rcCategory = document.getElementById('recipe-item-category');
    const rcItem = document.getElementById('recipe-item-name');
    const rcWeight = document.getElementById('recipe-item-weight');
    const rcAmount = document.getElementById('recipe-item-amount');
    const rcRatePreview = document.getElementById('recipe-item-rate-preview');
    const rcSaveBtn = document.getElementById('btn-save-recipe-item');
    
    rcCategory.addEventListener('change', () => {
        const category = rcCategory.value;
        if (category) {
            loadItemsForCategory(category, rcItem, () => {
                rcItem.disabled = false;
                rcItem.value = '';
                rcWeight.disabled = true;
                rcWeight.value = '';
                rcAmount.value = '0.00';
                rcRatePreview.textContent = '₹0.0000 / gm';
                rcSaveBtn.disabled = true;
            });
        }
    });
    
    rcItem.addEventListener('change', () => {
        const itemVal = rcItem.value;
        if (itemVal) {
            // Find selected item in state.categoryItems
            const selectedItem = state.categoryItems.find(i => i.item === itemVal);
            if (selectedItem) {
                state.selectedItemRate = selectedItem.weight_per_gm;
                rcRatePreview.textContent = `₹${state.selectedItemRate.toFixed(4)} / gm`;
                rcWeight.disabled = false;
                rcSaveBtn.disabled = false;
                
                // Trigger recalculation if weight is already entered
                if (rcWeight.value) {
                    const weightVal = parseFloat(rcWeight.value);
                    rcAmount.value = (weightVal * state.selectedItemRate).toFixed(2);
                }
            }
        }
    });
    
    rcWeight.addEventListener('input', () => {
        const weightVal = parseFloat(rcWeight.value);
        if (weightVal > 0 && state.selectedItemRate) {
            rcAmount.value = (weightVal * state.selectedItemRate).toFixed(2);
        } else {
            rcAmount.value = '0.00';
        }
    });
    
    document.getElementById('form-add-recipe-item').addEventListener('submit', handleAddRecipeItemSubmit);
    
    // Edit Recipe Item modal close triggers
    document.getElementById('btn-close-edit-ri-modal').addEventListener('click', () => closeModal('modal-edit-recipe-item'));
    document.getElementById('btn-cancel-edit-ri-modal').addEventListener('click', () => closeModal('modal-edit-recipe-item'));
    document.getElementById('form-edit-recipe-item').addEventListener('submit', handleEditRecipeItemSubmit);
    
    // Edit Recipe Item auto-calc
    const editRiWeight = document.getElementById('edit-ri-weight');
    editRiWeight.addEventListener('input', () => {
        const weightVal = parseFloat(editRiWeight.value);
        const rate = parseFloat(document.getElementById('edit-ri-rate-preview').dataset.rate);
        const amountField = document.getElementById('edit-ri-amount');
        if (weightVal > 0 && rate) {
            amountField.value = (weightVal * rate).toFixed(2);
        } else {
            amountField.value = '0.00';
        }
    });
}

// --- Modal Helper Functions ---
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// --- Toast Helper Function ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <span class="toast-close" style="cursor:pointer;opacity:0.7;">&times;</span>
    `;
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    container.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 4000);
}

// --- View 2: INGREDIENTS MODULE LOGIC ---

function loadIngredients() {
    fetch(`${API_BASE}/ingredients`)
        .then(res => res.json())
        .then(data => {
            state.ingredients = data;
            if (state.sortField === 'category') {
                applyCategorySortOnly();
            }
            renderIngredientsTable(state.ingredients);
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to load ingredients.', 'error');
        });
}

function renderIngredientsTable(data) {
    const tbody = document.querySelector('#table-ingredients tbody');
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-message">No ingredients found. Add one above!</td></tr>`;
        return;
    }
    
    data.forEach((ing) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHTML(ing.category)}</td>
            <td><strong>${escapeHTML(ing.item)}</strong></td>
            <td>${ing.weight_gm.toFixed(2)} gm</td>
            <td>₹${ing.amount.toFixed(2)}</td>
            <td>₹${ing.weight_per_gm.toFixed(4)} / gm</td>
            <td class="actions-cell">
                <button class="btn-table btn-edit" title="Edit Ingredient">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>
                </button>
                <button class="btn-table btn-delete" title="Delete Ingredient">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </td>
        `;
        
        // Add button actions
        tr.querySelector('.btn-edit').addEventListener('click', () => openEditIngredientModal(ing));
        tr.querySelector('.btn-delete').addEventListener('click', () => deleteIngredient(ing));
        
        tbody.appendChild(tr);
    });
}

function filterIngredientsTable() {
    const query = document.getElementById('inventory-search').value.toLowerCase();
    const filtered = state.ingredients.filter(ing => {
        return ing.category.toLowerCase().includes(query) || 
               ing.item.toLowerCase().includes(query);
    });
    renderIngredientsTable(filtered);
}

function handleAddIngredientSubmit(e) {
    e.preventDefault();
    
    const category = document.getElementById('ing-category').value.trim();
    const item = document.getElementById('ing-item').value.trim();
    const weight_gm = parseFloat(document.getElementById('ing-weight').value);
    const amount = parseFloat(document.getElementById('ing-amount').value);
    
    // Frontend Validations
    if (!category || !item) {
        showToast('All fields are required.', 'error');
        return;
    }
    if (weight_gm <= 0) {
        showToast('Weight must be greater than zero.', 'error');
        return;
    }
    if (amount <= 0) {
        showToast('Amount must be greater than zero.', 'error');
        return;
    }
    
    fetch(`${API_BASE}/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, item, weight_gm, amount })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            // Clear inputs
            document.getElementById('form-add-ingredient').reset();
            document.getElementById('ing-calc-preview-val').textContent = '₹0.0000 / gm';
            loadIngredients();
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error adding ingredient.', 'error');
    });
}

function openEditIngredientModal(ing) {
    document.getElementById('edit-ing-id').value = ing.id;
    document.getElementById('edit-ing-category').value = ing.category;
    document.getElementById('edit-ing-item').value = ing.item;
    document.getElementById('edit-ing-weight').value = ing.weight_gm;
    document.getElementById('edit-ing-amount').value = ing.amount;
    
    const rate = ing.amount / ing.weight_gm;
    document.getElementById('edit-ing-calc-preview-val').textContent = `₹${rate.toFixed(4)} / gm`;
    
    openModal('modal-edit-ingredient');
}

function handleEditIngredientSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-ing-id').value;
    const category = document.getElementById('edit-ing-category').value.trim();
    const item = document.getElementById('edit-ing-item').value.trim();
    const weight_gm = parseFloat(document.getElementById('edit-ing-weight').value);
    const amount = parseFloat(document.getElementById('edit-ing-amount').value);
    
    if (!category || !item) {
        showToast('Fields cannot be empty.', 'error');
        return;
    }
    if (weight_gm <= 0) {
        showToast('Weight must be greater than zero.', 'error');
        return;
    }
    if (amount <= 0) {
        showToast('Amount must be greater than zero.', 'error');
        return;
    }
    
    fetch(`${API_BASE}/ingredients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, item, weight_gm, amount })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            closeModal('modal-edit-ingredient');
            loadIngredients();
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error updating ingredient.', 'error');
    });
}

function deleteIngredient(ing) {
    const confirmed = confirm(`Are you sure you want to delete "${ing.item}" from inventory?\nThis will also remove this ingredient from any recipes it's used in.`);
    if (!confirmed) return;
    
    fetch(`${API_BASE}/ingredients/${ing.id}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            loadIngredients();
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error deleting ingredient.', 'error');
    });
}

// --- View 3: RECIPES BOOK MODULE LOGIC ---

function loadRecipes() {
    fetch(`${API_BASE}/recipes`)
        .then(res => res.json())
        .then(data => {
            state.recipes = data;
            renderRecipesGrid(data);
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to load recipes.', 'error');
        });
}

function renderRecipesGrid(data) {
    const grid = document.getElementById('recipes-grid');
    const emptyState = document.getElementById('recipes-empty-state');
    
    grid.innerHTML = '';
    
    if (data.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    data.forEach((recipe) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <h4>${escapeHTML(recipe.recipe_name)}</h4>
            <span class="recipe-card-meta">Created: ${formatDate(recipe.created_at)}</span>
            <div class="recipe-card-action">
                <span>Open Recipe</span> &rarr;
            </div>
        `;
        
        card.addEventListener('click', () => {
            switchView('recipe-details', recipe.id);
        });
        
        grid.appendChild(card);
    });
}

function openCreateRecipeModal() {
    openModal('modal-create-recipe');
}

function handleCreateRecipeSubmit(e) {
    e.preventDefault();
    
    const recipe_name = document.getElementById('new-recipe-name').value.trim();
    const errorEl = document.getElementById('create-recipe-error');
    errorEl.textContent = '';
    
    if (!recipe_name) {
        errorEl.textContent = 'Recipe name is required.';
        return;
    }
    
    fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_name })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            errorEl.textContent = data.error;
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            closeModal('modal-create-recipe');
            document.getElementById('form-create-recipe').reset();
            
            // Navigate directly to the newly created recipe's page
            switchView('recipe-details', data.recipe_id);
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error creating recipe.', 'error');
    });
}

// --- View 4: RECIPE DETAIL LOGIC ---

function loadRecipeDetails(recipeId) {
    // 1. Get Recipe master record details
    fetch(`${API_BASE}/recipes/${recipeId}`)
        .then(res => {
            if (!res.ok) throw new Error('Recipe not found');
            return res.json();
        })
        .then(recipe => {
            state.activeRecipeName = recipe.recipe_name;
            document.getElementById('recipe-detail-title').textContent = recipe.recipe_name;
            document.getElementById('recipe-created-date').textContent = formatDate(recipe.created_at);
            
            // Clear Add Recipe Item Form fields
            document.getElementById('form-add-recipe-item').reset();
            document.getElementById('recipe-item-name').disabled = true;
            document.getElementById('recipe-item-weight').disabled = true;
            document.getElementById('recipe-item-rate-preview').textContent = '₹0.0000 / gm';
            document.getElementById('btn-save-recipe-item').disabled = true;
            
            // 2. Load inventory categories for the dropdown
            loadCategoriesDropdown();
            
            // 3. Load recipe items in this recipe
            loadRecipeItems(recipeId);
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to load recipe details.', 'error');
            switchView('recipes');
        });
}

function loadCategoriesDropdown() {
    fetch(`${API_BASE}/categories`)
        .then(res => res.json())
        .then(data => {
            state.categories = data;
            const select = document.getElementById('recipe-item-category');
            select.innerHTML = '<option value="" disabled selected>Select Category</option>';
            data.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                select.appendChild(opt);
            });
        })
        .catch(err => console.error('Error fetching categories:', err));
}

function loadItemsForCategory(category, targetSelect, callback) {
    fetch(`${API_BASE}/inventory-items?category=${encodeURIComponent(category)}`)
        .then(res => res.json())
        .then(data => {
            state.categoryItems = data;
            targetSelect.innerHTML = '<option value="" disabled selected>Select Item</option>';
            data.forEach(ing => {
                const opt = document.createElement('option');
                opt.value = ing.item;
                opt.textContent = ing.item;
                targetSelect.appendChild(opt);
            });
            if (callback) callback();
        })
        .catch(err => console.error('Error fetching category items:', err));
}

function loadRecipeItems(recipeId) {
    fetch(`${API_BASE}/recipes/${recipeId}/items`)
        .then(res => res.json())
        .then(data => {
            state.recipeItems = data;
            if (state.recipeSortField === 'category') {
                applyRecipeCategorySortOnly();
            }
            renderRecipeItemsTable(state.recipeItems);
        })
        .catch(err => {
            console.error(err);
            showToast('Failed to load recipe ingredients.', 'error');
        });
}

function renderRecipeItemsTable(items) {
    const tbody = document.querySelector('#table-recipe-items tbody');
    const totalCostSpan = document.getElementById('recipe-total-cost');
    const totalWeightSpan = document.getElementById('recipe-total-weight');
    tbody.innerHTML = '';
    
    let totalCost = 0;
    let totalWeight = 0;
    
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-message">No ingredients added to this recipe yet.</td></tr>`;
        totalCostSpan.textContent = '₹0.00';
        totalWeightSpan.textContent = '0.00 gm';
        return;
    }
    
    items.forEach((item) => {
        totalCost += item.amount;
        totalWeight += item.weight;
        
        // Check if item rate matches inventory rate, or if it is mismatched/missing
        let rateWarning = '';
        if (item.current_weight_per_gm === null) {
            rateWarning = '<span class="form-error-msg" style="display:block;font-size:0.75rem;">(Not in Inventory)</span>';
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHTML(item.category)}</td>
            <td><strong>${escapeHTML(item.item)}</strong>${rateWarning}</td>
            <td>${item.weight.toFixed(2)} gm</td>
            <td>₹${item.amount.toFixed(2)}</td>
            <td class="actions-cell">
                <button class="btn-table btn-edit" title="Edit Weight" ${item.current_weight_per_gm === null ? 'disabled' : ''}>
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>
                </button>
                <button class="btn-table btn-delete" title="Delete Ingredient">
                    <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </td>
        `;
        
        tr.querySelector('.btn-edit').addEventListener('click', () => openEditRecipeItemModal(item));
        tr.querySelector('.btn-delete').addEventListener('click', () => deleteRecipeItem(item));
        
        tbody.appendChild(tr);
    });
    
    totalCostSpan.textContent = `₹${totalCost.toFixed(2)}`;
    totalWeightSpan.textContent = `${totalWeight.toFixed(2)} gm`;
}

function handleAddRecipeItemSubmit(e) {
    e.preventDefault();
    
    const category = document.getElementById('recipe-item-category').value;
    const item = document.getElementById('recipe-item-name').value;
    const weight = parseFloat(document.getElementById('recipe-item-weight').value);
    
    if (!category || !item) {
        showToast('Please select Category and Item.', 'error');
        return;
    }
    if (weight <= 0) {
        showToast('Weight must be greater than zero.', 'error');
        return;
    }
    
    fetch(`${API_BASE}/recipes/${state.activeRecipeId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, item, weight })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            loadRecipeDetails(state.activeRecipeId);
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error adding recipe ingredient.', 'error');
    });
}

function openEditRecipeItemModal(item) {
    document.getElementById('edit-ri-id').value = item.id;
    document.getElementById('edit-ri-display-name').value = `${item.category} - ${item.item}`;
    document.getElementById('edit-ri-weight').value = item.weight;
    document.getElementById('edit-ri-amount').value = item.amount.toFixed(2);
    
    const rate = item.current_weight_per_gm || (item.amount / item.weight);
    const ratePreview = document.getElementById('edit-ri-rate-preview');
    ratePreview.textContent = `₹${rate.toFixed(4)} / gm`;
    ratePreview.dataset.rate = rate; // Store rate to use in calculations
    
    openModal('modal-edit-recipe-item');
}

function handleEditRecipeItemSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-ri-id').value;
    const weight = parseFloat(document.getElementById('edit-ri-weight').value);
    
    if (weight <= 0) {
        showToast('Weight must be greater than zero.', 'error');
        return;
    }
    
    fetch(`${API_BASE}/recipe-items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            closeModal('modal-edit-recipe-item');
            loadRecipeItems(state.activeRecipeId);
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error updating weight.', 'error');
    });
}

function deleteRecipeItem(item) {
    const confirmed = confirm(`Remove "${item.item}" from this recipe?`);
    if (!confirmed) return;
    
    fetch(`${API_BASE}/recipe-items/${item.id}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message);
            loadRecipeItems(state.activeRecipeId);
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error removing recipe ingredient.', 'error');
    });
}

function handleDeleteRecipe() {
    const confirmed = confirm(`Are you sure you want to permanently delete the recipe "${state.activeRecipeName}"?\nThis cannot be undone.`);
    if (!confirmed) return;
    
    fetch(`${API_BASE}/recipes/${state.activeRecipeId}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast('Recipe deleted successfully.');
            switchView('recipes');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error deleting recipe.', 'error');
    });
}

// --- General Utility Functions ---

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    // Format to a pretty readable date like: Jul 8, 2026
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// --- PDF Export Utility ---
function downloadRecipePDF() {
    if (state.recipeItems.length === 0) {
        showToast('Cannot download an empty recipe.', 'error');
        return;
    }
    
    showToast('Generating PDF...');
    
    const element = document.createElement('div');
    element.className = 'pdf-export-layout';
    element.innerHTML = `
        <div style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #4A3E3D; background-color: #FAF6F0; border-radius: 16px; border: 1px solid #E8DFD8;">
            <div style="text-align: center; border-bottom: 2px dashed #E8DFD8; padding-bottom: 25px; margin-bottom: 30px;">
                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 2.4rem; margin-bottom: 8px;">Handcrafted Bakes</h1>
                <p style="color: #8E7A75; font-size: 1rem; font-weight: 500;">Home Bakery Inventory & Recipe Formulation</p>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 1.8rem; margin-bottom: 5px;">${escapeHTML(state.activeRecipeName)}</h2>
                <p style="color: #8E7A75; font-size: 0.9rem;">Created on: ${document.getElementById('recipe-created-date').textContent}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 35px; border-radius: 12px; overflow: hidden; border: 1px solid #E8DFD8;">
                <thead>
                    <tr style="background-color: #E8DCC4; color: #6F4E37; text-align: left; font-weight: 600;">
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px;">Category</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px;">Item</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px; text-align: right;">Weight</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.recipeItems.map(item => `
                        <tr style="border-bottom: 1px solid #E8DFD8; background-color: #FFFDFB;">
                            <td style="padding: 14px 18px; font-size: 0.95rem; color: #8E7A75;">${escapeHTML(item.category)}</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; font-weight: 600; color: #4A3E3D;">${escapeHTML(item.item)}</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; text-align: right;">${item.weight.toFixed(2)} gm</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; text-align: right; font-weight: 600; color: #6F4E37;">₹${item.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div style="display: flex; justify-content: flex-end; gap: 15px; flex-wrap: wrap; margin-top: 20px;">
                <div style="font-weight: 700; color: #6F4E37; background-color: #E8DCC4; padding: 10px 20px; border-radius: 10px; font-size: 1rem; box-shadow: 0 4px 6px rgba(111, 78, 55, 0.05);">
                    Total Weight: ${document.getElementById('recipe-total-weight').textContent}
                </div>
                <div style="font-weight: 700; color: #FFFDFB; background-color: #6F4E37; padding: 10px 20px; border-radius: 10px; font-size: 1rem; box-shadow: 0 4px 6px rgba(111, 78, 55, 0.05);">
                    Total Recipe Cost: ${document.getElementById('recipe-total-cost').textContent}
                </div>
            </div>
            
            <div style="margin-top: 70px; text-align: center; border-top: 1px dashed #E8DFD8; padding-top: 20px; color: #8E7A75; font-size: 0.85rem; font-style: italic;">
                Handcrafted Bakes — Wholesome Recipes Made Simple
            </div>
        </div>
    `;
    
    const opt = {
        margin:       15,
        filename:     `recipe_${state.activeRecipeName.toLowerCase().replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Generate PDF and handle download
    html2pdf().set(opt).from(element).save().then(() => {
        showToast('PDF downloaded successfully!');
    }).catch(err => {
        console.error('PDF export error:', err);
        showToast('Failed to generate PDF.', 'error');
    });
}

// --- Inventory PDF Export Utility ---
function downloadInventoryPDF() {
    if (state.ingredients.length === 0) {
        showToast('Cannot download an empty inventory.', 'error');
        return;
    }
    
    showToast('Generating Inventory PDF...');
    
    const element = document.createElement('div');
    element.className = 'pdf-export-layout';
    
    // Filter elements based on active search filter
    const query = document.getElementById('inventory-search').value.toLowerCase();
    const itemsToExport = state.ingredients.filter(ing => {
        return ing.category.toLowerCase().includes(query) || 
               ing.item.toLowerCase().includes(query);
    });
    
    if (itemsToExport.length === 0) {
        showToast('No matching inventory items to export.', 'error');
        return;
    }
    
    element.innerHTML = `
        <div style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #4A3E3D; background-color: #FAF6F0; border-radius: 16px; border: 1px solid #E8DFD8;">
            <div style="text-align: center; border-bottom: 2px dashed #E8DFD8; padding-bottom: 25px; margin-bottom: 30px;">
                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 2.4rem; margin-bottom: 8px;">Handcrafted Bakes</h1>
                <p style="color: #8E7A75; font-size: 1rem; font-weight: 500;">Pantry Inventory Sheet</p>
            </div>
            
            <div style="margin-bottom: 30px;">
                <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 1.8rem; margin-bottom: 5px;">Main Ingredients Stock</h2>
                <p style="color: #8E7A75; font-size: 0.9rem;">As of: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 35px; border-radius: 12px; overflow: hidden; border: 1px solid #E8DFD8;">
                <thead>
                    <tr style="background-color: #E8DCC4; color: #6F4E37; text-align: left; font-weight: 600;">
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px;">Category</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px;">Item</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px; text-align: right;">Weight (gm)</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px; text-align: right;">Amount</th>
                        <th style="padding: 14px 18px; border-bottom: 2px solid #E8DFD8; font-size: 0.9rem; letter-spacing: 0.5px; text-align: right;">Rate / gm</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsToExport.map((item, idx) => `
                        <tr style="border-bottom: 1px solid #E8DFD8; background-color: #FFFDFB;">
                            <td style="padding: 14px 18px; font-size: 0.95rem; color: #8E7A75;">${escapeHTML(item.category)}</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; font-weight: 600; color: #4A3E3D;">${escapeHTML(item.item)}</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; text-align: right;">${item.weight_gm.toFixed(2)} gm</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; text-align: right;">₹${item.amount.toFixed(2)}</td>
                            <td style="padding: 14px 18px; font-size: 0.95rem; text-align: right; font-weight: 600; color: #6F4E37;">₹${item.weight_per_gm.toFixed(4)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div style="display: flex; justify-content: flex-end; gap: 15px; flex-wrap: wrap; margin-top: 20px;">
                <div style="font-weight: 700; color: #6F4E37; background-color: #E8DCC4; padding: 10px 20px; border-radius: 10px; font-size: 1rem; box-shadow: 0 4px 6px rgba(111, 78, 55, 0.05);">
                    Total Items Count: ${itemsToExport.length}
                </div>
            </div>
            
            <div style="margin-top: 70px; text-align: center; border-top: 1px dashed #E8DFD8; padding-top: 20px; color: #8E7A75; font-size: 0.85rem; font-style: italic;">
                Handcrafted Bakes — Wholesome Recipes Made Simple
            </div>
        </div>
    `;
    
    const opt = {
        margin:       15,
        filename:     `inventory_report.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save().then(() => {
        showToast('Inventory PDF downloaded successfully!');
    }).catch(err => {
        console.error('PDF export error:', err);
        showToast('Failed to generate PDF.', 'error');
    });
}

// --- Category Sorting Utilities ---
function toggleCategorySort() {
    if (state.sortField === 'category') {
        state.sortAscending = !state.sortAscending;
    } else {
        state.sortField = 'category';
        state.sortAscending = true;
    }
    
    applyCategorySortOnly();
    
    // Update sort arrow indicator in HTML
    const arrow = document.getElementById('sort-arrow');
    if (arrow) {
        arrow.textContent = state.sortAscending ? ' ▲' : ' ▼';
    }
    
    // Re-render table applying current search filter
    filterIngredientsTable();
}

function applyCategorySortOnly() {
    state.ingredients.sort((a, b) => {
        const catA = a.category.toLowerCase();
        const catB = b.category.toLowerCase();
        if (catA < catB) return state.sortAscending ? -1 : 1;
        if (catA > catB) return state.sortAscending ? 1 : -1;
        
        // Secondary sort by item name
        const itemA = a.item.toLowerCase();
        const itemB = b.item.toLowerCase();
        if (itemA < itemB) return -1;
        if (itemA > itemB) return 1;
        return 0;
    });
}

// --- Recipe Category Sorting Utilities ---
function toggleRecipeCategorySort() {
    if (state.recipeSortField === 'category') {
        state.recipeSortAscending = !state.recipeSortAscending;
    } else {
        state.recipeSortField = 'category';
        state.recipeSortAscending = true;
    }
    
    applyRecipeCategorySortOnly();
    
    // Update sort arrow indicator in HTML
    const arrow = document.getElementById('recipe-sort-arrow');
    if (arrow) {
        arrow.textContent = state.recipeSortAscending ? ' ▲' : ' ▼';
    }
    
    // Re-render table
    renderRecipeItemsTable(state.recipeItems);
}

function applyRecipeCategorySortOnly() {
    state.recipeItems.sort((a, b) => {
        const catA = a.category.toLowerCase();
        const catB = b.category.toLowerCase();
        if (catA < catB) return state.recipeSortAscending ? -1 : 1;
        if (catA > catB) return state.recipeSortAscending ? 1 : -1;
        
        // Secondary sort by item name
        const itemA = a.item.toLowerCase();
        const itemB = b.item.toLowerCase();
        if (itemA < itemB) return -1;
        if (itemA > itemB) return 1;
        return 0;
    });
}

// --- Recipe Rename Handler ---
function handleRenameRecipe() {
    const newName = document.getElementById('recipe-rename-input').value.trim();
    if (!newName) {
        showToast('Recipe name cannot be empty.', 'error');
        return;
    }
    if (newName === state.activeRecipeName) {
        document.getElementById('recipe-rename-form').classList.add('hidden');
        return;
    }
    
    fetch(`${API_BASE}/recipes/${state.activeRecipeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_name: newName })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            // Update state and UI title in place
            state.activeRecipeName = newName;
            document.getElementById('recipe-detail-title').textContent = newName;
            document.getElementById('recipe-rename-form').classList.add('hidden');
            showToast('Recipe renamed successfully.');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Error renaming recipe.', 'error');
    });
}

// ============================================================
// PRICING SHEET
// ============================================================

function loadPricing() {
    // Fetch recipe cost summary and saved selling rates in parallel
    Promise.all([
        fetch(`${API_BASE}/pricing`).then(r => r.json()),
        fetch(`${API_BASE}/selling-rates`).then(r => r.json())
    ])
    .then(([pricingData, ratesData]) => {
        if (pricingData.error) { showToast(pricingData.error, 'error'); return; }
        state.pricingData = pricingData;
        // Merge DB rates into state — keys from API are strings, normalise to int
        const merged = {};
        Object.entries(ratesData).forEach(([k, v]) => { merged[parseInt(k, 10)] = v; });
        state.sellingRates = merged;
        renderPricingTable();
    })
    .catch(err => {
        console.error(err);
        showToast('Failed to load pricing data.', 'error');
    });
}

function renderPricingTable() {
    const tbody = document.querySelector('#table-pricing tbody');
    const rows = state.pricingData;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-message">No recipes found. Create a recipe first.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => {
        const savedRate = state.sellingRates[row.id];
        const hasRate   = savedRate !== undefined && savedRate !== null && savedRate !== '';
        const displayRate = hasRate ? `&#8377;${parseFloat(savedRate).toFixed(2)}` : '<span style="color:var(--text-muted);font-style:italic;">Not set</span>';

        return `
            <tr data-recipe-id="${row.id}">
                <td><strong>${escapeHTML(row.recipe_name)}</strong></td>
                <td style="text-align:right;">${row.total_weight.toFixed(0)} gm</td>
                <td style="text-align:right;">&#8377;${row.total_cost.toFixed(2)}</td>
                <td style="text-align:right; padding-right:12px;">
                    <div class="rate-display-group" id="rate-display-${row.id}">
                        <span class="rate-display-value" id="rate-value-${row.id}">${displayRate}</span>
                        <button class="btn-icon-edit rate-edit-btn" data-id="${row.id}" title="Edit selling rate">
                            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>
                        </button>
                    </div>
                    <div class="rate-edit-group hidden" id="rate-edit-${row.id}">
                        <input
                            type="number"
                            class="selling-rate-input"
                            id="selling-rate-${row.id}"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            value="${hasRate ? parseFloat(savedRate).toFixed(2) : ''}"
                            data-recipe-id="${row.id}"
                            aria-label="Selling rate for ${escapeHTML(row.recipe_name)}"
                        />
                        <button class="btn btn-accent rate-save-btn" data-id="${row.id}" style="padding:6px 14px;font-size:0.85rem;">Save</button>
                        <button class="btn btn-ghost rate-cancel-btn" data-id="${row.id}" style="padding:6px 10px;font-size:0.85rem;">✕</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Wire up edit / save / cancel buttons
    tbody.querySelectorAll('.rate-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            document.getElementById(`rate-display-${id}`).classList.add('hidden');
            document.getElementById(`rate-edit-${id}`).classList.remove('hidden');
            document.getElementById(`selling-rate-${id}`).focus();
        });
    });

    tbody.querySelectorAll('.rate-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            document.getElementById(`rate-display-${id}`).classList.remove('hidden');
            document.getElementById(`rate-edit-${id}`).classList.add('hidden');
        });
    });

    tbody.querySelectorAll('.rate-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveSellingRate(btn.dataset.id));
    });

    // Allow Enter key to save from input
    tbody.querySelectorAll('.selling-rate-input').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveSellingRate(input.dataset.recipeId);
            if (e.key === 'Escape') {
                const id = input.dataset.recipeId;
                document.getElementById(`rate-display-${id}`).classList.remove('hidden');
                document.getElementById(`rate-edit-${id}`).classList.add('hidden');
            }
        });
    });
}

function saveSellingRate(recipeId) {
    const id    = parseInt(recipeId, 10);
    const input = document.getElementById(`selling-rate-${id}`);
    const rate  = parseFloat(input.value);

    if (isNaN(rate) || rate < 0) {
        showToast('Please enter a valid positive number.', 'error');
        return;
    }

    fetch(`${API_BASE}/selling-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            // Update state and switch back to display mode
            state.sellingRates[id] = rate;
            document.getElementById(`rate-value-${id}`).innerHTML = `&#8377;${rate.toFixed(2)}`;
            document.getElementById(`rate-display-${id}`).classList.remove('hidden');
            document.getElementById(`rate-edit-${id}`).classList.add('hidden');
            showToast('Selling rate saved!');
        }
    })
    .catch(err => {
        console.error(err);
        showToast('Failed to save selling rate.', 'error');
    });
}

// --- Pricing Sheet PDF Export ---
function downloadPricingPDF() {
    if (!state.pricingData || state.pricingData.length === 0) {
        showToast('No pricing data to export.', 'error');
        return;
    }

    showToast('Generating Pricing PDF...');

    const element = document.createElement('div');
    element.className = 'pdf-export-layout';

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Calculate totals for the footer summary
    const grandTotalCost = state.pricingData.reduce((sum, r) => sum + r.total_cost, 0);

    element.innerHTML = `
        <div style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #4A3E3D; background-color: #FAF6F0; border-radius: 16px; border: 1px solid #E8DFD8;">

            <!-- Letterhead -->
            <div style="text-align: center; border-bottom: 2px dashed #E8DFD8; padding-bottom: 25px; margin-bottom: 30px;">
                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 2.4rem; margin-bottom: 8px;">Handcrafted Bakes</h1>
                <p style="color: #8E7A75; font-size: 1rem; font-weight: 500;">Pricing Sheet</p>
            </div>

            <!-- Section header -->
            <div style="margin-bottom: 24px;">
                <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #6F4E37; font-size: 1.7rem; margin-bottom: 4px;">Recipe Cost &amp; Selling Rates</h2>
                <p style="color: #8E7A75; font-size: 0.9rem;">As of: ${dateStr}</p>
            </div>

            <!-- Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border-radius: 12px; overflow: hidden; border: 1px solid #E8DFD8;">
                <thead>
                    <tr style="background-color: #E8DCC4; color: #6F4E37; text-align: left; font-weight: 600;">
                        <th style="padding: 13px 16px; border-bottom: 2px solid #E8DFD8; font-size: 0.88rem; letter-spacing: 0.4px;">Recipe Name</th>
                        <th style="padding: 13px 16px; border-bottom: 2px solid #E8DFD8; font-size: 0.88rem; letter-spacing: 0.4px; text-align: right;">Total Weight</th>
                        <th style="padding: 13px 16px; border-bottom: 2px solid #E8DFD8; font-size: 0.88rem; letter-spacing: 0.4px; text-align: right;">Total Cost (&#8377;)</th>
                        <th style="padding: 13px 16px; border-bottom: 2px solid #E8DFD8; font-size: 0.88rem; letter-spacing: 0.4px; text-align: right;">Selling Rate (&#8377;)</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.pricingData.map((row, idx) => {
                        const rate = state.sellingRates[row.id];
                        const rateDisplay = (rate !== undefined && rate !== '') ? `&#8377;${parseFloat(rate).toFixed(2)}` : '&mdash;';
                        const bg = idx % 2 === 0 ? '#FFFDFB' : '#FAF6F0';
                        return `
                            <tr style="border-bottom: 1px solid #E8DFD8; background-color: ${bg};">
                                <td style="padding: 13px 16px; font-size: 0.93rem; font-weight: 600; color: #4A3E3D;">${escapeHTML(row.recipe_name)}</td>
                                <td style="padding: 13px 16px; font-size: 0.93rem; text-align: right; color: #6B5C58;">${row.total_weight.toFixed(0)} gm</td>
                                <td style="padding: 13px 16px; font-size: 0.93rem; text-align: right; font-weight: 600; color: #6F4E37;">&#8377;${row.total_cost.toFixed(2)}</td>
                                <td style="padding: 13px 16px; font-size: 0.93rem; text-align: right; font-weight: 600; color: #4A3E3D;">${rateDisplay}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- Summary badges -->
            <div style="display: flex; justify-content: flex-end; gap: 14px; flex-wrap: wrap; margin-top: 10px;">
                <div style="font-weight: 700; color: #6F4E37; background-color: #E8DCC4; padding: 10px 20px; border-radius: 10px; font-size: 0.95rem; box-shadow: 0 3px 6px rgba(111,78,55,0.07);">
                    Total Recipes: ${state.pricingData.length}
                </div>
            </div>

            <!-- Footer -->
            <div style="margin-top: 60px; text-align: center; border-top: 1px dashed #E8DFD8; padding-top: 18px; color: #8E7A75; font-size: 0.83rem; font-style: italic;">
                Handcrafted Bakes — Wholesome Recipes Made Simple
            </div>
        </div>
    `;

    const opt = {
        margin:       15,
        filename:     `pricing_sheet_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save()
        .then(() => showToast('Pricing PDF downloaded!'))
        .catch(err => {
            console.error('PDF export error:', err);
            showToast('Failed to generate PDF.', 'error');
        });
}
