# SIH26245 - AI-Based Real-Time Monitoring of Training Centres

## Project Overview

This project implements an AI-based video analytics system for real-time monitoring of government-funded training centres. The system detects attendance discrepancies and infrastructure compliance issues using camera feeds, with privacy-preserving design and low-bandwidth deployment support.

## Problem Statement

Government skilling schemes rely on geographically dispersed training centres that are only periodically inspected. This creates integrity risks:
- **Attendance fraud**: Records don't reflect actual physical presence
- **Infrastructure gaps**: Approved equipment/facilities not consistently available
- **Manual inspection limitations**: Resource-intensive, cannot catch issues between visits

## Solution Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Training Centre│     │   Edge Device    │     │   Cloud Backend    │
│                 │     │  (Raspberry Pi/  │     │   (Node.js API)    │
│  IP Cameras ───▶│     │   Jetson/Old PC) │     │                    │
│                 │     │                  │     │  ┌──────────────┐  │
│  - RTSP Feeds   │     │  - YOLOv8n       │     │  │ Ingest       │  │
│  - ROI Config   │────▶│  - MediaPipe     │────▶│  │ Analytics    │  │
│                 │     │  - Face Blur     │     │  │ Alerts       │  │
│                 │     │  - MQTT/HTTP     │     │  │ Dashboard    │  │
└─────────────────┘     └──────────────────┘     │  └──────────────┘  │
                                                  └────────┬─────────┘
                                                           │
                                                  ┌────────▼─────────┐
                                                  │  React Dashboard │
                                                  │  (Monitoring UI) │
                                                  └──────────────────┘
```

## Key Features

### 🎯 Attendance Monitoring
- Real-time person detection using YOLOv8n (ONNX)
- Cross-checks detected count vs submitted records
- Configurable discrepancy thresholds
- Session-based tracking (Morning/Afternoon/Evening)

### 🏭 Infrastructure Compliance
- Equipment detection (workbenches, machinery, safety gear)
- Operability assessment (person nearby = operational)
- Periodic compliance checks against sanctioned inventory
- Thumbnail evidence generation

### 🔒 Privacy-Preserving Design
- **No facial recognition**: Only aggregate counts
- **Face blurring**: MediaPipe face detection + Gaussian blur at edge
- **Local processing**: Raw video never leaves edge device
- **Minimal data**: Only counts, bounding boxes, blurred thumbnails stored

### 📱 Low-Bandwidth Deployment
- **Event-only mode**: Metadata + thumbnails (~50-200 kbps)
- **Metadata-only mode**: JSON events only (~1-10 kbps)
- **Offline buffering**: Local queue with sync on reconnect
- **Adaptive frame skipping**: Configurable inference intervals

### 📊 Monitoring Dashboard
- Real-time centre map with status indicators
- Attendance trends and discrepancy analytics
- Infrastructure compliance rates by category
- Alert management with acknowledgment workflow
- Role-based access (Admin, Monitoring Officer, Centre Manager)

## Technology Stack

### Backend (Node.js)
- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify (high performance)
- **Database**: PostgreSQL 15 + TimescaleDB (time-series)
- **Cache/Queue**: Redis 7 + BullMQ
- **Storage**: MinIO (S3-compatible)
- **Real-time**: Socket.io
- **Auth**: JWT with refresh tokens
- **Validation**: Zod schemas
- **ORM**: Prisma

### Frontend (React)
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **UI**: Tailwind CSS + shadcn/ui
- **State**: TanStack Query + Zustand
- **Charts**: Recharts
- **Maps**: Leaflet + React-Leaflet
- **Forms**: React Hook Form + Zod

### Edge Device (Python)
- **Inference**: ONNX Runtime + Ultralytics YOLO
- **Computer Vision**: OpenCV
- **Pose/Face**: MediaPipe
- **Communication**: MQTT (paho-mqtt) + HTTP (aiohttp)
- **Config**: Pydantic + YAML
- **Logging**: Loguru

## AI Models Used

| Task | Model | Size | Speed (CPU) | Accuracy |
|------|-------|------|-------------|----------|
| Person Detection | YOLOv8n | 6.2 MB | ~45 FPS | Good |
| Pose Estimation | YOLOv8n-Pose / MediaPipe | 6-10 MB | ~30-40 FPS | Good |
| Equipment Detection | YOLOv8n (custom) | 6.2 MB | ~45 FPS | Good |
| Face Detection | MediaPipe | ~10 MB | ~30 FPS | Good |

All models are **free, open-source, and run locally** on CPU/edge devices.

## Project Structure

```
sih26245-training-monitor/
├── backend/                 # Node.js API
│   ├── src/
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Authentication
│   │   │   ├── centres/     # Centre management
│   │   │   ├── attendance/  # Attendance records
│   │   │   ├── infrastructure/ # Infrastructure checks
│   │   │   ├── alerts/      # Alert management
│   │   │   └── dashboard/   # Dashboard APIs
│   │   ├── shared/          # Shared utilities
│   │   └── config/          # Configuration
│   ├── prisma/              # Database schema
│   └── Dockerfile
│
├── frontend/                # React Dashboard
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── services/        # API services
│   │   ├── store/           # State management
│   │   └── types/           # TypeScript types
│   └── Dockerfile
│
├── edge-device/             # Python Edge Inference
│   ├── src/
│   │   ├── detectors/       # AI detectors
│   │   ├── privacy/         # Face blurring
│   │   ├── communication/   # MQTT/HTTP clients
│   │   ├── pipeline/        # Video processing
│   │   └── utils/           # Utilities
│   ├── config.yaml          # Configuration
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml       # Local development
├── docker-compose.prod.yml  # Production
└── PROJECT_PLAN.md          # Detailed architecture
```

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.10+ (for edge device development)

### Quick Start (Docker)

```bash
# Clone and navigate
cd sih26245-training-monitor

# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access services
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# API Docs: http://localhost:3000/docs
# MinIO Console: http://localhost:9001
# MQTT Broker: localhost:1883
```

### Default Credentials
- **Admin**: admin@sih.gov.in / admin123
- **Officer**: officer@sih.gov.in / officer123

### Local Development

```bash
# Install dependencies
npm install

# Start database
docker-compose up -d postgres redis minio mqtt

# Backend
cd backend
npm run dev

# Frontend (new terminal)
cd frontend
npm run dev

# Edge Device (new terminal)
cd edge-device
pip install -r requirements.txt
python src/main.py
```

## Configuration

### Edge Device (config.yaml)
Key settings:
- Camera RTSP URLs and ROIs
- Model paths and confidence thresholds
- Privacy settings (face blur, data retention)
- Communication mode (MQTT/HTTP/both)
- Low bandwidth options
- Buffer settings for offline operation

### Backend (.env)
Key settings:
- Database connection
- JWT secrets
- MinIO credentials
- Detection thresholds
- API ports

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Current user

### Centres
- `GET /api/v1/centres` - List centres
- `POST /api/v1/centres` - Create centre
- `GET /api/v1/centres/:id` - Get centre
- `PATCH /api/v1/centres/:id` - Update centre
- `GET /api/v1/centres/:id/cameras` - List cameras
- `GET /api/v1/centres/:id/inventory` - Get inventory

### Attendance
- `GET /api/v1/attendance` - List records
- `POST /api/v1/attendance` - Submit record
- `GET /api/v1/attendance/centre/:id/summary` - Centre summary
- `GET /api/v1/attendance/centre/:id/discrepancies` - Discrepancies

### Infrastructure
- `GET /api/v1/infrastructure/checks` - List checks
- `GET /api/v1/infrastructure/centre/:id/status` - Centre status
- `GET /api/v1/infrastructure/centre/:id/compliance` - Compliance rate

### Alerts
- `GET /api/v1/alerts` - List alerts
- `POST /api/v1/alerts/:id/acknowledge` - Acknowledge
- `POST /api/v1/alerts/:id/resolve` - Resolve

### Dashboard
- `GET /api/v1/dashboard/summary` - Overview stats
- `GET /api/v1/dashboard/centres/map` - Map data
- `GET /api/v1/dashboard/attendance/trends` - Trends
- `GET /api/v1/dashboard/infrastructure/compliance` - Compliance

### WebSocket Events
- `ws://localhost:3000/ws` - Real-time updates
- Events: `attendance:update`, `infrastructure:update`, `alert:new`

## Deployment

### Production (Docker Compose)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes (K3s for Edge)
```bash
# Edge device deployment
kubectl apply -f k8s/edge-device.yaml

# Backend services
kubectl apply -f k8s/backend.yaml
```

### Edge Device Hardware Requirements
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores (ARM64/x64) | 4+ cores |
| RAM | 2 GB | 4+ GB |
| Storage | 8 GB | 16+ GB |
| GPU | Optional | Jetson Orin / T4 |
| Network | 1 Mbps | 10+ Mbps |

Supported platforms: Raspberry Pi 4, Jetson Nano/Orin, x86_64 laptops/servers

## Model Training (Equipment Detection)

1. **Collect data**: Capture images of equipment at centres
2. **Annotate**: Use CVAT/LabelImg/roboflow
3. **Train**: `yolo train model=yolov8n.pt data=data.yaml epochs=100`
4. **Export**: `yolo export model=best.pt format=onnx`
5. **Deploy**: Copy to `edge-device/models/yolov8n-equipment.onnx`
6. **Update config**: Add class names to `config.yaml`

## Accuracy Assessment

Target metrics for prototype:
- Person Count MAE: < 1.5 persons
- Person Count MAPE: < 15%
- Equipment Detection mAP@0.5: > 0.70
- False Positive Rate: < 10%
- False Negative Rate: < 20%
- Inference Latency: < 100ms/frame
- Bandwidth (metadata mode): < 10 kbps

## Privacy Compliance

- **GDPR Ready**: Data minimization, purpose limitation
- **DPDP Act 2023**: India's data protection compliance
- **No PII**: No facial recognition, no biometric data
- **Audit Trail**: All access logged
- **Data Retention**: Configurable (default 2 years for audit)

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests: `npm test` / `pytest`
5. Submit PR

## License

Government of India - Ministry of Skill Development and Entrepreneurship

## Support

For issues and questions:
- Create GitHub issue
- Contact: sarim.moin@msde.gov.in

---

**SIH26245** - Building trustworthy skill development monitoring through AI#   A i c a m e r a d e t e c t i o n  
 