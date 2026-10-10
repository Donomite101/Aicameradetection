# AI-Based Real-Time Monitoring of Training Centres - Project Plan

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRAINING CENTRE SIDE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  IP Cameras / CCTV  →  Edge Device (Raspberry Pi / Jetson / Old Laptop)    │
│                              ↓                                              │
│                    Local Inference (YOLOv8n / MediaPipe)                   │
│                              ↓                                              │
│                    Compressed Events + Thumbnails                          │
│                              ↓                                              │
│                    MQTT / HTTP → Cloud Backend                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLOUD BACKEND (Node.js)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Ingest    │  │  Analytics  │  │  Alert      │  │  Dashboard  │        │
│  │   Service   │  │  Engine     │  │  Manager    │  │  API        │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│         ↓               ↓               ↓               ↓                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL + Redis + MinIO/S3                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REACT DASHBOARD                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Real-time Centre Map → Centre Detail → Alerts → Reports → Settings        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Free AI Models Selection

### 1. Person Detection & Counting (Attendance)
| Model | Size | Speed (CPU) | Accuracy | Use Case |
|-------|------|-------------|----------|----------|
| **YOLOv8n (nano)** | 6.2 MB | ~45 FPS | Good | Primary detector |
| **YOLOv8s (small)** | 21.5 MB | ~25 FPS | Better | Higher accuracy needs |
| **MediaPipe Object Detection** | ~10 MB | ~30 FPS | Good | Mobile/Edge optimized |
| **OpenCV DNN + MobileNet-SSD** | 5 MB | ~20 FPS | Decent | Fallback/Ultra-low end |

**Recommendation**: **YOLOv8n** - Best balance of speed/accuracy, ONNX exportable, runs on CPU

### 2. Pose Estimation (Engagement/Activity)
| Model | Size | Speed | Use Case |
|-------|------|-------|----------|
| **MediaPipe Pose** | ~10 MB | ~30 FPS | Sitting/standing detection |
| **YOLOv8n-pose** | 6.2 MB | ~40 FPS | Keypoint detection |
| **MoveNet Lightning** | 5 MB | ~50 FPS | Real-time pose |

**Recommendation**: **MediaPipe Pose** - Most reliable, well-documented

### 3. Object Detection (Infrastructure/Equipment)
| Model | Approach |
|-------|----------|
| **YOLOv8n custom-trained** | Train on equipment classes (workbench, lathe, welding machine, etc.) |
| **YOLO-World** | Zero-shot detection with text prompts |
| **OWL-ViT** | Open-vocabulary detection |

**Recommendation**: **YOLOv8n custom** for known equipment + **YOLO-World** for flexible detection

### 4. Privacy-Preserving
- **MediaPipe Face Detection** → Blur faces before storage
- **No facial recognition** - Only aggregate counts
- **Local processing** - Raw video never leaves edge device

---

## Technology Stack

### Backend (Node.js)
```
Runtime: Node.js 20+ (LTS)
Framework: Fastify (faster than Express)
Database: PostgreSQL 15+ (TimescaleDB for time-series)
Cache/Queue: Redis 7+ (BullMQ for job queue)
Storage: MinIO (S3-compatible) for thumbnails/clips
ML Inference: ONNX Runtime Node.js / Python microservice
Real-time: Socket.io / Server-Sent Events
Auth: JWT + RBAC
Logging: Pino
Validation: Zod
Testing: Vitest
```

### Frontend (React)
```
Framework: React 18 + TypeScript
Build: Vite
UI: Tailwind CSS + shadcn/ui (accessible, customizable)
State: TanStack Query (server state) + Zustand (client state)
Charts: Recharts / Tremor
Maps: Leaflet / MapLibre GL
Real-time: Socket.io-client
Forms: React Hook Form + Zod
Routing: React Router v6
```

### Edge Device (Python)
```
Language: Python 3.10+
Inference: ONNX Runtime / Ultralytics YOLO
Video: OpenCV / FFmpeg
Communication: paho-mqtt / requests
Config: YAML
Logging: loguru
```

---

## Project Structure

