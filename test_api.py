import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://127.0.0.1:5000/api"

def make_request(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    req_data = json.dumps(data).encode('utf-8') if data else None
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            body = response.read().decode('utf-8')
            return status_code, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        status_code = e.getcode()
        body = e.read().decode('utf-8')
        try:
            return status_code, json.loads(body)
        except Exception:
            return status_code, {"error": body}
    except Exception as e:
        return 0, {"error": str(e)}

def run_tests():
    print("===================================================")
    # 0. Cleanup
    print("0. Cleaning up previous test data...")
    code, ingredients = make_request("/ingredients")
    if code == 200:
        for ing in ingredients:
            if ing["item"].strip().lower() in ["bread flour", "unsalted butter"]:
                make_request(f"/ingredients/{ing['id']}", "DELETE")
                
    code, recipes = make_request("/recipes")
    if code == 200:
        for r in recipes:
            if r["recipe_name"] == "Brioche Bread":
                make_request(f"/recipes/{r['id']}", "DELETE")
    print("   Cleaned.")

    # 1. Check Status
    print("\n1. Testing Server Status...")
    code, res = make_request("/status")
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 200
    assert res.get("status") == "online"
    assert res.get("database_initialized") is True
    print("   [PASS]")

    # 2. Testing Ingredients Listing
    print("\n2. Testing Ingredients Listing...")
    code, ingredients = make_request("/ingredients")
    print(f"   Found {len(ingredients)} initial ingredients.")
    assert code == 200
    print("   [PASS]")

    # 3. Add Ingredient
    print("\n3. Testing Add Ingredient...")
    new_ing = {
        "category": "Flour",
        "item": "Bread Flour",
        "weight_gm": 1000,
        "amount": 4.00
    }
    code, res = make_request("/ingredients", "POST", new_ing)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 201
    assert "message" in res
    print("   [PASS]")

    # 4. Add Another Ingredient (for recipes testing later)
    print("\n4. Testing Add Second Ingredient...")
    new_ing_2 = {
        "category": "Dairy",
        "item": "Unsalted Butter",
        "weight_gm": 500,
        "amount": 6.00
    }
    code, res = make_request("/ingredients", "POST", new_ing_2)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 201
    print("   [PASS]")

    # 5. Add Ingredient Validation (Negative weight)
    print("\n5. Testing Add Ingredient Validation (Negative Weight)...")
    invalid_ing = {
        "category": "Flour",
        "item": "Invalid Flour",
        "weight_gm": -10,
        "amount": 5.00
    }
    code, res = make_request("/ingredients", "POST", invalid_ing)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 400
    assert "error" in res
    print("   [PASS]")

    # 6. Get Ingredients List & Find added ingredient ID
    print("\n6. Listing ingredients and checking calculated weight_per_gm...")
    code, ingredients = make_request("/ingredients")
    print(f"   Total Ingredients: {len(ingredients)}")
    assert code == 200
    bread_flour = next(i for i in ingredients if i["item"] == "Bread Flour")
    unsalted_butter = next(i for i in ingredients if i["item"] == "Unsalted Butter")
    
    print(f"   Bread Flour ID: {bread_flour['id']}, weight_per_gm: {bread_flour['weight_per_gm']}")
    print(f"   Unsalted Butter ID: {unsalted_butter['id']}, weight_per_gm: {unsalted_butter['weight_per_gm']}")
    
    assert bread_flour["weight_per_gm"] == 4.00 / 1000.00  # 0.0040
    assert unsalted_butter["weight_per_gm"] == 6.00 / 500.00  # 0.0120
    print("   [PASS]")

    # 7. Edit Ingredient (Change price of Bread Flour)
    print("\n7. Testing Edit Ingredient (Update Bread Flour)...")
    update_ing = {
        "category": "Flour",
        "item": "Bread Flour",
        "weight_gm": 2000,
        "amount": 10.00  # new rate should be 10 / 2000 = 0.0050
    }
    code, res = make_request(f"/ingredients/{bread_flour['id']}", "PUT", update_ing)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 200
    
    # Verify rate updated
    code, ingredients = make_request("/ingredients")
    bread_flour_updated = next(i for i in ingredients if i["item"] == "Bread Flour")
    print(f"   Updated weight_per_gm: {bread_flour_updated['weight_per_gm']}")
    assert bread_flour_updated["weight_per_gm"] == 0.0050
    print("   [PASS]")

    # 8. Create Recipe
    print("\n8. Testing Create Recipe...")
    recipe_data = {"recipe_name": "Brioche Bread"}
    code, res = make_request("/recipes", "POST", recipe_data)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 201
    recipe_id = res["recipe_id"]
    print("   [PASS]")

    # 9. Create Recipe Validation (Duplicate Recipe Name)
    print("\n9. Testing Create Recipe Duplicate Validation...")
    code, res = make_request("/recipes", "POST", recipe_data)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 400
    assert "error" in res
    print("   [PASS]")

    # 10. Add Item to Recipe (and verify automatic Amount calculation)
    print("\n10. Testing Add Item to Recipe (Bread Flour, 600gm)...")
    recipe_item_data = {
        "category": "Flour",
        "item": "Bread Flour",
        "weight": 600
    }
    code, res = make_request(f"/recipes/{recipe_id}/items", "POST", recipe_item_data)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 201
    print("   [PASS]")

    # 11. Add Second Item to Recipe (Unsalted Butter, 250gm)
    print("\n11. Testing Add Second Item to Recipe (Unsalted Butter, 250gm)...")
    recipe_item_data_2 = {
        "category": "Dairy",
        "item": "Unsalted Butter",
        "weight": 250
    }
    code, res = make_request(f"/recipes/{recipe_id}/items", "POST", recipe_item_data_2)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 201
    print("   [PASS]")

    # 12. Verify Recipe Items Calculations and Total Cost
    print("\n12. Verifying Recipe Items Auto-Calculated Amounts and Total Cost...")
    code, items = make_request(f"/recipes/{recipe_id}/items")
    print(f"   Recipe items count: {len(items)}")
    assert code == 200
    
    item_flour = next(i for i in items if i["item"] == "Bread Flour")
    item_butter = next(i for i in items if i["item"] == "Unsalted Butter")
    
    print(f"   Flour calculated amount: {item_flour['amount']} (Expected: 600 * 0.0050 = 3.00)")
    print(f"   Butter calculated amount: {item_butter['amount']} (Expected: 250 * 0.0120 = 3.00)")
    
    assert item_flour["amount"] == 3.00
    assert item_butter["amount"] == 3.00
    
    total_cost = sum(i["amount"] for i in items)
    print(f"   Total Cost: {total_cost} (Expected: 6.00)")
    assert total_cost == 6.00
    print("   [PASS]")

    # 13. Edit Recipe Item Weight (Change Butter to 300gm)
    print("\n13. Testing Edit Recipe Item Weight (Butter -> 300gm)...")
    update_ri = {"weight": 300}
    code, res = make_request(f"/recipe-items/{item_butter['id']}", "PUT", update_ri)
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 200
    
    # Verify recalculated amount and recipe total cost
    code, items = make_request(f"/recipes/{recipe_id}/items")
    item_butter_updated = next(i for i in items if i["item"] == "Unsalted Butter")
    print(f"   Updated Butter calculated amount: {item_butter_updated['amount']} (Expected: 300 * 0.0120 = 3.60)")
    assert item_butter_updated["amount"] == 3.60
    
    total_cost_updated = sum(i["amount"] for i in items)
    print(f"   New Total Cost: {total_cost_updated} (Expected: 3.00 + 3.60 = 6.60)")
    assert total_cost_updated == 6.60
    print("   [PASS]")

    # 14. Delete Recipe Item
    print("\n14. Testing Delete Recipe Item (Remove Butter)...")
    code, res = make_request(f"/recipe-items/{item_butter['id']}", "DELETE")
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 200
    
    # Verify removal and S.No resequencing
    code, items = make_request(f"/recipes/{recipe_id}/items")
    print(f"   Recipe items count after delete: {len(items)}")
    assert len(items) == 1
    assert items[0]["item"] == "Bread Flour"
    assert items[0]["sno"] == 1  # Resequencing check
    print("   [PASS]")

    # 15. Delete Recipe
    print("\n15. Testing Delete Recipe (Brioche Bread)...")
    code, res = make_request(f"/recipes/{recipe_id}", "DELETE")
    print(f"   Response Code: {code}, Body: {res}")
    assert code == 200
    
    # Verify it is deleted
    code, recipes = make_request("/recipes")
    print(f"   Recipes count: {len(recipes)}")
    assert not any(r["id"] == recipe_id for r in recipes)
    print("   [PASS]")

    # Clean up test data again to leave database clean
    print("\n16. Final Clean up of test items...")
    make_request(f"/ingredients/{bread_flour['id']}", "DELETE")
    print("   Cleaned.")

    print("\n===================================================")
    print("           ALL API TESTS PASSED SUCCESSFULLY!")
    print("===================================================")

if __name__ == "__main__":
    try:
        run_tests()
    except AssertionError as e:
        print("\n[FAIL] Test assertion failed!")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FAIL] Test encountered error: {e}")
        sys.exit(1)
