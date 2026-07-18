import os
from flask import Flask, jsonify, request, send_from_directory
import db

app = Flask(__name__, static_folder='../frontend', static_url_path='')

# Initialize Database on startup
db_initialized = db.init_db()

# Enable CORS for local file preview and alternative port testing
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,PATCH,OPTIONS'
    return response

# Handle preflight OPTIONS requests globally so PATCH/PUT are allowed cross-origin
@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return jsonify({}), 200

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# Serve static assets (js, css, etc.)
@app.route('/<path:path>')
def serve_static(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

# Health Check / DB Status endpoint
@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        'status': 'online',
        'database_initialized': db_initialized
    })

# --- MAIN INGREDIENTS API ---

@app.route('/api/ingredients', methods=['GET'])
def api_get_ingredients():
    try:
        ingredients = db.get_all_ingredients()
        # Convert decimal fields to floats for JSON serialization
        for ing in ingredients:
            ing['weight_gm'] = float(ing['weight_gm'])
            ing['amount'] = float(ing['amount'])
            ing['weight_per_gm'] = float(ing['weight_per_gm'])
        return jsonify(ingredients)
    except Exception as e:
        return jsonify({'error': f"Failed to retrieve ingredients: {e}"}), 500

@app.route('/api/ingredients', methods=['POST'])
def api_add_ingredient():
    data = request.get_json() or {}
    category = data.get('category', '').strip()
    item = data.get('item', '').strip()
    weight_gm = data.get('weight_gm')
    amount = data.get('amount')
    
    # Validation
    if not category:
        return jsonify({'error': 'Category is required.'}), 400
    if not item:
        return jsonify({'error': 'Item is required.'}), 400
        
    try:
        weight_gm = float(weight_gm)
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({'error': 'Weight and Amount must be valid numbers.'}), 400
        
    if weight_gm <= 0:
        return jsonify({'error': 'Weight must be greater than zero.'}), 400
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than zero.'}), 400
        
    try:
        success, message = db.add_ingredient(category, item, weight_gm, amount)
        if success:
            return jsonify({'message': message}), 201
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/ingredients/<int:ingredient_id>', methods=['PUT'])
def api_update_ingredient(ingredient_id):
    data = request.get_json() or {}
    category = data.get('category', '').strip()
    item = data.get('item', '').strip()
    weight_gm = data.get('weight_gm')
    amount = data.get('amount')
    
    # Validation
    if not category:
        return jsonify({'error': 'Category is required.'}), 400
    if not item:
        return jsonify({'error': 'Item is required.'}), 400
        
    try:
        weight_gm = float(weight_gm)
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({'error': 'Weight and Amount must be valid numbers.'}), 400
        
    if weight_gm <= 0:
        return jsonify({'error': 'Weight must be greater than zero.'}), 400
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than zero.'}), 400
        
    try:
        success, message = db.update_ingredient(ingredient_id, category, item, weight_gm, amount)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/ingredients/<int:ingredient_id>', methods=['DELETE'])
def api_delete_ingredient(ingredient_id):
    try:
        success, message = db.delete_ingredient(ingredient_id)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

# --- RECIPES API ---

@app.route('/api/recipes', methods=['GET'])
def api_get_recipes():
    try:
        recipes = db.get_all_recipes()
        return jsonify(recipes)
    except Exception as e:
        return jsonify({'error': f"Failed to retrieve recipes: {e}"}), 500

@app.route('/api/pricing', methods=['GET'])
def api_get_pricing():
    try:
        summary = db.get_recipe_cost_summary()
        return jsonify(summary)
    except Exception as e:
        return jsonify({'error': f"Failed to retrieve pricing summary: {e}"}), 500

@app.route('/api/selling-rates', methods=['GET'])
def api_get_selling_rates():
    try:
        rates = db.get_all_selling_rates()
        return jsonify(rates)
    except Exception as e:
        return jsonify({'error': f"Failed to retrieve selling rates: {e}"}), 500