```
sih26245-training-monitor/
├── docs/
│   ├── architecture.md
│   ├── api-spec.yaml
│   ├── privacy-design.md
│   ├── deployment-guide.md
│   └── accuracy-assessment.md
├── edge-device/                 # Python edge inference
│   ├── src/
│   │   ├── detectors/
│   │   │   ├── person_detector.py
│   │   │   ├── pose_estimator.py
│   │   │   └── equipment_detector.py
│   │   ├── privacy/
│   │   │   └── face_blur.py
│   │   ├── communication/
│   │   │   └── mqtt_client.py
│   │   ├── config.yaml
│   │   └── main.py
│   ├── models/                  # ONNX models
│   ├── requirements.txt
│   └── Dockerfile
├── backend/                     # Node.js API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── centres/
│   │   │   ├── attendance/
│   │   │   ├── infrastructure/
│   │   │   ├── alerts/
│   │   │   ├── dashboard/
│   │   │   └── auth/
│   │   ├── shared/
│   │   │   ├── database/
│   │   │   ├── queue/
│   │   │   ├── storage/
│   │   │   └── websocket/
│   │   ├── config/
│   │   └── app.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── Dockerfile
├── frontend/                    # React Dashboard
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── Centres/
│   │   │   ├── CentreDetail/
│   │   │   ├── Alerts/
│   │   │   ├── Reports/
│   │   │   └── Settings/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── charts/
│   │   │   └── maps/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── store/
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

---

## Data Flow & Processing Pipeline

### 1. Attendance Monitoring Flow
```
Camera Frame (30 FPS)
    ↓
[Edge] YOLOv8n Person Detection (every 2nd frame = 15 FPS)
    ↓
Count persons in ROI (Region of Interest - training area)
    ↓
Track IDs across frames (ByteTrack / BoT-SORT)
    ↓
Aggregate: unique persons per 5-min window
    ↓
Compare with submitted attendance record
    ↓
If discrepancy > threshold → Generate Alert
    ↓
Send event: { centreId, timestamp, detectedCount, recordedCount, confidence }
```

### 2. Infrastructure Compliance Flow
```
Camera Frame (1 FPS - periodic)
    ↓
[Edge] YOLOv8n Equipment Detection (custom classes)
    ↓
Detect: workbench, lathe, milling, welding, seating, safety_equipment
    ↓
Check operability heuristics:
  - Workbench: clear surface vs cluttered
  - Machinery: person nearby + pose = operating
  - Seating: occupied vs empty count
    ↓
Compare with sanctioned inventory
    ↓
If missing/non-functional → Generate Alert
    ↓
Send event with annotated thumbnail
```

### 3. Privacy-Preserving Pipeline
```
Raw Frame
    ↓
[Edge] MediaPipe Face Detection
    ↓
Blur/Gaussian mask faces (configurable)
    ↓
[Optional] Body segmentation → Silhouette only
    ↓
Process for analytics (no identity preserved)
    ↓
Store only: counts, bounding boxes (no face crops), thumbnails (blurred)
```

---

## Low-Bandwidth Deployment Modes

| Mode | Upload | Processing | Use Case |
|------|--------|------------|----------|
| **Full Stream** | 500 kbps - 2 Mbps | Cloud | Good connectivity |
| **Event Clips** | 50-200 kbps | Edge + Cloud | Standard |
| **Metadata Only** | 1-10 kbps | Edge only | Very poor connectivity |
| **Scheduled Sync** | Burst | Edge + Cloud | Intermittent connectivity |

### Implementation:
- **Adaptive bitrate**: Adjust based on network quality
- **Edge buffering**: Store events locally, sync when online
- **Model quantization**: INT8 ONNX for faster CPU inference
- **Frame skipping**: Process every N frames based on bandwidth

---

## Database Schema (Prisma)

```prisma
model Centre {
  id            String   @id @default(cuid())
  name          String
  code          String   @unique
  address       String
  latitude      Float
  longitude     Float
  sanctionedCapacity Int
  inventory     InventoryItem[]
  cameras       Camera[]
  attendanceRecords AttendanceRecord[]
  alerts        Alert[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Camera {
  id        String @id @default(cuid())
  centreId  String
  centre    Centre @relation(fields: [centreId], references: [id])
  name      String
  rtspUrl   String
  roi       Json?        // Region of interest polygon
  isActive  Boolean @default(true)
}

model InventoryItem {
  id          String @id @default(cuid())
  centreId    String
  centre      Centre @relation(fields: [centreId], references: [id])
  name        String
  category    String // EQUIPMENT, FURNITURE, SAFETY
  quantity    Int
  specs       Json?
}

model AttendanceRecord {
  id          String @id @default(cuid())
  centreId    String
  centre      Centre @relation(fields: [centreId], references: [id])
  date        DateTime @db.Date
  session     String // MORNING, AFTERNOON, EVENING
  recordedCount Int
  detectedCount Int?
  discrepancy   Int?
  status      String @default("PENDING") // PENDING, VERIFIED, DISCREPANT
  createdAt   DateTime @default(now())
}

model InfrastructureCheck {
  id          String @id @default(cuid())
  centreId    String
  centre      Centre @relation(fields: [centreId], references: [id])
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id])
  timestamp   DateTime @default(now())
  detected    Boolean
  operability String? // FUNCTIONAL, NON_FUNCTIONAL, UNKNOWN
  confidence  Float
  thumbnailUrl String?
}

