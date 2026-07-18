import mysql.connector
from mysql.connector import Error

DB_CONFIG = {
    'host': 'mysql-bakes-bakes.l.aivencloud.com',
    'user': 'avnadmin',
    'password': 'AVNS_iHfL6s4unb2hW7CP6B2'
    'port': 24585
}
DB_NAME = 'bakes'

def get_db_connection(with_db=True):
    """
    Establish a connection to the MySQL server.
    If with_db is True, connects directly to the 'bakes' database.
    """
    config = DB_CONFIG.copy()
    if with_db:
        config['database'] = DB_NAME
    return mysql.connector.connect(**config)

def init_db():
    """
    Initializes the database and tables on startup.
    Creates them if they do not exist. Handles errors gracefully.
    """
    try:
        # Step 1: Connect to server without database to check/create it
        conn = get_db_connection(with_db=False)
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        conn.commit()
        cursor.close()
        conn.close()
        
        # Step 2: Connect to the 'bakes' database and create tables
        conn = get_db_connection(with_db=True)
        cursor = conn.cursor()
        
        # Table 1: main_ingredients
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS main_ingredients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sno INT NOT NULL,
                category VARCHAR(255) NOT NULL,
                item VARCHAR(255) NOT NULL,
                weight_gm DECIMAL(12, 4) NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                weight_per_gm DECIMAL(16, 6) NOT NULL,
                UNIQUE KEY unique_cat_item (category, item)
            )
        """)
        
        # Table 2: recipes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recipes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipe_name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Table 3: recipe_items
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recipe_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipe_id INT NOT NULL,
                sno INT NOT NULL,
                category VARCHAR(255) NOT NULL,
                item VARCHAR(255) NOT NULL,
                weight DECIMAL(12, 4) NOT NULL,
                amount DECIMAL(12, 2) NOT NULL,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                UNIQUE KEY unique_recipe_cat_item (recipe_id, category, item)
            )
        """)

        # Table 4: selling_rates
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS selling_rates (
                recipe_id INT PRIMARY KEY,
                rate DECIMAL(12, 2) NOT NULL DEFAULT 0,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        print("Database and tables initialized successfully.")
        return True
    except Error as e:
        print(f"Database initialization failed: {e}")
        return False

# --- MAIN INGREDIENTS CRUD ---

def get_all_ingredients():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM main_ingredients ORDER BY sno ASC")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def get_ingredient_by_id(ingredient_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM main_ingredients WHERE id = %s", (ingredient_id,))
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result

