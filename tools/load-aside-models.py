import json, os

models_by_provider = {}

# 1. ~/.aside/u/0/models.json
try:
    with open(os.path.expanduser('~/.aside/u/0/models.json')) as f:
        data = json.load(f)
        providers = data.get('providers', {})
        for p_name, p_val in providers.items():
            if p_name not in models_by_provider:
                models_by_provider[p_name] = []
            for m in p_val.get('models', []):
                mid = m.get('id')
                name = m.get('name', mid)
                models_by_provider[p_name].append({'id': mid, 'name': name, 'provider': p_name})
except Exception as e:
    pass

# 2. ~/.aside/u/0/cache/models-catalog.json
try:
    with open(os.path.expanduser('~/.aside/u/0/cache/models-catalog.json')) as f:
        data = json.load(f)
        for p_name, p_val in data.items():
            if p_name not in models_by_provider:
                models_by_provider[p_name] = []
            existing_ids = set(m['id'] for m in models_by_provider[p_name])
            for m in p_val.get('models', []):
                mid = m.get('id')
                if mid not in existing_ids:
                    name = m.get('name', mid)
                    models_by_provider[p_name].append({'id': mid, 'name': name, 'provider': p_name})
except Exception as e:
    pass

# Print stats
total = sum(len(v) for v in models_by_provider.values())
print(f"Total discovered models: {total} across {len(models_by_provider)} providers.")
for p, ms in models_by_provider.items():
    print(f" - {p}: {len(ms)} models")

with open(os.path.expanduser('~/.aside/all_installed_models.json'), 'w') as f:
    json.dump(models_by_provider, f, indent=2)

print("Saved to ~/.aside/all_installed_models.json")