model Alert {
  id          String @id @default(cuid())
  centreId    String
  centre      Centre @relation(fields: [centreId], references: [id])
  type        String // ATTENDANCE_DISCREPANCY, EQUIPMENT_MISSING, EQUIPMENT_NON_FUNCTIONAL
  severity    String // LOW, MEDIUM, HIGH, CRITICAL
  message     String
  metadata    Json
  status      String @default("OPEN") // OPEN, ACKNOWLEDGED, RESOLVED, FALSE_POSITIVE
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
}
```

---

## API Endpoints

### Centres
```
GET    /api/v1/centres                    # List all centres
POST   /api/v1/centres                    # Create centre
GET    /api/v1/centres/:id                # Get centre details
PATCH  /api/v1/centres/:id                # Update centre
DELETE /api/v1/centres/:id                # Delete centre
GET    /api/v1/centres/:id/cameras        # Get centre cameras
POST   /api/v1/centres/:id/cameras        # Add camera
GET    /api/v1/centres/:id/inventory      # Get sanctioned inventory
```

### Attendance
```
GET    /api/v1/attendance                 # Query attendance records
POST   /api/v1/attendance                 # Submit manual record
GET    /api/v1/attendance/:id             # Get record with detection data
GET    /api/v1/centres/:id/attendance/summary  # Centre attendance summary
WS     /api/v1/attendance/live/:centreId  # Real-time attendance updates
```

### Infrastructure
```
GET    /api/v1/infrastructure/checks      # Query compliance checks
GET    /api/v1/centres/:id/infrastructure/status  # Current compliance status
GET    /api/v1/infrastructure/checks/:id/thumbnail  # Get annotated thumbnail
```

### Alerts
```
GET    /api/v1/alerts                     # List alerts (filterable)
GET    /api/v1/alerts/:id                 # Get alert details
PATCH  /api/v1/alerts/:id/acknowledge     # Acknowledge alert
PATCH  /api/v1/alerts/:id/resolve         # Resolve alert
WS     /api/v1/alerts/live                # Real-time alert stream
```

### Dashboard
```
GET    /api/v1/dashboard/summary          # Overall stats
GET    /api/v1/dashboard/centres/map      # Centres for map view
GET    /api/v1/dashboard/attendance/trends # Attendance trends
GET    /api/v1/dashboard/infrastructure/compliance # Compliance rates
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (monorepo with Turborepo or Nx)
- [ ] Database schema + migrations
- [ ] Basic Fastify API with auth
- [ ] React + Vite + Tailwind setup
- [ ] Docker Compose for local dev

### Phase 2: Core Detection (Week 2-3)
- [ ] Edge device Python service with YOLOv8n
- [ ] Person detection + counting
- [ ] MQTT/HTTP event publishing
- [ ] Backend ingestion service
- [ ] Basic attendance API

### Phase 3: Infrastructure Detection (Week 3-4)
- [ ] Custom equipment detection (YOLOv8n fine-tuned)
- [ ] Operability heuristics
- [ ] Compliance checking logic
- [ ] Thumbnail generation + storage

