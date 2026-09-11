def test_user_b_cannot_read_user_a_factory(client, auth_headers_user_a, auth_headers_user_b):
    # 1. User A creates a factory
    create_payload = {
        "name": "Jamnagar Brass Works",
        "industry": "brass_components",
        "city": "Jamnagar",
        "state": "Gujarat",
        "annual_output": 540.0,
    }
    create_res = client.post("/api/v1/factories", json=create_payload, headers=auth_headers_user_a)
    assert create_res.status_code == 201
    factory_data = create_res.json()
    factory_id = factory_data["id"]

    # 2. User A can access the factory
    get_res_a = client.get(f"/api/v1/factories/{factory_id}", headers=auth_headers_user_a)
    assert get_res_a.status_code == 200
    assert get_res_a.json()["name"] == "Jamnagar Brass Works"

    # 3. User B gets 404 on User A's factory (PRD §8.4 & §16.1 rule)
    get_res_b = client.get(f"/api/v1/factories/{factory_id}", headers=auth_headers_user_b)
    assert get_res_b.status_code == 404
    error_body = get_res_b.json()
    assert error_body["error"]["code"] == "FACTORY_NOT_FOUND"

    # 4. User B's factory list does not contain User A's factory
    list_res_b = client.get("/api/v1/factories", headers=auth_headers_user_b)
    assert list_res_b.status_code == 200
    b_factories = list_res_b.json()
    assert all(f["id"] != factory_id for f in b_factories)