def add_ingredient(category, item, weight_gm, amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Calculate weight_per_gm
        weight_per_gm = amount / weight_gm
        
        # Get next sno
        cursor.execute("SELECT COALESCE(MAX(sno), 0) + 1 FROM main_ingredients")
        next_sno = cursor.fetchone()[0]
        
        # Insert
        cursor.execute("""
            INSERT INTO main_ingredients (sno, category, item, weight_gm, amount, weight_per_gm)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (next_sno, category, item, weight_gm, amount, weight_per_gm))
        
        conn.commit()
        return True, "Ingredient added successfully."
    except Error as e:
        if e.errno == 1062: # Duplicate entry
            return False, f"Ingredient '{item}' already exists in category '{category}'."
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def update_ingredient(ingredient_id, category, item, weight_gm, amount):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get old values first to update recipe items
        cursor.execute("SELECT category, item FROM main_ingredients WHERE id = %s", (ingredient_id,))
        old_val = cursor.fetchone()
        if not old_val:
            return False, "Ingredient not found."
        old_category, old_item = old_val
        
        # Calculate weight_per_gm
        weight_per_gm = amount / weight_gm
        
        # Update main_ingredients
        cursor.execute("""
            UPDATE main_ingredients
            SET category = %s, item = %s, weight_gm = %s, amount = %s, weight_per_gm = %s
            WHERE id = %s
        """, (category, item, weight_gm, amount, weight_per_gm, ingredient_id))
        
        # Propagate changes to recipe_items
        # 1. Update recipe items matching the old category and item with new name/category and calculate new amount
        cursor.execute("""
            UPDATE recipe_items
            SET category = %s, item = %s, amount = weight * %s
            WHERE category = %s AND item = %s
        """, (category, item, weight_per_gm, old_category, old_item))
        
        conn.commit()
        return True, "Ingredient updated successfully."
    except Error as e:
        if e.errno == 1062: # Duplicate entry
            return False, f"An ingredient with item '{item}' already exists in category '{category}'."
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def delete_ingredient(ingredient_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch item to delete
        cursor.execute("SELECT category, item FROM main_ingredients WHERE id = %s", (ingredient_id,))
        val = cursor.fetchone()
        if not val:
            return False, "Ingredient not found."
        category, item = val
        
        # Delete from main_ingredients
        cursor.execute("DELETE FROM main_ingredients WHERE id = %s", (ingredient_id,))
        
        # Also clean up from recipe_items. Since recipe_items does not have a strict foreign key to
        # main_ingredients, we delete recipe items using this specific category and item
        cursor.execute("DELETE FROM recipe_items WHERE category = %s AND item = %s", (category, item))
        
        # Re-sequence sno in main_ingredients
        cursor.execute("SELECT id FROM main_ingredients ORDER BY sno ASC, id ASC")
        rows = cursor.fetchall()
        for idx, (row_id,) in enumerate(rows, start=1):
            cursor.execute("UPDATE main_ingredients SET sno = %s WHERE id = %s", (idx, row_id))
            
        # Re-sequence recipe items for all modified recipes
        cursor.execute("SELECT DISTINCT recipe_id FROM recipe_items")
        recipe_ids = [r[0] for r in cursor.fetchall()]
        for r_id in recipe_ids:
            cursor.execute("SELECT id FROM recipe_items WHERE recipe_id = %s ORDER BY sno ASC, id ASC", (r_id,))
            ritems = cursor.fetchall()
            for idx, (ri_id,) in enumerate(ritems, start=1):
                cursor.execute("UPDATE recipe_items SET sno = %s WHERE id = %s", (idx, ri_id))
        
        conn.commit()
        return True, "Ingredient deleted successfully."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

# --- RECIPES CRUD ---

def get_all_selling_rates():
    """Returns all saved selling rates as a dict {recipe_id: rate}."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT recipe_id, rate FROM selling_rates")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return {row['recipe_id']: float(row['rate']) for row in rows}

def upsert_selling_rate(recipe_id, rate):
    """Insert or update the selling rate for a recipe."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO selling_rates (recipe_id, rate)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE rate = VALUES(rate)
        """, (recipe_id, rate))
        conn.commit()
        return True, "Selling rate saved."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def get_all_recipes():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM recipes ORDER BY recipe_name ASC")
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def get_recipe_cost_summary():
    """Returns all recipes with their pre-calculated total cost and total weight."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT
            r.id,
            r.recipe_name,
            COALESCE(SUM(ri.weight), 0) AS total_weight,
            COALESCE(SUM(ri.amount), 0) AS total_cost
        FROM recipes r
        LEFT JOIN recipe_items ri ON ri.recipe_id = r.id
        GROUP BY r.id, r.recipe_name
        ORDER BY r.recipe_name ASC
    """)
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    # Cast decimals to float for JSON serialisation
    for row in results:
        row['total_weight'] = float(row['total_weight'])
        row['total_cost'] = float(row['total_cost'])
    return results