### Phase 4: Dashboard (Week 4-5)
- [ ] Centre map view
- [ ] Real-time centre detail page
- [ ] Alerts management
- [ ] Reports & trends
- [ ] Settings (ROI config, thresholds)

### Phase 5: Privacy & Optimization (Week 5-6)
- [ ] Face blurring pipeline
- [ ] Low-bandwidth modes
- [ ] Edge buffering + sync
- [ ] Model optimization (INT8 quantization)

### Phase 6: Testing & Documentation (Week 6-7)
- [ ] Accuracy assessment on test dataset
- [ ] Load testing
- [ ] Documentation completion
- [ ] Deployment guides

---

## Key Technical Decisions

### Why Fastify over Express?
- 2x throughput, lower latency
- Built-in validation (JSON Schema)
- Native TypeScript support
- Better plugin ecosystem

### Why PostgreSQL + TimescaleDB?
- ACID compliance for audit trails
- TimescaleDB hypertables for time-series (attendance, checks)
- JSONB for flexible metadata
- PostGIS for geospatial queries (centre maps)

### Why ONNX Runtime over Python for inference?
- Can run in Node.js directly (no Python microservice needed for simple cases)
- But: Python edge service is better for OpenCV/FFmpeg handling
- Hybrid: Python edge → Node.js backend

### Why MQTT over HTTP for edge→cloud?
- Lightweight, pub/sub
- QoS levels for unreliable networks
- Last Will Testament for offline detection
- But: HTTP fallback for simplicity

---

## Sample Dataset for Testing

### Sources:
1. **MOT17/MOT20** - Pedestrian tracking benchmarks
2. **AI City Challenge 2023** - Traffic/people counting
3. **Custom synthetic data** - Blender/Unity rendered training rooms
4. **Public CCTV datasets** - UCSD, PETS2009

### Evaluation Metrics:
| Metric | Target |
|--------|--------|
| Person Count MAE | < 1.5 persons |
| Person Count MAPE | < 15% |
| Equipment Detection mAP@0.5 | > 0.70 |
| False Positive Rate (alerts) | < 10% |
| False Negative Rate (alerts) | < 20% |
| Inference Latency (edge) | < 100ms/frame |
| Bandwidth (metadata mode) | < 10 kbps |

---

## Privacy Design Note (Summary)

### What IS Identified:
- Aggregate person count in defined zones
- Presence/absence of equipment classes
- Occupancy patterns (no identity)

### What IS NOT Identified:
- Individual faces (blurred at edge)
- Person re-identification across cameras
- Biometric data
- Behavioral profiling beyond presence

### Data Retention:
- Raw frames: **Never stored**
- Blurred thumbnails: 30 days
- Aggregate metrics: 2 years (audit requirement)
- Alerts: Until resolved + 1 year

### Compliance:
- GDPR-ready (data minimization, purpose limitation)
- DPDP Act 2023 (India) compliant
- No personal data processing without consent

---

## Next Steps

1. **Initialize monorepo** with package.json workspaces
2. **Set up PostgreSQL + Redis** via Docker
3. **Create Prisma schema** and run migrations
4. **Build Fastify skeleton** with auth module
5. **Set up React + Vite + Tailwind** with shadcn/ui
6. **Download YOLOv8n ONNX** and test inference
7. **Build edge device prototype** on local machine first

---

## Resource Links

### Models
- YOLOv8 ONNX: https://github.com/ultralytics/ultralytics (export: `yolo export model=yolov8n.pt format=onnx`)
- MediaPipe: https://github.com/google/mediapipe
- YOLO-World: https://github.com/AILab-CVC/YOLO-World

### Datasets
- MOT Challenge: https://motchallenge.net/
- AI City Challenge: https://www.aicitychallenge.org/
- VisDrone: https://github.com/VisDrone/VisDrone-Dataset

### Tools
- Roboflow (annotation): https://roboflow.com/
- LabelImg: https://github.com/HumanSignal/labelImg
- CVAT: https://github.com/opencv/cvat

### Deployment
- Kubernetes: K3s for edge
- Docker: Multi-arch builds for arm64 (Jetson/Pi) + amd64
- CI/CD: GitHub Actions