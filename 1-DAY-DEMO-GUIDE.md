# SIH26245 - 1 Day Demo Setup Guide
## AI-Based Real-Time Monitoring of Training Centres

---

## 🎯 Goal
Working demo with **real AI models** (YOLOv8n + MediaPipe) on sample video, showing:
- Live person detection & counting
- Pose estimation (sitting/standing)
- Equipment monitoring (simulated but realistic)
- Dashboard with alerts & analytics

---

## ⏱️ Time Budget: ~2-3 Hours

| Task | Time |
|------|------|
| Download sample video | 10 min |
| Configure edge device | 10 min |
| Add fake equipment logic | 30 min |
| Run all services | 10 min |
| Seed dashboard data | 15 min |
| Test & polish | 30 min |
| **Total** | **~2 hours** |

---

## 📁 Project Structure
```
sih26245-training-monitor/
├── backend/          # Fastify API (port 3000)
├── frontend/         # React Dashboard (port 5173)
├── edge-device/      # Python YOLO inference
│   ├── config.yaml
│   ├── test_videos/
│   └── src/
└── 1-DAY-DEMO-GUIDE.md   ← THIS FILE
```

---

## 🚀 QUICK START

### 1. Backend (Terminal 1)
```bash
cd D:\sihproject\backend
npm run dev
```
→ Wait for: `🚀 Server running on http://localhost:3000`

### 2. Frontend (Terminal 2)
```bash
cd D:\sihproject\frontend
npm run dev
```
→ Opens: http://localhost:5173

### 3. Edge Device (Terminal 3)
```bash
cd D:\sihproject\edge-device
pip install ultralytics mediapipe opencv-python-headless onnxruntime requests pyyaml loguru
python src/main.py
```
→ Should show: `🔌 Client connected`, detection logs

---

## 📥 STEP 1: Get Sample Video (2 min)

```bash
mkdir -p D:\sihproject\edge-device\test_videos

# Option A: Download (if internet)
cd D:\sihproject\edge-device\test_videos
curl -L -o people.mp4 "https://github.com/ultralytics/assets/releases/download/v0.0.0/people.mp4"

# Option B: Use your own 30-sec phone video
# Copy to: D:\sihproject\edge-device\test_videos\my_video.mp4
```

---

## ⚙️ STEP 2: Update Edge Config (5 min)

**File:** `D:\sihproject\edge-device\config.yaml`

```yaml
cameras:
  - id: "demo-cam"
    name: "Demo Camera"
    rtsp_url: "test_videos/people.mp4"   # or "my_video.mp4"
    enabled: true
    fps: 10
    inference_interval: 1

models:
  person_detection:
    path: "yolov8n.pt"
    confidence_threshold: 0.35
    classes: [0]
  
  pose_estimation:
    path: "yolov8n-pose.pt"
    confidence_threshold: 0.35
  
  equipment_detection:
    path: "yolov8n.pt"
    confidence_threshold: 0.3
    classes: [56, 63, 62, 68, 69, 74, 73]  # COCO: chair, laptop, tv, etc.

communication:
  mode: "http"
  http:
    endpoint: "http://localhost:3000/api/v1"
    timeout: 30

low_bandwidth:
  enabled: false
```

---

## 🤖 STEP 3: Add Fake Equipment Logic (30 min)

**File:** `D:\sihproject\edge-device\src\pipeline\video_processor.py`

**Add this method inside `VideoProcessor` class:**

```python
async def _process_infrastructure(self, frame: np.ndarray):
    """Fake equipment detection for demo - replace real detection"""
    current_time = time.time()
    if current_time - self.last_infrastructure_check < self.detection_config.infrastructure.interval_seconds:
        return
    self.last_infrastructure_check = current_time

    # Get person boxes from person detection
    person_detections = self.detectors['person'].detect_in_roi(frame, self.camera_config.roi or [])
    person_boxes = [det.bbox for det in person_detections]

    # Predefined equipment zones (adjust coordinates for your video)
    h, w = frame.shape[:2]
    equipment_zones = [
        {"name": "workbench", "bbox": [int(w*0.1), int(h*0.5), int(w*0.3), int(h*0.3)], "class": "workbench"},
        {"name": "lathe_machine", "bbox": [int(w*0.6), int(h*0.4), int(w*0.25), int(h*0.35)], "class": "lathe_machine"},
        {"name": "welding_machine", "bbox": [int(w*0.75), int(h*0.6), int(w*0.2), int(h*0.25)], "class": "welding_machine"},
        {"name": "safety_helmet", "bbox": [int(w*0.05), int(h*0.1), int(w*0.1), int(h*0.1)], "class": "safety_helmet"},
        {"name": "fire_extinguisher", "bbox": [int(w*0.9), int(h*0.8), int(w*0.08), int(h*0.15)], "class": "fire_extinguisher"},
        {"name": "computer", "bbox": [int(w*0.4), int(h*0.2), int(w*0.2), int(h*0.2)], "class": "computer"},
    ]

    import random, uuid
    for eq in equipment_zones:
        detected = random.random() < 0.9
        person_nearby = any(
            self._boxes_overlap(eq["bbox"], pbox, threshold=150)
            for pbox in person_boxes
        )
        operability = "functional" if (detected and person_nearby) else ("unknown" if detected else "missing")

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "infrastructure",
            "centre_id": "demo-centre",
            "camera_id": self.camera_config.id,
            "timestamp": current_time,
            "data": {
                "item_class": eq["class"],
                "item_class_id": 0,
                "bbox": eq["bbox"],
                "confidence": round(random.uniform(0.75, 0.95), 2),
                "operability": operability,
                "operability_confidence": 0.85,
                "person_nearby": person_nearby
            }
        }
        await self._send_event(event)
```