def get_recipe_by_id(recipe_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM recipes WHERE id = %s", (recipe_id,))
    recipe = cursor.fetchone()
    cursor.close()
    conn.close()
    return recipe

def create_recipe(recipe_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO recipes (recipe_name) VALUES (%s)", (recipe_name,))
        conn.commit()
        recipe_id = cursor.lastrowid
        return True, recipe_id
    except Error as e:
        if e.errno == 1062: # Duplicate entry
            return False, "A recipe with this name already exists."
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def delete_recipe(recipe_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Cascade delete is handled by database FOREIGN KEY constraint, but we run it explicitly to be safe
        cursor.execute("DELETE FROM recipes WHERE id = %s", (recipe_id,))
        conn.commit()
        return True, "Recipe deleted successfully."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def update_recipe(recipe_id, recipe_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check for duplicate name (excluding self)
        cursor.execute(
            "SELECT id FROM recipes WHERE LOWER(recipe_name) = LOWER(%s) AND id != %s",
            (recipe_name, recipe_id)
        )
        if cursor.fetchone():
            return False, "A recipe with this name already exists."
        cursor.execute(
            "UPDATE recipes SET recipe_name = %s WHERE id = %s",
            (recipe_name, recipe_id)
        )
        conn.commit()
        if cursor.rowcount == 0:
            return False, "Recipe not found."
        return True, "Recipe renamed successfully."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

# --- RECIPE ITEMS CRUD ---

def get_recipe_items(recipe_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    # Joining with main_ingredients to also get the latest weight_per_gm
    # Just in case they changed, though we propagate. It's safer.
    cursor.execute("""
        SELECT ri.*, mi.weight_per_gm as current_weight_per_gm
        FROM recipe_items ri
        LEFT JOIN main_ingredients mi ON ri.category = mi.category AND ri.item = mi.item
        WHERE ri.recipe_id = %s
        ORDER BY ri.sno ASC
    """, (recipe_id,))
    results = cursor.fetchall()
    cursor.close()
    conn.close()
    return results

def add_recipe_item(recipe_id, category, item, weight):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get weight_per_gm from main_ingredients
        cursor.execute("SELECT weight_per_gm FROM main_ingredients WHERE category = %s AND item = %s", (category, item))
        res = cursor.fetchone()
        if not res:
            return False, "Selected ingredient does not exist in inventory."
        weight_per_gm = float(res[0])
        
        # Calculate amount
        amount = weight * weight_per_gm
        
        # Get next sno for this recipe
        cursor.execute("SELECT COALESCE(MAX(sno), 0) + 1 FROM recipe_items WHERE recipe_id = %s", (recipe_id,))
        next_sno = cursor.fetchone()[0]
        
        # Insert
        cursor.execute("""
            INSERT INTO recipe_items (recipe_id, sno, category, item, weight, amount)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (recipe_id, next_sno, category, item, weight, amount))
        
        conn.commit()
        return True, "Ingredient added to recipe."
    except Error as e:
        if e.errno == 1062:
            return False, "This ingredient is already in the recipe."
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def update_recipe_item(item_id, weight):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get the item details to retrieve weight_per_gm
        cursor.execute("SELECT recipe_id, category, item FROM recipe_items WHERE id = %s", (item_id,))
        ri = cursor.fetchone()
        if not ri:
            return False, "Recipe item not found."
        recipe_id, category, item = ri
        
        # Fetch weight_per_gm
        cursor.execute("SELECT weight_per_gm FROM main_ingredients WHERE category = %s AND item = %s", (category, item))
        res = cursor.fetchone()
        if not res:
            return False, "Selected ingredient no longer exists in inventory."
        weight_per_gm = float(res[0])
        
        # Recalculate amount
        amount = weight * weight_per_gm
        
        # Update
        cursor.execute("UPDATE recipe_items SET weight = %s, amount = %s WHERE id = %s", (weight, amount, item_id))
        conn.commit()
        return True, "Recipe item updated successfully."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def delete_recipe_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get recipe_id first
        cursor.execute("SELECT recipe_id FROM recipe_items WHERE id = %s", (item_id,))
        res = cursor.fetchone()
        if not res:
            return False, "Recipe item not found."
        recipe_id = res[0]
        
        # Delete
        cursor.execute("DELETE FROM recipe_items WHERE id = %s", (item_id,))
        
        # Re-sequence
        cursor.execute("SELECT id FROM recipe_items WHERE recipe_id = %s ORDER BY sno ASC, id ASC", (recipe_id,))
        rows = cursor.fetchall()
        for idx, (row_id,) in enumerate(rows, start=1):
            cursor.execute("UPDATE recipe_items SET sno = %s WHERE id = %s", (idx, row_id))
            
        conn.commit()
        return True, "Recipe item deleted successfully."
    except Error as e:
        return False, str(e)
    finally:
        cursor.close()
        conn.close()

def get_distinct_categories():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT category FROM main_ingredients ORDER BY category ASC")
    categories = [row[0] for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return categories

def get_items_by_category(category):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT item, weight_per_gm FROM main_ingredients WHERE category = %s ORDER BY item ASC", (category,))
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    return items