@app.route('/api/selling-rates/<int:recipe_id>', methods=['PUT'])
def api_upsert_selling_rate(recipe_id):
    data = request.get_json() or {}
    try:
        rate = float(data.get('rate', 0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Rate must be a valid number.'}), 400
    if rate < 0:
        return jsonify({'error': 'Rate cannot be negative.'}), 400
    try:
        success, message = db.upsert_selling_rate(recipe_id, rate)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipes', methods=['POST'])
def api_create_recipe():
    data = request.get_json() or {}
    recipe_name = data.get('recipe_name', '').strip()
    
    if not recipe_name:
        return jsonify({'error': 'Recipe name is required.'}), 400
        
    try:
        success, result = db.create_recipe(recipe_name)
        if success:
            return jsonify({'message': 'Recipe created successfully.', 'recipe_id': result}), 201
        else:
            return jsonify({'error': result}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipes/<int:recipe_id>', methods=['GET'])
def api_get_recipe_details(recipe_id):
    try:
        recipe = db.get_recipe_by_id(recipe_id)
        if not recipe:
            return jsonify({'error': 'Recipe not found.'}), 404
        return jsonify(recipe)
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipes/<int:recipe_id>', methods=['DELETE'])
def api_delete_recipe(recipe_id):
    try:
        success, message = db.delete_recipe(recipe_id)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipes/<int:recipe_id>', methods=['PATCH'])
def api_rename_recipe(recipe_id):
    data = request.get_json() or {}
    recipe_name = data.get('recipe_name', '').strip()
    if not recipe_name:
        return jsonify({'error': 'Recipe name is required.'}), 400
    try:
        success, message = db.update_recipe(recipe_id, recipe_name)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

# --- RECIPE ITEMS API ---

@app.route('/api/recipes/<int:recipe_id>/items', methods=['GET'])
def api_get_recipe_items(recipe_id):
    try:
        items = db.get_recipe_items(recipe_id)
        for item in items:
            item['weight'] = float(item['weight'])
            item['amount'] = float(item['amount'])
            if item.get('current_weight_per_gm') is not None:
                item['current_weight_per_gm'] = float(item['current_weight_per_gm'])
        return jsonify(items)
    except Exception as e:
        return jsonify({'error': f"Failed to retrieve recipe items: {e}"}), 500

@app.route('/api/recipes/<int:recipe_id>/items', methods=['POST'])
def api_add_recipe_item(recipe_id):
    data = request.get_json() or {}
    category = data.get('category', '').strip()
    item = data.get('item', '').strip()
    weight = data.get('weight')
    
    if not category or not item:
        return jsonify({'error': 'Category and Item must be selected.'}), 400
        
    try:
        weight = float(weight)
    except (TypeError, ValueError):
        return jsonify({'error': 'Weight must be a valid number.'}), 400
        
    if weight <= 0:
        return jsonify({'error': 'Weight must be greater than zero.'}), 400
        
    try:
        success, message = db.add_recipe_item(recipe_id, category, item, weight)
        if success:
            return jsonify({'message': message}), 201
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipe-items/<int:item_id>', methods=['PUT'])
def api_update_recipe_item(item_id):
    data = request.get_json() or {}
    weight = data.get('weight')
    
    try:
        weight = float(weight)
    except (TypeError, ValueError):
        return jsonify({'error': 'Weight must be a valid number.'}), 400
        
    if weight <= 0:
        return jsonify({'error': 'Weight must be greater than zero.'}), 400
        
    try:
        success, message = db.update_recipe_item(item_id, weight)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/recipe-items/<int:item_id>', methods=['DELETE'])
def api_delete_recipe_item(item_id):
    try:
        success, message = db.delete_recipe_item(item_id)
        if success:
            return jsonify({'message': message})
        else:
            return jsonify({'error': message}), 400
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

# --- DROPDOWNS POPULATION API ---

@app.route('/api/categories', methods=['GET'])
def api_get_categories():
    try:
        categories = db.get_distinct_categories()
        return jsonify(categories)
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

@app.route('/api/inventory-items', methods=['GET'])
def api_get_inventory_items():
    category = request.args.get('category', '').strip()
    if not category:
        return jsonify([])
    try:
        items = db.get_items_by_category(category)
        for item in items:
            item['weight_per_gm'] = float(item['weight_per_gm'])
        return jsonify(items)
    except Exception as e:
        return jsonify({'error': f"Server error: {e}"}), 500

if __name__ == '__main__':
    # Start on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