**Then in `_process_frame()` replace infrastructure call:**

```python
# Replace: await self._process_infrastructure(frame)
# With:
await self._process_infrastructure(frame)
```

---

## 🗄️ STEP 4: Seed Dashboard Data (5 min)

```bash
cd D:\sihproject\backend
npx prisma db seed
```

This creates:
- Admin: `admin@sih.gov.in` / `admin123`
- Officer: `officer@sih.gov.in` / `officer123`
- 3 centres with cameras & inventory

---

## 🌐 STEP 5: Test Full Flow

### 1. Open Dashboard
```
http://localhost:5173/login
```
Login: `admin@sih.gov.in` / `admin123`

### 2. Verify Pages Work
| Page | URL | Should Show |
|------|-----|-------------|
| Dashboard | `/` | Live stats, recent activity |
| Centres | `/centres` | 3 centres with cameras |
| Attendance | `/attendance` | Empty table (add via API) |
| Infrastructure | `/infrastructure` | Equipment status |
| Alerts | `/alerts` | Any triggered alerts |
| Map | `/map` | 3 centres on India map |
| Analytics | `/analytics` | Charts |

### 3. Add Test Attendance (Browser Console)
```javascript
// Run in browser console after login
const token = localStorage.getItem('auth-storage');
const auth = JSON.parse(token).state.accessToken;

fetch('http://localhost:3000/api/v1/attendance', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth}`
  },
  body: JSON.stringify({
    centreId: 'TC-DEL-001',
    date: '2026-10-10',
    session: 'MORNING',
    recordedCount: 25
  })
}).then(r => r.json()).then(console.log);
```

---

## 🎭 DEMO SCRIPT (What to Show)

### 1. Login & Dashboard (30 sec)
- Login as admin
- Show real-time stats updating

### 2. Live Detection (1 min)
- Point to edge terminal: "Real YOLOv8n running on CPU"
- Show person count changing in dashboard
- Explain: "No cloud, runs on edge device"

### 3. Attendance Discrepancy (1 min)
- Go to Attendance page
- Show recorded vs detected mismatch
- Click alert badge → Alerts page

### 4. Infrastructure Compliance (1 min)
- Go to Infrastructure page
- Show equipment status (functional/missing)
- Explain operability logic (person nearby = functional)

### 5. Map View (30 sec)
- Go to Map page
- Show all centres with status colors

### 6. Analytics (30 sec)
- Go to Analytics page
- Show charts, compliance rates

---

## 🔧 TROUBLESHOOTING

| Issue | Fix |
|-------|-----|
| Port 3000 in use | `Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess \| Stop-Process -Force` |
| Edge can't connect | Check backend running on 3000, firewall off |
| No video | Check `test_videos/people.mp4` exists |
| No detections | Lower `confidence_threshold` to 0.25 |
| Frontend blank | Login at `/login` first |
| Prisma error | `cd backend && npx prisma db push && npx prisma db seed` |

---

## 📋 MINIMUM VIABLE CHECKLIST

- [ ] Backend running on :3000
- [ ] Frontend running on :5173
- [ ] Edge device processing video
- [ ] Person count updates in dashboard
- [ ] Equipment status shows in Infrastructure
- [ ] Alerts appear for discrepancies
- [ ] Map shows 3 centres
- [ ] Login works for both roles

---

## 💡 PRO TIPS FOR DEMO DAY

1. **Record your own 30-sec video** - more impressive than downloaded
2. **Open edge terminal** - shows real inference logs
3. **Prepare screenshots** - backup if something fails
4. **Explain privacy** - "Face blurring, no facial recognition, local processing"
5. **Highlight low bandwidth** - "Metadata only mode for rural centres"

---

## 🎬 BACKUP PLAN (If Edge Fails)

**Hardcode demo data in backend:**

```typescript
// backend/src/modules/dashboard/service.ts
// In getDashboardSummary() return:
return {
  overview: { totalCentres: 3, activeCentres: 3, totalCameras: 9, onlineCameras: 8, cameraUptime: 89 },
  attendance: { totalRecords: 150, discrepancyBreakdown: { VERIFIED: 120, DISCREPANT: 15, PENDING: 15 } },
  alerts: { total: 8, open: 3, critical: 1 },
  recentAttendance: [...],  // mock array
  recentAlerts: [...]
}
```

---

## 📞 QUICK COMMANDS REFERENCE

```bash
# Kill port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Reset database
cd backend && npx prisma db push --force-reset && npx prisma db seed

# View edge logs
cd edge-device && python src/main.py 2>&1 | head -50

# Test API
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@sih.gov.in","password":"admin123"}'
```

---

## ✅ DONE! 

You now have a working demo with:
- **Real AI**: YOLOv8n (person) + MediaPipe (pose)
- **Real backend**: Fastify + SQLite + WebSocket
- **Real frontend**: React + charts + maps
- **Simulated equipment**: Realistic but faked for demo

**Total setup: ~2 hours** 

Good luck! 🚀