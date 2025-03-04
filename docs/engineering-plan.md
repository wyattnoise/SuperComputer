# SuperCompute Network — Engineering Improvement Plan

> 本文档记录 SuperCompute Network 从"概念仓库"升级为"可运行、可测量、有算法创新的分布式计算原型系统"的全过程。

---

## 1. 项目目标

SuperCompute Network 的目标是构建一个：

**轻量级分布式计算调度系统（Distributed Compute Scheduling System）**

核心能力：
- 分布式任务调度
- 节点管理与心跳检测
- 网络通信（RPC）
- 任务执行与结果回传
- 基础容错与重试机制

---

## 2. 当前状态

### 已实现 ✅

| 模块 | 状态 | 说明 |
|------|------|------|
| Core | ✅ | Task 状态机, Node 心跳/评分, Scheduler 4 策略 |
| Queue | ✅ | PriorityQueue, FIFO, 重试追踪 |
| Network | ✅ | RPC 层 (InProcess + HTTP transport) |
| Runtime | ✅ | Cluster 双线程 (heartbeat + schedule), Worker |
| Config | ✅ | YAML 配置, Pydantic 模型 |
| Logging | ✅ | 结构化 JSON 日志 |
| Metrics | ✅ | 吞吐量/延迟/P99/失败率 |
| API | ✅ | FastAPI REST (tasks/nodes/stats) |
| CLI | ✅ | start-cluster / submit / benchmark |
| Tests | ✅ | 12 单测 + 集成测试 |
| Benchmark | ✅ | 多节点吞吐量模拟 |
| Demo | ✅ | hello_world.py 稳定运行 |
| README | ✅ | 架构图 + CLI 文档 + 路线图 |

### 待完成 🔜

| 模块 | 状态 | 说明 |
|------|------|------|
| GPU-aware scheduling | 🔜 | CUDA 内存感知, LLM batching |
| Distributed transport | 🔜 | WebSocket/gRPC 真实网络 |
| Persistence | 🔜 | Redis 队列持久化 / SQLite 结果存储 |
| P2P discovery | 🔜 | Gossip 协议节点发现 |

---

## 3. 核心系统设计

### 3.1 Task 状态机

```
PENDING → QUEUED → RUNNING → COMPLETED
                         ↘ FAILED → RETRYING → QUEUED (if retries < max)
                                    ↘ FAILED (if exhausted)
```

### 3.2 自适应调度评分

```
score = α × cpu_load + β × queue_length + γ × failure_rate
where: α = 0.5, β = 0.3, γ = 0.2
```

选择最低 score 的节点执行任务。

### 3.3 节点心跳机制

每个节点每 5s 发送心跳。超过 30s 未收到 → 标记 DEAD → 任务重新分配。

### 3.4 任务队列

基于 `heapq` 的优先级队列：
- 4 级优先级 (LOW=0, NORMAL=1, HIGH=2, CRITICAL=3)
- 同优先级 FIFO
- 内置重试跟踪 (max_retries=3)

### 3.5 RPC 通信层

```
submit_task(task) → task_id
get_result(task_id) → result
heartbeat(node_id) → ACK
```

支持两种传输: InProcess (开发) / HTTP (生产)

---

## 4. Benchmark 结果

模拟吞吐量（200 tasks/run, score_based 策略）：

```
Nodes | Throughput   | Avg Latency | P99 Latency
------+-------------+------------+-----------
    1 | 34964 tas/s  |      0.02ms |      0.03ms
    2 | 34482 tasks/s|      0.02ms |      0.03ms
    4 | 33909 tasks/s|      0.02ms |      0.03ms
    8 | 32561 tasks/s|      0.02ms |      0.03ms
   16 | 30198 tasks/s|      0.03ms |      0.03ms
```

---

## 5. 开发规范

### 5.1 日志规范

所有日志使用结构化 JSON 格式：

```json
{"time": "2026-06-25T23:30:00", "level": "INFO", "name": "supercompute.scheduler",
 "message": {"event": "task_assigned", "task_id": "task-abc123", "node_id": "node-1"}}
```

### 5.2 配置规范

所有参数通过 YAML config 管理，不硬编码。

### 5.3 错误处理规范

- 所有错误可记录 (logger)
- 所有失败可恢复 (retry up to max_retries)
- 所有异常可追踪 (task_id 贯穿全过程)

### 5.4 测试规范

- 单测: 验证状态机、评分算法、边界条件
- 集成测试: 完整 cluster 生命周期
- Benchmark: 吞吐量 + 延迟 + 失败率

---

## 6. 升级路线图

### Phase 1 — 基础可运行 ✅
- [x] scheduler + node + task 核心抽象
- [x] hello_world demo 稳定运行

### Phase 2 — 工程化 ✅
- [x] 独立任务队列 (queue/task_queue.py)
- [x] 节点心跳检测 + 失败恢复
- [x] 结构化日志 (observability/logger.py)
- [x] YAML 配置系统 (config/config.yaml)
- [x] 指标系统 (observability/metrics.py)

### Phase 3 — 系统化 ✅
- [x] 失败自动恢复 + 重试
- [x] Benchmark 套件
- [x] 12 个自动化测试
- [x] REST API
- [x] CLI 工具

### Phase 4 — 创新层 🔜
- [ ] GPU-aware 调度 (CUDA memory, tensor cores)
- [ ] LLM inference batching
- [ ] Latency-aware edge/cloud 路由
- [ ] Gossip 协议 P2P 节点发现
- [ ] 持久化队列 (Redis)

---

## 7. 项目定位

升级完成后，本项目定位为：

> **轻量级分布式计算调度系统**
> - 可运行 infra prototype
> - 系统设计展示 / 简历项目
> - 具备 research-level scheduler 扩展能力

---

*最后更新: 2026-06-25*



