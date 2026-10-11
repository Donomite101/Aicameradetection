import requests, json

BACKEND = 'http://localhost:3000/api/v1'
H = {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'}

resp = requests.post(f'{BACKEND}/auth/login',
    json={'email': 'officer@sih.gov.in', 'password': 'officer123'},
    headers=H, timeout=10)
data = resp.json()
token = data.get('accessToken', '')
user = data.get('user', {})
centre_id = user.get('centreId', '')
print(f'TOKEN={token}')
print(f'CENTRE_ID={centre_id}')
print(f'STATUS={resp.status_code}')
