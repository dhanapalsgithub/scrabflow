DISTRICTS = ["Chennai", "Madurai", "Coimbatore", "Tiruchirappalli", "Salem", "Tirunelveli"]

DEFAULT_SETTINGS = {
    "rates": {"Mixed Paper": 12, "Plastics": 18, "E-Waste": 45, "Metals": 35},
    "platform_name": "ReLoop",
    "support_email": "support@reloop.in",
    "min_pickup_kg": 5,
    "service_districts": DISTRICTS,
    "dispatch_mode": "open",
    "service_fee": 25,
}

SEED_USERS = [
    {"email": "dhanapaul2020@gmail.com", "password": "dhana@123", "role": "admin", "name": "Dhanapaul", "organization": "ReLoop HQ", "district": "Chennai"},
    {"email": "test33@gmail.com", "password": "admin@123", "role": "admin", "name": "Ops Admin", "organization": "ReLoop HQ", "district": "Chennai"},
    {"email": "test29@gmail.com", "password": "public@123", "role": "public", "name": "Priya Raman", "organization": "", "district": "Chennai"},
    {"email": "test30@gmail.com", "password": "cor@123", "role": "corporate", "name": "Arun Kumar", "organization": "GreenTech Industries", "district": "Coimbatore"},
    {"email": "test31@gmail.com", "password": "partner@123", "role": "partner", "name": "Karthik Hub Ops", "organization": "TN Recycle Hubs", "district": "Madurai"},
    {"email": "test32@gmail.com", "password": "delivery@123", "role": "delivery_partner", "name": "Suresh Delivery", "organization": "ReLoop Fleet", "district": "Chennai"},
]

SEED_ZONES = [
    {"zone_id": "Zone A-1", "city": "Chennai", "assigned_hub": "Guindy Hub", "households": 1240, "daily_volume_kg": 860, "status": "Active"},
    {"zone_id": "Zone A-2", "city": "Chennai", "assigned_hub": "Ambattur Hub", "households": 980, "daily_volume_kg": 640, "status": "Active"},
    {"zone_id": "Zone B-1", "city": "Madurai", "assigned_hub": "Anna Nagar Hub", "households": 720, "daily_volume_kg": 410, "status": "Active"},
    {"zone_id": "Zone B-2", "city": "Madurai", "assigned_hub": "Thirunagar Hub", "households": 460, "daily_volume_kg": 260, "status": "Maintenance"},
    {"zone_id": "Zone C-1", "city": "Coimbatore", "assigned_hub": "Peelamedu Hub", "households": 890, "daily_volume_kg": 590, "status": "Active"},
    {"zone_id": "Zone C-2", "city": "Coimbatore", "assigned_hub": "Gandhipuram Hub", "households": 540, "daily_volume_kg": 320, "status": "Active"},
]

SAMPLE_PICKUPS = [
    {"email": "test29@gmail.com", "material": "Mixed Paper", "weight": 18, "unit": "Kg", "district": "Chennai", "address": "12, 3rd Cross, Adyar", "status": "Completed"},
    {"email": "test29@gmail.com", "material": "Plastics", "weight": 9, "unit": "Kg", "district": "Chennai", "address": "12, 3rd Cross, Adyar", "status": "Accepted"},
    {"email": "test29@gmail.com", "material": "E-Waste", "weight": 6, "unit": "Kg", "district": "Chennai", "address": "12, 3rd Cross, Adyar", "status": "Pending"},
    {"email": "test30@gmail.com", "material": "Metals", "weight": 1.2, "unit": "Tons", "district": "Coimbatore", "address": "SIDCO Industrial Estate, Kurichi", "status": "In Progress"},
    {"email": "test30@gmail.com", "material": "Mixed Paper", "weight": 0.5, "unit": "Tons", "district": "Coimbatore", "address": "SIDCO Industrial Estate, Kurichi", "status": "Completed"},
    {"email": "test30@gmail.com", "material": "Plastics", "weight": 240, "unit": "Kg", "district": "Madurai", "address": "Kappalur Industrial Park", "status": "Pending"},
    {"email": "test29@gmail.com", "material": "Metals", "weight": 14, "unit": "Kg", "district": "Chennai", "address": "12, 3rd Cross, Adyar", "status": "Cancelled"},
]
